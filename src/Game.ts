import { Application, Container, Text } from 'pixi.js';
import type { GameState, WarpEvent } from './types/game';
import type { FadeColor } from './core/TransitionEffect';
import { Input } from './core/Input';
import { Camera } from './core/Camera';
import { AssetLoader } from './core/AssetLoader';
import { TransitionEffect } from './core/TransitionEffect';
import { ScreenManager, RESOLUTION_PRESETS } from './core/ScreenManager';
import { DebugOverlay } from './core/DebugOverlay';
import { TilemapRenderer } from './world/TilemapRenderer';
import { MapManager } from './world/MapManager';
import { CollisionMap } from './world/CollisionMap';
import { WarpSystem } from './world/WarpSystem';
import { ZoneSystem } from './world/ZoneSystem';
import { DoorAnimator } from './world/DoorAnimator';
import { Player } from './entities/Player';
import { PlayerController } from './entities/PlayerController';
import { TileAnimator } from './world/TileAnimator';
import { GrassEffect } from './effects/GrassEffect';
import { LandingDustEffect } from './effects/LandingDustEffect';
import { SurfEffect } from './effects/SurfEffect';
import { MenuStack } from './ui/MenuStack';
import { DebugMenu } from './ui/menus/DebugMenu';
import type { GameActions, SpriteInfo } from './ui/menus/DebugMenu';
import { TILE_SIZE } from './utils/TileCoords';

export class Game {
  private app!: Application;
  private state: GameState = 'booting';

  private input!: Input;
  private camera!: Camera;
  private assetLoader!: AssetLoader;
  private transition!: TransitionEffect;

  private worldContainer!: Container;
  private uiContainer!: Container;
  private tilemapRenderer!: TilemapRenderer;
  private mapManager!: MapManager;
  private collisionMap!: CollisionMap;
  private warpSystem!: WarpSystem;
  private zoneSystem!: ZoneSystem;

  private player!: Player;
  private playerController!: PlayerController;
  private tileAnimator!: TileAnimator;
  private grassEffect!: GrassEffect;
  private landingDust!: LandingDustEffect;
  private doorAnimator!: DoorAnimator;
  private surfEffect!: SurfEffect;
  private screenManager!: ScreenManager;
  private debugOverlay!: DebugOverlay;
  private menuStack!: MenuStack;

  private npcSprites: SpriteInfo[] = [];

  private zoneNameText!: Text;
  private zoneNameTimer = 0;

