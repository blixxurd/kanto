import { Sprite, Texture, Rectangle, Container, Assets } from 'pixi.js';
import { TILE_SIZE } from '../utils/TileCoords';
import type { MapData } from '../world/MapData';

/** Metatile behavior ID for tall grass (from metatile_behaviors.h) */
const MB_TALL_GRASS = 0x02;
const MB_CYCLING_ROAD_PULL_DOWN_GRASS = 0xD1;

const FRAME_COUNT = 5;
/** Skip frame 1 (100% opaque block that hides the player) */
const PLAY_FRAMES = [0, 2, 3, 4];

interface GrassSprite {
  sprite: Sprite;
  tileX: number;
  tileY: number;
  tick: number;
  totalTicks: number;
}

/**
 * Spawns animated grass overlay sprites when the player steps on tall grass tiles.
 * Mimics the original FireRed field effect: a 16×16 sprite plays a rustling
 * animation on the tile the player stepped onto, then self-destructs.
 *
 * The animation duration scales with the player's movement speed so the effect
 * feels synchronized with walking/running.
 */
export class GrassEffect {
  private container: Container;
  private frames: Texture[] = [];
  private active: GrassSprite[] = [];
  private mapData: MapData | null = null;

  constructor(container: Container) {
    this.container = container;
  }

  async load(): Promise<void> {
    const tex = await Assets.load('./sprites/tall_grass.png') as Texture;
    tex.source.scaleMode = 'nearest';

    // Cut into 5 frames (16×16 each, stacked vertically)
    for (let i = 0; i < FRAME_COUNT; i++) {
      this.frames.push(new Texture({
        source: tex.source,
        frame: new Rectangle(0, i * TILE_SIZE, TILE_SIZE, TILE_SIZE),
      }));
    }
  }

  setMap(mapData: MapData): void {
    this.mapData = mapData;
    for (const g of this.active) {
      g.sprite.destroy();
    }
    this.active = [];
  }

  /** Returns true if the tile at (x,y) is tall grass. */
  isTallGrass(x: number, y: number): boolean {
    if (!this.mapData) return false;
    const b = this.mapData.getBehavior(x, y);
    return b === MB_TALL_GRASS || b === MB_CYCLING_ROAD_PULL_DOWN_GRASS;
  }

  /**
   * Called when the player begins moving onto a new tile.
   * @param moveFrames — how many ticks the player's walk takes; the grass
   *   animation is scaled to roughly match this duration.
   */
  onStep(tileX: number, tileY: number, moveFrames: number): void {
    if (!this.isTallGrass(tileX, tileY)) return;
    if (this.frames.length === 0) return;

    const sprite = new Sprite(this.frames[PLAY_FRAMES[0]]);
    sprite.anchor.set(0, 0);
    sprite.x = tileX * TILE_SIZE;
    sprite.y = tileY * TILE_SIZE;
    this.container.addChild(sprite);

    // Total animation = roughly 3× the step duration so it lingers a bit after
    const totalTicks = moveFrames * 3;

    this.active.push({ sprite, tileX, tileY, tick: 0, totalTicks });
  }

  /** Called when the player spawns on a grass tile (show final frame). */
  onSpawn(tileX: number, tileY: number): void {
    if (!this.isTallGrass(tileX, tileY)) return;
    if (this.frames.length === 0) return;

    const sprite = new Sprite(this.frames[PLAY_FRAMES[PLAY_FRAMES.length - 1]]);
    sprite.anchor.set(0, 0);
    sprite.x = tileX * TILE_SIZE;
    sprite.y = tileY * TILE_SIZE;
    this.container.addChild(sprite);

    const totalTicks = 36; // default duration
    this.active.push({
      sprite, tileX, tileY,
      tick: Math.floor(totalTicks * 0.75),
      totalTicks,
    });
  }

  update(playerTileX: number, playerTileY: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const g = this.active[i];
      g.tick++;

      if (g.tick >= g.totalTicks) {
        g.sprite.destroy();
        this.active.splice(i, 1);
        continue;
      }

      // Map tick progress to animation frames
      const t = g.tick / g.totalTicks;
      const frameListIdx = Math.min(
        Math.floor(t * PLAY_FRAMES.length),
        PLAY_FRAMES.length - 1,
      );
      g.sprite.texture = this.frames[PLAY_FRAMES[frameListIdx]];

      // Depth sort: grass always renders in front of the player when the player
      // is on the same tile or south of it (covering the feet = "wading" look).
      // Only renders behind when the player has moved north past it.
      if (playerTileY >= g.tileY) {
        // Player is at or south of this grass — render in front (covers feet)
        g.sprite.zIndex = g.tileY * TILE_SIZE + TILE_SIZE + 1;
      } else {
        // Player has moved north past this grass — render behind
        g.sprite.zIndex = g.tileY * TILE_SIZE - 1;
      }
    }
  }
}
