import { Assets, Texture, Container } from 'pixi.js';
import type { Direction, NPCDef } from '../types/game';
import { Entity } from './Entity';
import { TILE_SIZE } from '../utils/TileCoords';

/** Direction row order in NPC spritesheets: down=0, up=1, left=2, right=3 */
const DIR_ROW: Record<Direction, number> = { down: 0, up: 1, left: 2, right: 3 };

export class NPC extends Entity {
  readonly def: NPCDef;

  constructor(def: NPCDef, container: Container) {
    super(container);
    this.def = def;
    this.tileX = def.x;
    this.tileY = def.y;
    this.pixelX = def.x * TILE_SIZE;
    this.pixelY = def.y * TILE_SIZE;
    this.direction = def.direction;
  }

  async loadSprite(sheetPath: string, frameW: number, frameH: number): Promise<void> {
    const tex = await Assets.load(sheetPath) as Texture;
    tex.source.scaleMode = 'nearest';

    this.frameW = frameW;
    this.frameH = frameH;
    this.textures = this.sliceSheet(tex.source, frameW, frameH);

    // Build animations programmatically (all NPC sheets: 3 cols x 4 rows)
    const cols = Math.floor(tex.source.width / frameW);
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
}
