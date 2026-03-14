import { Sprite, Texture, Rectangle, Container, Assets } from 'pixi.js';
import type { Direction } from '../types/game';
import { Entity, type AnimDef } from './Entity';
import { TILE_SIZE } from '../utils/TileCoords';

export class Player extends Entity {
  /** Vertical pixel offset during jumps (negative = up). */
  jumpOffset = 0;
  /** Vertical pixel offset from surf bobbing. */
  surfOffset = 0;

  private shadow: Sprite;

  /** Saved normal sprite data for swapping back from surf. */
  private normalTextures: Texture[] = [];
  private normalAnims = new Map<string, AnimDef>();
  /** Surf sprite data. */
  private surfTextures: Texture[] = [];
  private surfAnims = new Map<string, AnimDef>();
  private _isSurfing = false;

  constructor(container: Container) {
    super(container);
    this.shadow = new Sprite();
    this.shadow.anchor.set(0.5, 0.5);
    this.shadow.visible = false;
    // Insert shadow before the main sprite
    const spriteIdx = container.getChildIndex(this.sprite);
    container.addChildAt(this.shadow, spriteIdx);
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
    this.textures = this.sliceSheet(source, this.frameW, this.frameH);

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

  override updateSpritePosition(): void {
    this.sprite.x = this.pixelX;
    this.sprite.y = this.pixelY + TILE_SIZE + this.jumpOffset + this.surfOffset;
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

    this.updateOverhead();
  }

  get isSurfing(): boolean {
    return this._isSurfing;
  }

  /**
   * Swap the walking sprite to a different spritesheet (same 3x4 layout as player).
   * Preserves existing animation definitions since NPC sheets use identical frame order.
   */
  async swapSprite(sheetPath: string): Promise<void> {
    const tex = await Assets.load(sheetPath) as Texture;
    tex.source.scaleMode = 'nearest';

    const newTextures = this.sliceSheet(tex.source, this.frameW, this.frameH);
    this.textures = newTextures;
    // Also update normalTextures so exiting surf returns to new sprite
    this.normalTextures = newTextures;
    this.currentAnim = '';
    this.playAnimation(`idle_${this.direction}`);
  }

  /** Pre-load the surf spritesheet so swapping is instant. */
  async loadSurfSprite(sheetPath: string): Promise<void> {
    try {
      const tex = await Assets.load(sheetPath) as Texture;
      tex.source.scaleMode = 'nearest';

      // Surf sheet: 1 column x 4 rows (down, up, left, right), 16x32 each
      const fw = 16, fh = 32;
      const rows = Math.floor(tex.source.height / fh);
      this.surfTextures = [];
      for (let r = 0; r < rows; r++) {
        this.surfTextures.push(new Texture({
          source: tex.source,
          frame: new Rectangle(0, r * fh, fw, fh),
        }));
      }

      // Surf animations: single static frame per direction (GBA surf has no walk cycle)
      this.surfAnims.clear();
      this.surfAnims.set('idle_down',  { frames: [0], frameDuration: 1, loop: false });
      this.surfAnims.set('idle_up',    { frames: [1], frameDuration: 1, loop: false });
      this.surfAnims.set('idle_left',  { frames: [2], frameDuration: 1, loop: false });
      this.surfAnims.set('idle_right', { frames: [3], frameDuration: 1, loop: false });
      // Walk/run use the same static frame (GBA surf anims are identical for all speeds)
      for (const prefix of ['walk', 'run']) {
        this.surfAnims.set(`${prefix}_down`,  { frames: [0], frameDuration: 1, loop: false });
        this.surfAnims.set(`${prefix}_up`,    { frames: [1], frameDuration: 1, loop: false });
        this.surfAnims.set(`${prefix}_left`,  { frames: [2], frameDuration: 1, loop: false });
        this.surfAnims.set(`${prefix}_right`, { frames: [3], frameDuration: 1, loop: false });
      }
    } catch (e) {
      console.warn('Failed to load surf sprite:', e);
    }
  }

  /** Swap to surfing sprite. */
  enterSurf(): void {
    if (this._isSurfing || this.surfTextures.length === 0) return;
    // Save normal state
    this.normalTextures = this.textures;
    this.normalAnims = new Map(this.animations);
    // Swap to surf
    this.textures = this.surfTextures;
    this.animations = this.surfAnims;
    this._isSurfing = true;
    this.currentAnim = '';
    this.playAnimation(`idle_${this.direction}`);
  }

  /** Swap back to normal walking sprite. */
  exitSurf(): void {
    if (!this._isSurfing) return;
    this.textures = this.normalTextures;
    this.animations = this.normalAnims;
    this._isSurfing = false;
    this.surfOffset = 0;
    this.currentAnim = '';
    this.playAnimation(`idle_${this.direction}`);
  }
}
