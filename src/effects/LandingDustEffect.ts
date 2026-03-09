import { Sprite, Texture, Rectangle, Container, Assets } from 'pixi.js';
import { TILE_SIZE } from '../utils/TileCoords';

const FRAME_COUNT = 3;
const FRAME_HEIGHT = 8;

interface DustSprite {
  sprite: Sprite;
  tick: number;
  totalTicks: number;
}

/**
 * Small dust puff that plays when the player lands from a ledge jump.
 * 3-frame animation (16×8 each) that dissipates quickly.
 */
export class LandingDustEffect {
  private container: Container;
  private frames: Texture[] = [];
  private active: DustSprite[] = [];

  constructor(container: Container) {
    this.container = container;
  }

  async load(): Promise<void> {
    const tex = await Assets.load('./sprites/landing_dust.png') as Texture;
    tex.source.scaleMode = 'nearest';

    for (let i = 0; i < FRAME_COUNT; i++) {
      this.frames.push(new Texture({
        source: tex.source,
        frame: new Rectangle(0, i * FRAME_HEIGHT, 16, FRAME_HEIGHT),
      }));
    }
  }

  /** Spawn a dust puff at the given tile position. */
  spawn(tileX: number, tileY: number): void {
    if (this.frames.length === 0) return;

    const sprite = new Sprite(this.frames[0]);
    sprite.anchor.set(0, 0);
    // Position at bottom of the tile (feet level)
    sprite.x = tileX * TILE_SIZE;
    sprite.y = tileY * TILE_SIZE + TILE_SIZE - FRAME_HEIGHT;
    // Render in front of player
    sprite.zIndex = tileY * TILE_SIZE + TILE_SIZE + 2;
    this.container.addChild(sprite);

    this.active.push({ sprite, tick: 0, totalTicks: 18 });
  }

  update(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      d.tick++;

      if (d.tick >= d.totalTicks) {
        d.sprite.destroy();
        this.active.splice(i, 1);
        continue;
      }

      const frameIdx = Math.min(
        Math.floor((d.tick / d.totalTicks) * FRAME_COUNT),
        FRAME_COUNT - 1,
      );
      d.sprite.texture = this.frames[frameIdx];
    }
  }

  clear(): void {
    for (const d of this.active) {
      d.sprite.destroy();
    }
    this.active = [];
  }
}
