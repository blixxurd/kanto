import { Sprite, Texture, Rectangle, Container, Assets } from 'pixi.js';
import type { Direction } from '../types/game';
import { TILE_SIZE } from '../utils/TileCoords';

/**
 * Surf blob field effect — the water creature the player rides.
 *
 * Matches GBA behavior from field_effect_helpers.c:
 * - Blob renders at player position, offset 8px down
 * - 2-frame bob animation per direction (48-tick frame duration)
 * - Player bobs in sync: y offset oscillates ±1px every 31 frames
 * - Blob direction syncs with player facing direction
 */

interface BlobAnimDef {
  frames: number[];
  frameDuration: number;
}

const BLOB_ANIMS: Record<Direction, BlobAnimDef> = {
  down:  { frames: [0, 1], frameDuration: 48 },
  up:    { frames: [2, 3], frameDuration: 48 },
  left:  { frames: [4, 5], frameDuration: 48 },
  right: { frames: [6, 7], frameDuration: 48 },
};

export class SurfEffect {
  private blobSprite: Sprite;
  private container: Container;
  private textures: Texture[] = [];
  private loaded = false;

  // Animation state
  private currentDir: Direction = 'down';
  private frameIndex = 0;
  private frameTick = 0;

  // Bob state (matches GBA CreateBobbingEffect)
  private bobTimer = 0;
  private bobDirection = 0; // -1, 0, or 1
  private bobOffset = 0;    // current y2 offset for blob
  private bobInterval = 0;  // 0 = interval of 7, 1 = interval of 15

  private _active = false;

  constructor(container: Container) {
    this.container = container;
    this.blobSprite = new Sprite();
    this.blobSprite.anchor.set(0.5, 1);
    this.blobSprite.visible = false;
  }

  async load(): Promise<void> {
    try {
      const tex = await Assets.load('./sprites/surf_blob.png') as Texture;
      tex.source.scaleMode = 'nearest';

      const frameW = 32;
      const frameH = 32;
      const cols = Math.floor(tex.source.width / frameW);
      for (let i = 0; i < cols; i++) {
        this.textures.push(new Texture({
          source: tex.source,
          frame: new Rectangle(i * frameW, 0, frameW, frameH),
        }));
      }
      this.loaded = true;
    } catch (e) {
      console.warn('Failed to load surf blob sprite:', e);
    }
  }

  get active(): boolean {
    return this._active;
  }

  /** Start surfing — show the blob under the player. */
  start(): void {
    if (!this.loaded || this._active) return;
    this._active = true;
    this.blobSprite.visible = true;
    this.container.addChild(this.blobSprite);
    this.bobTimer = 0;
    this.bobDirection = 0;
    this.bobOffset = 0;
    this.bobInterval = 0;
    this.frameIndex = 0;
    this.frameTick = 0;
  }

  /** Stop surfing — hide the blob. */
  stop(): void {
    if (!this._active) return;
    this._active = false;
    this.blobSprite.visible = false;
    if (this.blobSprite.parent) {
      this.blobSprite.parent.removeChild(this.blobSprite);
    }
    this.bobOffset = 0;
  }

  /**
   * Update blob position and animation.
   * Call every frame while surfing is active.
   * Returns the player's vertical bob offset to apply.
   */
  update(playerPixelX: number, playerPixelY: number, direction: Direction): number {
    if (!this._active || !this.loaded) return 0;

    // Sync direction
    if (direction !== this.currentDir) {
      this.currentDir = direction;
      this.frameIndex = 0;
      this.frameTick = 0;
    }

    // Advance blob animation
    const anim = BLOB_ANIMS[direction];
    this.frameTick++;
    if (this.frameTick >= anim.frameDuration) {
      this.frameTick = 0;
      this.frameIndex = (this.frameIndex + 1) % anim.frames.length;
    }

    // Update blob texture
    const texIdx = anim.frames[this.frameIndex];
    if (texIdx < this.textures.length) {
      this.blobSprite.texture = this.textures[texIdx];
    }

    // Bob animation (from GBA CreateBobbingEffect)
    const intervals = [7, 15];
    this.bobTimer++;
    if ((this.bobTimer & intervals[this.bobInterval]) === 0) {
      this.bobOffset += this.bobDirection;
    }
    if ((this.bobTimer & 0x1F) === 0) {
      this.bobDirection = -this.bobDirection;
      if (this.bobDirection === 0) this.bobDirection = 1;
    }

    // Position blob at player center, 8px below player feet
    this.blobSprite.x = playerPixelX + TILE_SIZE / 2;
    this.blobSprite.y = playerPixelY + TILE_SIZE + 8 + this.bobOffset;
    this.blobSprite.zIndex = playerPixelY + TILE_SIZE - 1;

    // Player bob = blob bob + 1px on second anim frame (matching GBA)
    let playerBob = this.bobOffset;
    if (this.frameIndex !== 0) {
      playerBob += 1;
    }

    return playerBob;
  }
}
