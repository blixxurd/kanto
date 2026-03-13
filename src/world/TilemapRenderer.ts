import { CompositeTilemap } from '@pixi/tilemap';
import { Container, Texture, TextureSource } from 'pixi.js';
import { MapData } from './MapData';
import { TILE_SIZE } from '../utils/TileCoords';

interface TileInfo {
  sourceIndex: number;
  u: number;
  v: number;
  tileWidth: number;
  tileHeight: number;
}

/** Mapping from original TextureSource to its merged canvas + offset */
export interface MergedSourceInfo {
  /** The combined TextureSource (canvas-backed) */
  mergedSource: TextureSource;
  /** V offset within the merged canvas for this original source */
  vOffset: number;
}

export class TilemapRenderer {
  /** The currently visible bottom layer (points to one of the double-buffer pair). */
  bottomLayer: CompositeTilemap;
  /** The currently visible top layer. */
  topLayer: CompositeTilemap;
  readonly entityLayer = new Container();

  private worldContainer: Container;
  private tileTextures = new Map<number, Texture>();
  private tileInfoCache = new Map<number, TileInfo>();
  private mapData: MapData | null = null;

  private lastViewLeft = -1;
  private lastViewTop = -1;
  private lastViewRight = -1;
  private lastViewBottom = -1;

  /** Double-buffer: two pairs of tilemaps, swap to avoid clear() flash. */
  private buffers: Array<{ bottom: CompositeTilemap; top: CompositeTilemap }>;
  private activeBuffer = 0;

  /** Exposed after loadMap: original source → merged source info */
  private _mergedSourceMap = new Map<TextureSource, MergedSourceInfo>();
  private sourceList: TextureSource[] = [];

  /** Get the merged source info for an original TextureSource */
  getMergedSourceInfo(original: TextureSource): MergedSourceInfo | undefined {
    return this._mergedSourceMap.get(original);
  }

  constructor(worldContainer: Container) {
    this.worldContainer = worldContainer;

    // Create double-buffer pairs
    this.buffers = [
      { bottom: new CompositeTilemap(), top: new CompositeTilemap() },
      { bottom: new CompositeTilemap(), top: new CompositeTilemap() },
    ];

    // Buffer 0 is initially active and visible
    this.bottomLayer = this.buffers[0].bottom;
    this.topLayer = this.buffers[0].top;

    // Add both buffers to scene — inactive starts hidden
    worldContainer.addChild(this.buffers[0].bottom);
    worldContainer.addChild(this.buffers[1].bottom);
    worldContainer.addChild(this.entityLayer);
    worldContainer.addChild(this.buffers[0].top);
    worldContainer.addChild(this.buffers[1].top);

    this.buffers[1].bottom.visible = false;
    this.buffers[1].top.visible = false;
  }

  loadMap(mapData: MapData, tileTextures: Map<number, Texture>): void {
    this.mapData = mapData;
    this.tileTextures = tileTextures;
    this.lastViewLeft = -1;

    // Destroy old tilemaps and create fresh ones to avoid stale GPU state
    for (const buf of this.buffers) {
      const bottomIdx = this.worldContainer.getChildIndex(buf.bottom);
      const topIdx = this.worldContainer.getChildIndex(buf.top);
      this.worldContainer.removeChild(buf.bottom);
      this.worldContainer.removeChild(buf.top);
      buf.bottom.destroy();
      buf.top.destroy();

      buf.bottom = new CompositeTilemap();
      buf.top = new CompositeTilemap();
      this.worldContainer.addChildAt(buf.bottom, bottomIdx);
      this.worldContainer.addChildAt(buf.top, topIdx);
    }

    // Buffer 0 active, buffer 1 hidden
    this.activeBuffer = 0;
    this.bottomLayer = this.buffers[0].bottom;
    this.topLayer = this.buffers[0].top;
    this.buffers[1].bottom.visible = false;
    this.buffers[1].top.visible = false;

    // Collect unique TextureSources
    const allSources: TextureSource[] = [];
    const seenSources = new Set<TextureSource>();
    for (const [, tex] of tileTextures) {
      if (!seenSources.has(tex.source)) {
        seenSources.add(tex.source);
        allSources.push(tex.source);
      }
    }

    let sourceIndexMap: Map<TextureSource, number>;
    let vOffsetMap: Map<TextureSource, number>;

    if (allSources.length > 16) {
      // Merge pairs to reduce source count below TEXTURES_PER_TILEMAP limit
      const merged = this.mergeSources(allSources);
      this.sourceList = merged.sourceList;
      sourceIndexMap = merged.sourceIndexMap;
      vOffsetMap = merged.vOffsetMap;
    } else {
      // Use sources directly (all are already canvas-backed from AssetLoader)
      this.sourceList = allSources;
      sourceIndexMap = new Map();
      vOffsetMap = new Map();
      this._mergedSourceMap.clear();
      for (let i = 0; i < allSources.length; i++) {
        sourceIndexMap.set(allSources[i], i);
        this._mergedSourceMap.set(allSources[i], { mergedSource: allSources[i], vOffset: 0 });
      }
    }

    // Pre-register all sources with both buffer pairs
    for (const buf of this.buffers) {
      buf.bottom.tileset(this.sourceList);
      buf.top.tileset(this.sourceList);
    }

    // Build TileInfo cache for fast rendering
    this.tileInfoCache.clear();
    for (const [gid, tex] of tileTextures) {
      const sourceIndex = sourceIndexMap.get(tex.source)!;
      const vOffset = vOffsetMap.get(tex.source) || 0;
      this.tileInfoCache.set(gid, {
        sourceIndex,
        u: tex.frame.x,
        v: tex.frame.y + vOffset,
        tileWidth: tex.frame.width,
        tileHeight: tex.frame.height,
      });
    }

    if (import.meta.env.DEV) console.log(`TilemapRenderer: loaded ${tileTextures.size} tiles, ${this.sourceList.length} unique sources (from ${allSources.length} original)`);
  }

