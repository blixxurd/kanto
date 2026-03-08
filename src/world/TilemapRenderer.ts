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
  bottomLayer: CompositeTilemap;
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

  /** Exposed after loadMap: original source → merged source info */
  private _mergedSourceMap = new Map<TextureSource, MergedSourceInfo>();

  /** Get the merged source info for an original TextureSource */
  getMergedSourceInfo(original: TextureSource): MergedSourceInfo | undefined {
    return this._mergedSourceMap.get(original);
  }

  constructor(worldContainer: Container) {
    this.worldContainer = worldContainer;
    this.bottomLayer = new CompositeTilemap();
    this.topLayer = new CompositeTilemap();
    worldContainer.addChild(this.bottomLayer);
    worldContainer.addChild(this.entityLayer);
    worldContainer.addChild(this.topLayer);
  }

  loadMap(mapData: MapData, tileTextures: Map<number, Texture>): void {
    this.mapData = mapData;
    this.tileTextures = tileTextures;
    this.lastViewLeft = -1;

    // Destroy old tilemaps and create fresh ones to avoid stale GPU state
    const bottomIdx = this.worldContainer.getChildIndex(this.bottomLayer);
    const topIdx = this.worldContainer.getChildIndex(this.topLayer);
    this.worldContainer.removeChild(this.bottomLayer);
    this.worldContainer.removeChild(this.topLayer);
    this.bottomLayer.destroy();
    this.topLayer.destroy();

    this.bottomLayer = new CompositeTilemap();
    this.topLayer = new CompositeTilemap();
    this.worldContainer.addChildAt(this.bottomLayer, bottomIdx);
    this.worldContainer.addChildAt(this.topLayer, topIdx);

    // Collect unique TextureSources
    const allSources: TextureSource[] = [];
    const seenSources = new Set<TextureSource>();
    for (const [, tex] of tileTextures) {
      if (!seenSources.has(tex.source)) {
        seenSources.add(tex.source);
        allSources.push(tex.source);
      }
    }

    let sourceList: TextureSource[];
    let sourceIndexMap: Map<TextureSource, number>;
    let vOffsetMap: Map<TextureSource, number>;

    if (allSources.length > 16) {
      // Merge pairs to reduce source count below TEXTURES_PER_TILEMAP limit
      const merged = this.mergeSources(allSources);
      sourceList = merged.sourceList;
      sourceIndexMap = merged.sourceIndexMap;
      vOffsetMap = merged.vOffsetMap;
    } else {
      // Use sources directly (all are already canvas-backed from AssetLoader)
      sourceList = allSources;
      sourceIndexMap = new Map();
      vOffsetMap = new Map();
      this._mergedSourceMap.clear();
      for (let i = 0; i < allSources.length; i++) {
        sourceIndexMap.set(allSources[i], i);
        this._mergedSourceMap.set(allSources[i], { mergedSource: allSources[i], vOffset: 0 });
      }
    }

    // Pre-register all sources with CompositeTilemap
    this.bottomLayer.tileset(sourceList);
    this.topLayer.tileset(sourceList);

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

    if (import.meta.env.DEV) console.log(`TilemapRenderer: loaded ${tileTextures.size} tiles, ${sourceList.length} unique sources (from ${allSources.length} original)`);
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

    this.bottomLayer.clear();
    this.topLayer.clear();

    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const bottomGid = this.mapData.getBottomTile(x, y);
        if (bottomGid > 0) {
          const info = this.tileInfoCache.get(bottomGid);
          if (info) {
            this.bottomLayer.tile(info.sourceIndex, x * TILE_SIZE, y * TILE_SIZE, {
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
            this.topLayer.tile(info.sourceIndex, x * TILE_SIZE, y * TILE_SIZE, {
              u: info.u,
              v: info.v,
              tileWidth: info.tileWidth,
              tileHeight: info.tileHeight,
            });
          }
        }
      }
    }
  }

  refreshAll(): void {
    this.lastViewLeft = -1;
  }
}
