import { Assets, Texture, TextureSource } from 'pixi.js';
import type { TiledTilesetRef } from '../types/tiled';
import type { MergedSourceInfo } from './TilemapRenderer';

interface AnimDef {
  name: string;
  frameCount: number;
  interval: number;
  timerOffset: number;
  metatileIds: number[];
  atlasImage: string;
  atlasTopImage: string;
  atlasColumns: number;
}

interface TilesetAnimData {
  animations: AnimDef[];
}

interface AnimManifest {
  tilesets: Record<string, TilesetAnimData>;
}

interface ActiveAnim {
  def: AnimDef;
  currentFrame: number;
  /** Pre-loaded ImageBitmap for each frame of the bottom atlas */
  bottomFrames: ImageBitmap[];
  /** Pre-loaded ImageBitmap for each frame of the top atlas */
  topFrames: ImageBitmap[];
  /** The TextureSource to draw bottom frames onto (may be merged) */
  baseSource: TextureSource;
  /** The TextureSource to draw top frames onto (may be merged) */
  topSource: TextureSource;
  /** Atlas positions for bottom layer (includes merge V offset) */
  metatilePositions: Map<number, { x: number; y: number }>;
  /** Atlas positions for top layer (includes merge V offset) */
  topMetatilePositions: Map<number, { x: number; y: number }>;
}

const METATILES_PER_ROW = 16;

export class TileAnimator {
  private manifest: AnimManifest | null = null;
  private activeAnims: ActiveAnim[] = [];
  private timer = 0;
  private dirty = false;

  async load(): Promise<void> {
    try {
      const resp = await fetch('data/tile_anims.json');
      this.manifest = await resp.json();
    } catch {
      console.warn('TileAnimator: no tile_anims.json found');
    }
  }

  /**
   * Set up animations for the current map's tilesets.
   * Call after tilesets are loaded. Animations modify the existing atlas textures in place.
   */
  async setupForMap(
    tilesetRefs: TiledTilesetRef[],
    tileTextures: Map<number, Texture>,
    getMergedInfo?: (src: TextureSource) => MergedSourceInfo | undefined,
  ): Promise<void> {
    this.activeAnims = [];
    this.timer = 0;

    if (!this.manifest) return;

    // Build a lookup: tileset source filename → firstgid
    const sourceToFirstgid = new Map<string, number>();
    for (const ref of tilesetRefs) {
      sourceToFirstgid.set(ref.source, ref.firstgid);
    }

    // Also build firstgid → TextureSource from tileTextures
    const firstgidToSource = new Map<number, TextureSource>();
    for (const [gid, tex] of tileTextures) {
      if (!firstgidToSource.has(gid)) {
        firstgidToSource.set(gid, tex.source);
      }
    }

    for (const [tilesetName, tsData] of Object.entries(this.manifest.tilesets)) {
      const baseTsj = `${tilesetName}.tsj`;
      const topTsj = `${tilesetName}_top.tsj`;
      const baseFirstgid = sourceToFirstgid.get(baseTsj);
      const topFirstgid = sourceToFirstgid.get(topTsj);

      if (baseFirstgid === undefined) continue;

      // Get the TextureSource for this tileset
      const baseSource = firstgidToSource.get(baseFirstgid);
      const topSource = topFirstgid !== undefined ? firstgidToSource.get(topFirstgid) : undefined;
      if (!baseSource) continue;

      for (const animDef of tsData.animations) {
        try {
          // Load animation atlas images as ImageBitmaps for fast canvas drawing
          const bottomImg = await loadImage(`tilesets/${animDef.atlasImage}`);
          const topImg = await loadImage(`tilesets/${animDef.atlasTopImage}`);

          // Slice each frame row into an ImageBitmap
          const bottomFrames: ImageBitmap[] = [];
          const topFrames: ImageBitmap[] = [];
          for (let f = 0; f < animDef.frameCount; f++) {
            bottomFrames.push(await createImageBitmap(bottomImg, 0, f * 16,
              animDef.atlasColumns * 16, 16));
            topFrames.push(await createImageBitmap(topImg, 0, f * 16,
              animDef.atlasColumns * 16, 16));
          }

          // Resolve merged sources (if sources were combined to stay under texture limit)
          const baseMerged = getMergedInfo?.(baseSource);
          const topMerged = topSource ? getMergedInfo?.(topSource) : undefined;
          const actualBaseSource = baseMerged?.mergedSource || baseSource;
          const actualTopSource = topMerged?.mergedSource || topSource || baseSource;
          const baseVOffset = baseMerged?.vOffset || 0;
          const topVOffset = topMerged?.vOffset || 0;

          // Build metatile → atlas position map (with merge V offset)
          const metatilePositions = new Map<number, { x: number; y: number }>();
          for (const mtId of animDef.metatileIds) {
            const col = mtId % METATILES_PER_ROW;
            const row = Math.floor(mtId / METATILES_PER_ROW);
            metatilePositions.set(mtId, { x: col * 16, y: row * 16 + baseVOffset });
          }

          // Build separate position map for top layer (may have different V offset)
          const topMetatilePositions = new Map<number, { x: number; y: number }>();
          for (const mtId of animDef.metatileIds) {
            const col = mtId % METATILES_PER_ROW;
            const row = Math.floor(mtId / METATILES_PER_ROW);
            topMetatilePositions.set(mtId, { x: col * 16, y: row * 16 + topVOffset });
          }

          this.activeAnims.push({
            def: animDef,
            currentFrame: 0,
            bottomFrames,
            topFrames,
            baseSource: actualBaseSource,
            topSource: actualTopSource,
            metatilePositions,
            topMetatilePositions,
          });
        } catch (e) {
          console.warn(`TileAnimator: failed to load ${animDef.atlasImage}:`, e);
        }
      }
    }

    if (this.activeAnims.length > 0) {
      if (import.meta.env.DEV) console.log(`TileAnimator: ${this.activeAnims.length} animations active`);
    }
  }

