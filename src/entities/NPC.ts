import { Sprite, Texture, Rectangle, Container, Assets } from 'pixi.js';
import type { Direction, NPCDef } from '../types/game';
import { TILE_SIZE } from '../utils/TileCoords';

interface AnimDef {
  frames: number[];
  frameDuration: number;
  loop: boolean;
}

/** Direction row order in NPC spritesheets: down=0, up=1, left=2, right=3 */
const DIR_ROW: Record<Direction, number> = { down: 0, up: 1, left: 2, right: 3 };

export class NPC {
  tileX: number;
  tileY: number;
  pixelX: number;
  pixelY: number;
  direction: Direction;
  readonly def: NPCDef;

  sprite: Sprite;
  private frameW = 16;
  private frameH = 32;
  private textures: Texture[] = [];
  private animations = new Map<string, AnimDef>();
  private currentAnim = '';
  private frameIndex = 0;
  private frameTick = 0;

  constructor(def: NPCDef, private container: Container) {
    this.def = def;
    this.tileX = def.x;
    this.tileY = def.y;
    this.pixelX = def.x * TILE_SIZE;
    this.pixelY = def.y * TILE_SIZE;
    this.direction = def.direction;

    this.sprite = new Sprite();
    this.sprite.anchor.set(0, 1);
    container.addChild(this.sprite);
  }

  async loadSprite(sheetPath: string, frameW: number, frameH: number): Promise<void> {
    const tex = await Assets.load(sheetPath) as Texture;
    tex.source.scaleMode = 'nearest';

    this.frameW = frameW;
    this.frameH = frameH;

    const cols = Math.floor(tex.source.width / frameW);
    const rows = Math.floor(tex.source.height / frameH);
    this.textures = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.textures.push(new Texture({
          source: tex.source,
          frame: new Rectangle(c * frameW, r * frameH, frameW, frameH),
        }));
      }
    }

    // Build animations programmatically (all NPC sheets: 3 cols × 4 rows)
    for (const [dir, row] of Object.entries(DIR_ROW)) {
      const base = row * cols;
      this.animations.set(`idle_${dir}`, { frames: [base], frameDuration: 1, loop: false });
      this.animations.set(`walk_${dir}`, {
        frames: [base, base + 1, base, base + 2],
        frameDuration: 4,
        loop: true,
      });
    }

    this.playAnimation(`idle_${this.direction}`);
    this.updateSpritePosition();
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

  private updateFrame(): void {
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
  }

  destroy(): void {
    this.container.removeChild(this.sprite);
    this.sprite.destroy();
  }
}
