import { AssetLoader } from '../core/AssetLoader';
import { MapData } from './MapData';
import type { Warp } from '../types/game';
import type { Texture } from 'pixi.js';

interface WarpTable {
  overworldWarps: Array<{
    overworldX: number;
    overworldY: number;
    destMap: string;
    destWarpId: number;
  }>;
  interiorReturns: Record<string, Array<{
    warpId: number;
    returnX: number;
    returnY: number;
  }>>;
}

export class MapManager {
  private overworldData: MapData | null = null;
  private overworldTilesets: any = null;
  private currentInterior: MapData | null = null;
  private currentInteriorTilesets: any = null;
  private activeMode: 'overworld' | 'interior' = 'overworld';
  private warpTable: WarpTable | null = null;
  private tileTextures = new Map<number, Texture>();
  private assetLoader: AssetLoader;

  constructor(assetLoader: AssetLoader) {
    this.assetLoader = assetLoader;
  }

  async init(): Promise<void> {
    const mapJson = await this.assetLoader.loadMapJSON('./maps/overworld.json');
    this.overworldData = MapData.fromTiledJSON(mapJson, 'overworld');
    this.overworldTilesets = mapJson.tilesets;
    this.tileTextures = await this.assetLoader.loadTilesets(mapJson.tilesets, './tilesets');
    this.warpTable = await this.assetLoader.loadJSON<WarpTable>('./data/warp_table.json');
  }

  getActiveMap(): MapData | null {
    return this.activeMode === 'overworld' ? this.overworldData : this.currentInterior;
  }

  getActiveMode(): 'overworld' | 'interior' {
    return this.activeMode;
  }

  getTileTextures(): Map<number, Texture> {
    return this.tileTextures;
  }

  getActiveTilesetRefs(): any[] {
    if (this.activeMode === 'overworld') {
      return this.overworldTilesets || [];
    }
    return this.currentInteriorTilesets || [];
  }

  isPassable(x: number, y: number): boolean {
    const map = this.getActiveMap();
    return map ? map.isPassable(x, y) : false;
  }

  /**
   * Follow a warp to its destination. Works from any source map to any destination.
   * The triggering warp object tells us which warp index was stepped on.
   */
  async followWarp(destMap: string, destWarpId: number): Promise<{ x: number; y: number }> {
    // If we're in an interior, find which warp index we stepped on
    // so we can look up the correct overworld return point
    if (this.activeMode === 'interior' && this.currentInterior && this.warpTable) {
      const interiorId = this.currentInterior.id;
      const returns = this.warpTable.interiorReturns[interiorId];
      if (returns) {
        // Find the warp index we stepped on by matching destMap + destWarpId
        const steppedWarpIdx = this.currentInterior.warps.findIndex(
          w => w.destMap === destMap && w.destWarpId === destWarpId
        );
        if (steppedWarpIdx >= 0) {
          const ret = returns.find(r => r.warpId === steppedWarpIdx);
          if (ret) {
            return this.loadOverworld(ret.returnX, ret.returnY);
          }
        }
      }
    }

    // Not an overworld return — load the destination as interior/dungeon
    return this.loadInterior(destMap, destWarpId);
  }

  private async loadOverworld(returnX: number, returnY: number): Promise<{ x: number; y: number }> {
    this.tileTextures = await this.assetLoader.loadTilesets(this.overworldTilesets, './tilesets');
    this.currentInterior = null;
    this.currentInteriorTilesets = null;
    this.activeMode = 'overworld';

    // Spawn one tile south of the door
    const spawnY = returnY + 1;
    if (this.overworldData!.isPassable(returnX, spawnY)) {
      return { x: returnX, y: spawnY };
    }
    return { x: returnX, y: returnY };
  }

  private async loadInterior(destMap: string, destWarpId: number): Promise<{ x: number; y: number }> {
    let mapJson;
    try {
      mapJson = await this.assetLoader.loadMapJSON(`./maps/interiors/${destMap}.json`);
    } catch {
      try {
        mapJson = await this.assetLoader.loadMapJSON(`./maps/dungeons/${destMap}.json`);
      } catch {
        console.warn(`Map not found: ${destMap} — staying on current map`);
        throw new Error(`Map not found: ${destMap}`);
      }
    }

    this.currentInterior = MapData.fromTiledJSON(mapJson, destMap);
    this.currentInteriorTilesets = mapJson.tilesets;
    this.tileTextures = await this.assetLoader.loadTilesets(mapJson.tilesets, './tilesets');
    this.activeMode = 'interior';

    // Spawn one tile north of the warp (into the room)
    const warp = this.currentInterior.warps[destWarpId];
    if (!warp) return { x: 1, y: 1 };
    const spawnY = warp.y - 1;
    if (spawnY >= 0 && this.currentInterior.isPassable(warp.x, spawnY)) {
      return { x: warp.x, y: spawnY };
    }
    return { x: warp.x, y: warp.y };
  }
}