  /**
   * Advance the animation timer. Call once per game tick (60fps).
   * Returns true if any animation frame changed.
   */
  tick(): boolean {
    if (this.activeAnims.length === 0) return false;

    this.timer++;
    this.dirty = false;

    for (const anim of this.activeAnims) {
      const { def } = anim;
      if ((this.timer - def.timerOffset) % def.interval === 0) {
        const divTimer = Math.floor((this.timer - def.timerOffset) / def.interval);
        const newFrame = ((divTimer % def.frameCount) + def.frameCount) % def.frameCount;
        if (newFrame !== anim.currentFrame) {
          anim.currentFrame = newFrame;
          this.applyFrame(anim);
          this.dirty = true;
        }
      }
    }

    return this.dirty;
  }

  /**
   * Write the current animation frame's metatile pixels directly onto the atlas texture.
   */
  private applyFrame(anim: ActiveAnim): void {
    const { def, currentFrame, bottomFrames, topFrames, baseSource, topSource,
      metatilePositions, topMetatilePositions } = anim;
    const bottomRow = bottomFrames[currentFrame];
    const topRow = topFrames[currentFrame];

    // Draw animated metatiles onto the base atlas canvas
    this.blitFrameToSource(baseSource, bottomRow, def.metatileIds, metatilePositions);
    // Top may be same merged canvas (different V offset) or same source
    this.blitFrameToSource(topSource, topRow, def.metatileIds, topMetatilePositions);
  }

  private blitFrameToSource(
    source: TextureSource,
    frameStrip: ImageBitmap,
    metatileIds: number[],
    positions: Map<number, { x: number; y: number }>
  ): void {
    const canvas = source.resource as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    for (let col = 0; col < metatileIds.length; col++) {
      const pos = positions.get(metatileIds[col]);
      if (!pos) continue;
      ctx.drawImage(frameStrip, col * 16, 0, 16, 16, pos.x, pos.y, 16, 16);
    }

    source.update();
  }
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
