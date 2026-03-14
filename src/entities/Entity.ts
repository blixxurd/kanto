import { Sprite, Texture, Rectangle, Container, Assets } from 'pixi.js';
import type { Direction } from '../types/game';
import { TILE_SIZE } from '../utils/TileCoords';

export interface AnimDef {
  frames: number[];
  frameDuration: number;
  loop: boolean;
}

/** Overhead icon types matching the spritesheet columns */
export type OverheadIcon =
  | 'exclamation'
  | 'question_yellow'
  | 'question_blue'
  | 'question_gray'
  | 'speech'
  | 'speech_full'
  | 'sleep'
  | 'treasure'
  | 'star';

const ICON_INDEX: Record<OverheadIcon, number> = {
  exclamation: 0,
  question_yellow: 1,
  question_blue: 2,
  question_gray: 3,
  speech: 4,
  speech_full: 5,
  sleep: 6,
  treasure: 7,
  star: 8,
};

/** Shared overhead icon textures — loaded once, shared by all entities */
let iconTextures: Texture[] | null = null;
let iconLoadPromise: Promise<Texture[]> | null = null;

async function loadIconTextures(): Promise<Texture[]> {
  if (iconTextures) return iconTextures;
  if (iconLoadPromise) return iconLoadPromise;
  iconLoadPromise = (async () => {
    const tex = await Assets.load('./custom/sprites/overhead.png') as Texture;
    tex.source.scaleMode = 'nearest';
    // Single row of 6px-wide icons
    const h = tex.source.height;
    const w = tex.source.width;
    const frameH = h;
    const frameW = 6;
    const count = Math.floor(w / frameW);
    const textures: Texture[] = [];
    for (let i = 0; i < count; i++) {
      textures.push(new Texture({
        source: tex.source,
        frame: new Rectangle(i * frameW, 0, frameW, frameH),
      }));
    }
    iconTextures = textures;
    return textures;
  })();
  return iconLoadPromise;
}

export abstract class Entity {
  tileX = 0;
  tileY = 0;
  pixelX = 0;
  pixelY = 0;
  direction: Direction = 'down';
  sprite: Sprite;

  protected container: Container;
  protected frameW = 16;
  protected frameH = 32;
  protected textures: Texture[] = [];
  protected animations = new Map<string, AnimDef>();
  protected currentAnim = '';
  protected frameIndex = 0;
  protected frameTick = 0;

  private overheadSprite: Sprite | null = null;
  private overheadBobTimer = 0;

  constructor(container: Container) {
    this.container = container;
    this.sprite = new Sprite();
    this.sprite.anchor.set(0, 1);
    container.addChild(this.sprite);
  }

  /** Slice a spritesheet into frame textures */
  protected sliceSheet(source: import('pixi.js').TextureSource, frameW: number, frameH: number): Texture[] {
    const cols = Math.floor(source.width / frameW);
    const rows = Math.floor(source.height / frameH);
    const textures: Texture[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        textures.push(new Texture({
          source,
          frame: new Rectangle(c * frameW, r * frameH, frameW, frameH),
        }));
      }
    }
    return textures;
  }

  playAnimation(name: string): void {
    if (name === this.currentAnim) return;
    this.currentAnim = name;
    this.frameIndex = 0;
    this.frameTick = 0;
    this.updateFrame();
  }

  updateAnimation(): void {
    const anim = this.animations.get(this.currentAnim);
    if (!anim) return;
    this.frameTick++;
    if (this.frameTick >= anim.frameDuration) {
      this.frameTick = 0;
      this.frameIndex++;
      if (this.frameIndex >= anim.frames.length) {
        this.frameIndex = anim.loop ? 0 : anim.frames.length - 1;
      }
      this.updateFrame();
    }
  }

  protected updateFrame(): void {
    const anim = this.animations.get(this.currentAnim);
    if (!anim) return;
    const texIdx = anim.frames[this.frameIndex];
    if (texIdx < this.textures.length) {
      this.sprite.texture = this.textures[texIdx];
    }
  }

  setTilePosition(x: number, y: number): void {
    this.tileX = x;
    this.tileY = y;
    this.pixelX = x * TILE_SIZE;
    this.pixelY = y * TILE_SIZE;
    this.updateSpritePosition();
  }

  updateSpritePosition(): void {
    this.sprite.x = this.pixelX;
    this.sprite.y = this.pixelY + TILE_SIZE;
    this.sprite.zIndex = this.pixelY + TILE_SIZE;
    this.updateOverheadPosition();
  }

  setVisible(visible: boolean): void {
    this.sprite.visible = visible;
    if (this.overheadSprite) this.overheadSprite.visible = visible;
  }

  getCenterPixel(): { x: number; y: number } {
    return {
      x: this.pixelX + TILE_SIZE / 2,
      y: this.pixelY + TILE_SIZE / 2,
    };
  }

  /** Show an overhead icon above this entity */
  async showOverheadIcon(icon: OverheadIcon): Promise<void> {
    const textures = await loadIconTextures();
    const idx = ICON_INDEX[icon];
    if (idx === undefined || idx >= textures.length) return;

    if (!this.overheadSprite) {
      this.overheadSprite = new Sprite();
      this.overheadSprite.anchor.set(0.5, 1);
      this.container.addChild(this.overheadSprite);
    }
    this.overheadSprite.texture = textures[idx];
    this.overheadSprite.visible = true;
    this.overheadBobTimer = 0;
    this.updateOverheadPosition();
  }

  /** Hide the overhead icon */
  hideOverheadIcon(): void {
    if (this.overheadSprite) {
      this.overheadSprite.visible = false;
    }
  }

  /** Update overhead icon bob animation. Call from update loop. */
  updateOverhead(): void {
    if (!this.overheadSprite?.visible) return;
    this.overheadBobTimer++;
    this.updateOverheadPosition();
  }

  private updateOverheadPosition(): void {
    if (!this.overheadSprite?.visible) return;
    const bob = Math.sin(this.overheadBobTimer * 0.08) * 1;
    this.overheadSprite.x = this.pixelX + TILE_SIZE / 2;
    this.overheadSprite.y = this.pixelY + TILE_SIZE - this.frameH + 10 + bob;
    this.overheadSprite.zIndex = this.pixelY + TILE_SIZE + 1;
  }

  destroy(): void {
    this.container.removeChild(this.sprite);
    this.sprite.destroy();
    if (this.overheadSprite) {
      this.container.removeChild(this.overheadSprite);
      this.overheadSprite.destroy();
    }
  }
}