  /**
   * Merge pairs of texture sources into combined textures to stay under the
   * TEXTURES_PER_TILEMAP limit of 16. Pairs sources sequentially (0+1, 2+3, etc.)
   * by stacking them vertically into a single canvas texture.
   */
  private mergeSources(allSources: TextureSource[]): {
    sourceList: TextureSource[];
    sourceIndexMap: Map<TextureSource, number>;
    vOffsetMap: Map<TextureSource, number>;
  } {
    const sourceList: TextureSource[] = [];
    const sourceIndexMap = new Map<TextureSource, number>();
    const vOffsetMap = new Map<TextureSource, number>();
    this._mergedSourceMap.clear();

    for (let i = 0; i < allSources.length; i += 2) {
      const srcA = allSources[i];
      const srcB = i + 1 < allSources.length ? allSources[i + 1] : null;

      if (!srcB) {
        // Odd source at end — use as-is
        sourceIndexMap.set(srcA, sourceList.length);
        sourceList.push(srcA);
        this._mergedSourceMap.set(srcA, { mergedSource: srcA, vOffset: 0 });
        continue;
      }

      // Create combined canvas: A on top, B below
      const w = Math.max(srcA.width, srcB.width);
      const hA = srcA.height;
      const hB = srcB.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = hA + hB;
      const ctx = canvas.getContext('2d')!;

      // Draw source A at top (canvas-backed from AssetLoader)
      ctx.drawImage(srcA.resource as any, 0, 0);

      // Draw source B below
      ctx.drawImage(srcB.resource as any, 0, hA);

      // Create TextureSource through pixi's standard pathway
      const combined = Texture.from({ resource: canvas, scaleMode: 'nearest' }).source;

      const idx = sourceList.length;
      sourceList.push(combined);

      // Map both original sources to the same combined index
      sourceIndexMap.set(srcA, idx);
      sourceIndexMap.set(srcB, idx);

      // Source B tiles: V offset = height of A
      vOffsetMap.set(srcB, hA);

      // Track merge info for TileAnimator
      this._mergedSourceMap.set(srcA, { mergedSource: combined, vOffset: 0 });
      this._mergedSourceMap.set(srcB, { mergedSource: combined, vOffset: hA });
    }

    return { sourceList, sourceIndexMap, vOffsetMap };
  }

  renderViewport(cameraX: number, cameraY: number, viewW: number, viewH: number): void {
    if (!this.mapData) return;

    const buffer = 2;
    const left = Math.max(0, Math.floor((cameraX - viewW / 2) / TILE_SIZE) - buffer);
    const top = Math.max(0, Math.floor((cameraY - viewH / 2) / TILE_SIZE) - buffer);
    const right = Math.min(this.mapData.width, Math.ceil((cameraX + viewW / 2) / TILE_SIZE) + buffer);
    const bottom = Math.min(this.mapData.height, Math.ceil((cameraY + viewH / 2) / TILE_SIZE) + buffer);

    // Only re-render if viewport changed
    if (left === this.lastViewLeft && top === this.lastViewTop &&
        right === this.lastViewRight && bottom === this.lastViewBottom) {
      return;
    }

    this.lastViewLeft = left;
    this.lastViewTop = top;
    this.lastViewRight = right;
    this.lastViewBottom = bottom;

    // Double-buffer: draw into the INACTIVE buffer, then swap.
    // The active buffer stays visible until the new one is fully populated.
    const nextIdx = 1 - this.activeBuffer;
    const next = this.buffers[nextIdx];

    next.bottom.clear();
    next.top.clear();

    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const bottomGid = this.mapData.getBottomTile(x, y);
        if (bottomGid > 0) {
          const info = this.tileInfoCache.get(bottomGid);
          if (info) {
            next.bottom.tile(info.sourceIndex, x * TILE_SIZE, y * TILE_SIZE, {
              u: info.u,
              v: info.v,
              tileWidth: info.tileWidth,
              tileHeight: info.tileHeight,
            });
          }
        }

        const topGid = this.mapData.getTopTile(x, y);
        if (topGid > 0) {
          const info = this.tileInfoCache.get(topGid);
          if (info) {
            next.top.tile(info.sourceIndex, x * TILE_SIZE, y * TILE_SIZE, {
              u: info.u,
              v: info.v,
              tileWidth: info.tileWidth,
              tileHeight: info.tileHeight,
            });
          }
        }
      }
    }

    // Swap: show new buffer, hide old one
    const prev = this.buffers[this.activeBuffer];
    next.bottom.visible = true;
    next.top.visible = true;
    prev.bottom.visible = false;
    prev.top.visible = false;

    this.activeBuffer = nextIdx;
    this.bottomLayer = next.bottom;
    this.topLayer = next.top;
  }

  refreshAll(): void {
    this.lastViewLeft = -1;
  }
}
