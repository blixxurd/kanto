import { Application, Container, Text } from 'pixi.js';
import type { GameState, Warp } from './types/game';
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
import { Player } from './entities/Player';
import { PlayerController } from './entities/PlayerController';
import { TileAnimator } from './world/TileAnimator';
import { Editor } from './editor/Editor';
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
  private editor!: Editor;
  private screenManager!: ScreenManager;
  private debugOverlay!: DebugOverlay;

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
    } catch (e) {
      console.warn('Failed to load player sprite:', e);
    }
    this.playerController = new PlayerController(this.player, this.input, this.collisionMap);

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
      this.warpSystem.setPosition(spawnX, spawnY);
    }

    // Camera follows player
    this.camera.follow(this.player.getCenterPixel());
    this.camera.clampToBounds(activeMap.width * TILE_SIZE, activeMap.height * TILE_SIZE);

    // Screen manager (fit-to-window, fullscreen)
    this.screenManager = new ScreenManager(this.app, this.camera);

    // Debug overlay (F3 to cycle: none → collision → zones → tile IDs)
    this.debugOverlay = new DebugOverlay(this.worldContainer, this.camera);
    this.debugOverlay.load(activeMap);
    this.input.onKeyDown('F3', () => this.debugOverlay.toggle());

    // Editor
    this.editor = new Editor(this.worldContainer, this.camera, this.input);
    this.editor.load(activeMap, this.tilemapRenderer);
    this.input.onKeyDown('F1', () => {
      this.editor.toggle();
      if (this.editor.isActive()) {
        this.state = 'editor';
      } else {
        this.state = 'playing';
        this.camera.follow(this.player.getCenterPixel());
      }
    });

    // Warp handler
    this.warpSystem.onWarp.on((warp) => this.handleWarp(warp));

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
      };
    }
  }

  private update(): void {
    switch (this.state) {
      case 'playing':
        this.playerController.update();
        this.camera.follow(this.player.getCenterPixel());
        this.camera.update();
        this.warpSystem.check(this.player.tileX, this.player.tileY, this.player.direction);
        this.zoneSystem.update(this.player.tileX, this.player.tileY);
        break;
      case 'editor':
        this.editor.update();
        this.camera.update();
        break;
      case 'transitioning':
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

  private async handleWarp(warp: Warp): Promise<void> {
    if (this.state === 'transitioning') return;
    this.state = 'transitioning';

    this.transition.fadeOut(0.3, async () => {
      try {
        const spawnPos = await this.mapManager.followWarp(warp.destMap, warp.destWarpId);

        const activeMap = this.mapManager.getActiveMap()!;
        this.collisionMap.load(activeMap);
        this.warpSystem.load(activeMap);
        this.zoneSystem.load(activeMap);
        this.tilemapRenderer.loadMap(activeMap, this.mapManager.getTileTextures());

        // Position camera and render first tiles BEFORE async animation setup.
        // This ensures pixi-tilemap sees non-empty tile buffers on the first render
        // frame, preventing it from caching the tilemap as invalid (is_valid=false).
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

        this.transition.fadeIn(0.3, () => {
          this.state = 'playing';
          // Tell warp system we're already on this tile so it won't re-trigger
          this.warpSystem.setPosition(spawnPos.x, spawnPos.y);
        });
      } catch (e) {
        console.error('Warp failed:', e);
        this.transition.fadeIn(0.3, () => {
          this.state = 'playing';
        });
      }
    });
  }
}
