import { Sprite, Texture, Rectangle, Container, Assets } from 'pixi.js';
import type { Direction } from '../types/game';
import { TILE_SIZE } from '../utils/TileCoords';

interface AnimDef {
  frames: number[];
  frameDuration: number;
  loop: boolean;
}

export class Player {
  tileX = 0;
  tileY = 0;
  pixelX = 0;
  pixelY = 0;
  /** Vertical pixel offset during jumps (negative = up). */
  jumpOffset = 0;
  direction: Direction = 'down';
  sprite: Sprite;

  private shadow: Sprite;
  private container: Container;
  private frameW = 16;
  private frameH = 32;
  private animations = new Map<string, AnimDef>();
  private currentAnim = '';
  private frameIndex = 0;
  private frameTick = 0;
  private textures: Texture[] = [];

  constructor(container: Container) {
    this.container = container;
    this.shadow = new Sprite();
    this.shadow.anchor.set(0.5, 0.5);
    this.shadow.visible = false;
    container.addChild(this.shadow);

    this.sprite = new Sprite();
    this.sprite.anchor.set(0, 1);
    container.addChild(this.sprite);
  }

  async loadSprite(sheetPath: string, animPath: string): Promise<void> {
    const [sheetTex, animData] = await Promise.all([
      Assets.load(sheetPath) as Promise<Texture>,
      fetch(animPath).then(r => r.json()),
    ]);

    const source = sheetTex.source;
    source.scaleMode = 'nearest';

    this.frameW = animData.frameWidth;
    this.frameH = animData.frameHeight;

    // Build frame textures from the sheet
    const cols = Math.floor(source.width / this.frameW);
    const rows = Math.floor(source.height / this.frameH);
    this.textures = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const frame = new Rectangle(c * this.frameW, r * this.frameH, this.frameW, this.frameH);
        this.textures.push(new Texture({ source, frame }));
      }
    }

    // Load animations
    for (const [name, def] of Object.entries(animData.animations)) {
      this.animations.set(name, def as AnimDef);
    }

    this.playAnimation('idle_down');

    // Load jump shadow
    try {
      const shadowTex = await Assets.load('./sprites/shadow_medium.png') as Texture;
      shadowTex.source.scaleMode = 'nearest';
      this.shadow.texture = shadowTex;
    } catch {
      // Shadow is optional
    }
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
    this.sprite.y = this.pixelY + TILE_SIZE + this.jumpOffset;
    // zIndex for depth sorting with grass/field effects (based on ground position, not visual)
    this.sprite.zIndex = this.pixelY + TILE_SIZE;

    // Shadow stays on the ground during jumps
    const jumping = this.jumpOffset !== 0;
    this.shadow.visible = jumping;
    if (jumping) {
      this.shadow.x = this.pixelX + TILE_SIZE / 2;
      this.shadow.y = this.pixelY + TILE_SIZE;
      this.shadow.zIndex = this.pixelY + TILE_SIZE - 1;
    }
  }

  getCenterPixel(): { x: number; y: number } {
    return {
      x: this.pixelX + TILE_SIZE / 2,
      y: this.pixelY + TILE_SIZE / 2,
    };
  }
}