  async init(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x000000,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: false,
      preference: 'webgl',
    });

    const container = document.getElementById('game-container');
    if (!container) throw new Error('Missing #game-container');
    container.appendChild(this.app.canvas);

    // Scene graph
    this.worldContainer = new Container();
    this.uiContainer = new Container();
    this.app.stage.addChild(this.worldContainer);
    this.app.stage.addChild(this.uiContainer);

    // Core systems
    this.input = new Input();
    this.camera = new Camera(this.worldContainer);
    this.camera.setScreenSize(window.innerWidth, window.innerHeight);
    this.assetLoader = new AssetLoader();
    this.transition = new TransitionEffect(this.uiContainer, 4096, 4096);

    // World systems
    this.tilemapRenderer = new TilemapRenderer(this.worldContainer);
    this.mapManager = new MapManager(this.assetLoader);
    this.collisionMap = new CollisionMap();
    this.warpSystem = new WarpSystem();
    this.zoneSystem = new ZoneSystem();

    // Zone name display
    this.zoneNameText = new Text({
      text: '',
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.zoneNameText.x = 10;
    this.zoneNameText.y = 10;
    this.zoneNameText.alpha = 0;
    this.uiContainer.addChild(this.zoneNameText);

    // Tile animations
    this.tileAnimator = new TileAnimator();
    await this.tileAnimator.load();

    // Field effects
    this.grassEffect = new GrassEffect(this.tilemapRenderer.entityLayer);
    await this.grassEffect.load();
    this.landingDust = new LandingDustEffect(this.tilemapRenderer.entityLayer);
    await this.landingDust.load();
    this.tilemapRenderer.entityLayer.sortableChildren = true;

    // Door animations
    this.doorAnimator = new DoorAnimator(this.tilemapRenderer.entityLayer);
    await this.doorAnimator.load();

    // Surf effect
    this.surfEffect = new SurfEffect(this.tilemapRenderer.entityLayer);
    await this.surfEffect.load();

    // Load overworld
    if (import.meta.env.DEV) console.log('Loading overworld...');
    await this.mapManager.init();
    const activeMap = this.mapManager.getActiveMap()!;
    this.collisionMap.load(activeMap);
    this.warpSystem.load(activeMap);
    this.zoneSystem.load(activeMap);
    this.tilemapRenderer.loadMap(activeMap, this.mapManager.getTileTextures());
    await this.setupAnimations();
    this.tilemapRenderer.refreshAll();

    // Player
    this.player = new Player(this.tilemapRenderer.entityLayer);
    try {
      await this.player.loadSprite('./sprites/player_male.png', './sprites/player.json');
      await this.player.loadSurfSprite('./sprites/player_surf.png');
    } catch (e) {
      console.warn('Failed to load player sprite:', e);
    }
    // Load NPC sprite manifest for debug sprite swap
    try {
      const manifest = await this.assetLoader.loadJSON<{
        sprites: Record<string, { sheet: string; frameWidth: number; frameHeight: number; animated: boolean }>;
      }>('./sprites/npcs/manifest.json');
      this.npcSprites = Object.entries(manifest.sprites)
        .filter(([, v]) => v.animated && v.frameWidth === 16 && v.frameHeight === 32)
        .map(([name, v]) => ({ name, sheet: `./sprites/npcs/${v.sheet}` }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.warn('Failed to load NPC sprite manifest:', e);
    }
    this.playerController = new PlayerController(this.player, this.input, this.collisionMap);
    this.playerController.onStep = (tx, ty, mf) => this.grassEffect.onStep(tx, ty, mf);
    this.playerController.onLand = (tx, ty) => {
      this.landingDust.spawn(tx, ty);
      // Also trigger grass effect on landing if landing in grass
      this.grassEffect.onStep(tx, ty, 12);
    };
    this.grassEffect.setMap(activeMap);

    // Find a passable spawn point in Pallet Town
    const zones = await this.assetLoader.loadJSON<{ zones: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number } }> }>('./data/overworld_zones.json');
    const pallet = zones.zones.find(z => z.id === 'MAP_PALLET_TOWN');
    if (pallet) {
      const cx = pallet.bounds.x + Math.floor(pallet.bounds.width / 2);
      const cy = pallet.bounds.y + Math.floor(pallet.bounds.height / 2);
      // Find nearest passable tile
      let spawnX = cx, spawnY = cy;
      outer: for (let r = 0; r < 20; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (activeMap.isPassable(cx + dx, cy + dy)) {
              spawnX = cx + dx;
              spawnY = cy + dy;
              break outer;
            }
          }
        }
      }
      this.player.setTilePosition(spawnX, spawnY);
      this.warpSystem.setPosition(spawnX, spawnY, this.player.direction);
      this.grassEffect.onSpawn(spawnX, spawnY);
    }

    // Camera follows player
    this.camera.follow(this.player.getCenterPixel());
    this.camera.clampToBounds(activeMap.width * TILE_SIZE, activeMap.height * TILE_SIZE);

    // Screen manager (fit-to-window, fullscreen)
    this.screenManager = new ScreenManager(this.app, this.camera);

    // Debug overlay (F3 to cycle: none → collision → zones → tile IDs)
    this.debugOverlay = new DebugOverlay(this.worldContainer, this.camera);
    this.debugOverlay.load(activeMap);
    this.debugOverlay.attachTooltip(this.uiContainer);
    this.input.onKeyDown('F3', () => this.debugOverlay.toggle());

    // Menu stack
    this.menuStack = new MenuStack(this.uiContainer);
    const gameActions: GameActions = {
      teleport: (x, y) => {
        this.player.setTilePosition(x, y);
        this.camera.panTo(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2);
      },
      getPlayerPos: () => ({ x: this.player.tileX, y: this.player.tileY }),
      getZone: () => this.zoneSystem.getCurrentZone(),
      getScale: () => this.screenManager.getScale(),
      setScale: (s) => this.screenManager.setScale(s),
      toggleDebugOverlay: () => this.debugOverlay.toggle(),
      getDebugMode: () => this.debugOverlay.getMode(),
      getZones: () => this.zoneSystem.getZones(),
      getAvailableSprites: () => this.npcSprites,
      setSprite: (sheet) => { this.player.swapSprite(sheet); },
      getSurfing: () => this.collisionMap.surfing,
      setSurfing: (v) => {
        this.collisionMap.surfing = v;
        if (v) {
          this.player.enterSurf();
          this.surfEffect.start();
        } else {
          this.player.exitSurf();
          this.surfEffect.stop();
        }
      },
    };
    this.input.onKeyDown('`', () => {
      if (this.state === 'playing') {
        this.menuStack.push(new DebugMenu(gameActions, this.screenManager.getScale(), this.menuStack));
        this.state = 'menu';
      } else if (this.state === 'menu') {
        this.menuStack.clear();
      }
    });

    // Warp handler
    this.warpSystem.onWarp.on((event) => this.handleWarp(event));

    // Zone change handler
    this.zoneSystem.onZoneChange.on(({ to }) => {
      if (to?.showNameOnEntry) {
        this.zoneNameText.text = to.name;
        this.zoneNameText.alpha = 1;
        this.zoneNameTimer = 180; // ~3 seconds at 60fps
      }
    });

    // Start
    this.state = 'playing';
    this.app.ticker.add(() => this.update());
    if (import.meta.env.DEV) console.log('Kanto engine initialized');

    // Debug API
    if (import.meta.env.DEV) {
      (window as any).__gameDebug = {
        getState: () => this.state,
        getPlayerPos: () => ({ x: this.player.tileX, y: this.player.tileY }),
        getZone: () => this.zoneSystem.getCurrentZone(),
        getDebugOverlay: () => this.debugOverlay.getMode(),
        getScale: () => this.screenManager.getScale(),
        teleport: (x: number, y: number) => {
          this.player.setTilePosition(x, y);
          this.camera.panTo(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2);
        },
        setScale: (s: number) => this.screenManager.setScale(s),
        setResolution: (preset: keyof typeof RESOLUTION_PRESETS) => {
          const res = RESOLUTION_PRESETS[preset];
          if (res) this.screenManager.setTargetResolution(res.width, res.height);
        },
        toggleDebug: () => this.debugOverlay.toggle(),
        getInputState: () => ({
          direction: this.input.getDirection(),
          holding: this.input.isHoldingDirection(),
          running: this.input.isRunning(),
        }),
      };
    }
  }

  private update(): void {
    switch (this.state) {
      case 'playing': {
        // Phase 1: Complete in-progress movement (may set tookStep)
        this.playerController.updateMovement();

        // Phase 2: Check warps — runs BEFORE new movement starts.
        // This matches GBA: ProcessPlayerFieldInput checks warps then movement.
        // Update facing direction when idle so warp checks see the correct direction.
        if (!this.playerController.isMoving()) {
          const dir = this.input.getDirection();
          if (dir) this.playerController.setFacing(dir);
        }
        this.warpSystem.check(
          this.player.tileX,
          this.player.tileY,
          this.player.direction,
          this.input.isHoldingDirection(),
          this.playerController.tookStep,
        );

        // Phase 3: Start new movement (only if no warp fired)
        if (this.state === 'playing') {
          this.playerController.tryStartMove();
        }

        // Surf effect: update blob position + get player bob offset
        if (this.surfEffect.active) {
          this.player.surfOffset = this.surfEffect.update(
            this.player.pixelX, this.player.pixelY, this.player.direction,
          );
          this.player.updateSpritePosition();
        }

        this.camera.follow(this.player.getCenterPixel());
        this.camera.update();
        this.grassEffect.update(this.player.tileX, this.player.tileY);
        this.landingDust.update();
        this.zoneSystem.update(this.player.tileX, this.player.tileY);
        break;
      }
      case 'menu':
        this.menuStack.handleInput(this.input);
        this.menuStack.update();
        if (this.menuStack.isEmpty()) this.state = 'playing';
        break;

      case 'transitioning':
        // Transition update is driven by the main loop.
        // Camera and effects keep running so door walk animations render properly.
        this.camera.follow(this.player.getCenterPixel());
        this.camera.update();
        this.transition.update();
        break;
    }

    // Tick tile animations — modifies atlas textures in place
    this.tileAnimator.tick();

    // Render tiles for current viewport
    const vp = this.camera.getViewport();
    const viewW = vp.right - vp.left;
    const viewH = vp.bottom - vp.top;
    this.tilemapRenderer.renderViewport(this.camera.x, this.camera.y, viewW, viewH);

    // Debug overlay
    this.debugOverlay.update();

    // Zone name fade
    if (this.zoneNameTimer > 0) {
      this.zoneNameTimer--;
      if (this.zoneNameTimer < 60) {
        this.zoneNameText.alpha = this.zoneNameTimer / 60;
      }
    }

    this.input.poll();
  }

  private async setupAnimations(): Promise<void> {
    await this.tileAnimator.setupForMap(
      this.mapManager.getActiveTilesetRefs(),
      this.mapManager.getTileTextures(),
      (src) => this.tilemapRenderer.getMergedSourceInfo(src),
    );
  }

  private async handleWarp(event: WarpEvent): Promise<void> {
    if (this.state === 'transitioning') return;
    this.state = 'transitioning';

    const { warp, warpType } = event;

    // Determine fade color based on transition direction:
    // Entering indoors (overworld → interior): fade to black
    // Exiting outdoors (interior → overworld): fade to white
    const isExitingToOverworld = this.mapManager.getActiveMode() === 'interior';
    const fadeColor: FadeColor = isExitingToOverworld ? 'white' : 'black';

    try {
      if (warpType === 'door') {
        await this.handleDoorWarp(warp, fadeColor);
      } else {
        await this.handleStandardWarp(warp, fadeColor);
      }
    } catch (e) {
      console.error('Warp failed:', e);
      this.transition.fadeIn(0.3, () => {
        this.state = 'playing';
      }, fadeColor);
    }
  }

  /**
   * Door warp ENTRY sequence (matching GBA Task_DoorWarp from field_fadetransition.c):
   * Player is one tile south of the door, facing north.
   *
   * 1. Open door at warp tile
   * 2. Player walks 1 tile north (onto the door tile)
   * 3. Hide player
   * 4. Close door
   * 5. Fade to black
   * 6. Load destination map
   * 7. Fade in
   */
  private async handleDoorWarp(warp: { destMap: string; destWarpId: number; x: number; y: number }, fadeColor: FadeColor): Promise<void> {
    const activeMap = this.mapManager.getActiveMap()!;
    const doorX = warp.x;
    const doorY = warp.y;
    const doorGid = activeMap.getBottomTile(doorX, doorY);

    // 1. Open door
    await this.doorAnimator.playOpen(doorX, doorY, doorGid, activeMap);

    // 2. Walk player 1 tile north onto the door tile
    await this.animatePlayerWalk('up', 12);

    // 3. Hide player (they're behind the door now)
    this.player.setVisible(false);

    // 4. Close door
    await this.doorAnimator.playClose(doorX, doorY, doorGid, activeMap);

    // 5. Fade to black
    await this.fadeAsync('out', 0.3, fadeColor);

    // 6. Load destination map
    await this.loadWarpDestination(warp.destMap, warp.destWarpId, warp.x, warp.y);

    // 7. Show player + fade in
    this.player.setVisible(true);
    await this.fadeAsync('in', 0.3, fadeColor);

    this.state = 'playing';
  }

  /**
   * Standard warp sequence (ladder, cave, arrow, regular, stair, etc):
   * 1. Fade out
   * 2. Load destination map
   * 3. Fade in
   * 4. If exiting to overworld at a door tile: play exit door animation
   */
  private async handleStandardWarp(warp: { destMap: string; destWarpId: number; x: number; y: number }, fadeColor: FadeColor): Promise<void> {
    const wasInterior = this.mapManager.getActiveMode() === 'interior';

    await this.fadeAsync('out', 0.3, fadeColor);
    await this.loadWarpDestination(warp.destMap, warp.destWarpId, warp.x, warp.y);

    // Check if we landed on a door tile (exiting interior to overworld)
    const activeMap = this.mapManager.getActiveMap()!;
    const doorBehavior = activeMap.getBehavior(this.player.tileX, this.player.tileY);
    const isDoorExit = wasInterior && doorBehavior === 0x69;

    if (isDoorExit) {
      // GBA exit sequence: fade in → wait → door opens → player walks south → door closes
      const doorX = this.player.tileX;
      const doorY = this.player.tileY;
      const doorGid = activeMap.getBottomTile(doorX, doorY);

      this.player.setVisible(false);
      this.player.direction = 'down';
      await this.fadeAsync('in', 0.3, fadeColor);

      // Brief pause before door opens (GBA waits ~25 frames)
      await this.waitFrames(15);

      await this.doorAnimator.playOpen(doorX, doorY, doorGid, activeMap);

      // Show player and walk south out of door
      this.player.setVisible(true);
      await this.animatePlayerWalk('down', 12);

      // Animate door closing after player walks out
      await this.doorAnimator.playClose(doorX, doorY, doorGid, activeMap);

      // Update warp system position so it doesn't re-trigger
      this.warpSystem.setPosition(this.player.tileX, this.player.tileY, this.player.direction);
    } else {
      await this.fadeAsync('in', 0.3, fadeColor);
    }

    this.state = 'playing';
  }

  /** Animate the player walking one tile in a direction. */
  private animatePlayerWalk(direction: 'up' | 'down' | 'left' | 'right', frames: number): Promise<void> {
    return new Promise(resolve => {
      const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
      const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
      const startX = this.player.pixelX;
      const startY = this.player.pixelY;
      const targetX = startX + dx * TILE_SIZE;
      const targetY = startY + dy * TILE_SIZE;
      let progress = 0;

      this.player.direction = direction;
      this.player.playAnimation(`walk_${direction}`);

      const step = () => {
        progress++;
        const t = Math.min(1, progress / frames);
        this.player.pixelX = startX + (targetX - startX) * t;
        this.player.pixelY = startY + (targetY - startY) * t;
        this.player.updateSpritePosition();
        this.player.updateAnimation();

        if (t >= 1) {
          this.player.tileX += dx;
          this.player.tileY += dy;
          this.player.pixelX = targetX;
          this.player.pixelY = targetY;
          this.player.updateSpritePosition();
          this.player.playAnimation(`idle_${direction}`);
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /** Wait a number of animation frames. */
  private waitFrames(count: number): Promise<void> {
    return new Promise(resolve => {
      let n = 0;
      const tick = () => {
        if (++n >= count) { resolve(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /** Promise wrapper for fade transitions. Updated by main loop's 'transitioning' state. */
  private fadeAsync(direction: 'in' | 'out', duration: number, color: FadeColor): Promise<void> {
    return new Promise(resolve => {
      if (direction === 'out') {
        this.transition.fadeOut(duration, resolve, color);
      } else {
        this.transition.fadeIn(duration, resolve, color);
      }
    });
  }

  /** Load destination map and set up player position. */
  private async loadWarpDestination(destMap: string, destWarpId: number, sourceX?: number, sourceY?: number): Promise<void> {
    const spawnPos = await this.mapManager.followWarp(destMap, destWarpId, sourceX, sourceY);

    const activeMap = this.mapManager.getActiveMap()!;
    this.collisionMap.load(activeMap);
    this.warpSystem.load(activeMap);
    this.zoneSystem.load(activeMap);
    this.grassEffect.setMap(activeMap);
    this.landingDust.clear();
    this.doorAnimator.clear();
    this.tilemapRenderer.loadMap(activeMap, this.mapManager.getTileTextures());

    // Position camera and render first tiles BEFORE async animation setup.
    this.player.setTilePosition(spawnPos.x, spawnPos.y);
    this.camera.follow(this.player.getCenterPixel());
    this.camera.clampToBounds(activeMap.width * TILE_SIZE, activeMap.height * TILE_SIZE);
    this.camera.panTo(
      spawnPos.x * TILE_SIZE + TILE_SIZE / 2,
      spawnPos.y * TILE_SIZE + TILE_SIZE / 2,
    );
    this.camera.update();
    this.tilemapRenderer.refreshAll();
    const vp = this.camera.getViewport();
    this.tilemapRenderer.renderViewport(
      this.camera.x, this.camera.y,
      vp.right - vp.left, vp.bottom - vp.top,
    );

    await this.setupAnimations();
    this.debugOverlay.load(activeMap);

    // Tell warp system we're already on this tile so it won't re-trigger
    this.warpSystem.setPosition(spawnPos.x, spawnPos.y, this.player.direction);
  }
}
