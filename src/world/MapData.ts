import type { TiledMap, TiledTileLayer, TiledObjectLayer } from '../types/tiled';
import type { Warp, Zone, NPCDef, Direction } from '../types/game';

export class MapData {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  bottomTiles: Uint32Array;
  topTiles: Uint32Array;
  collisionGrid: Uint8Array;
  behaviorGrid: Uint16Array;
  warps: Warp[];
  zones: Zone[];
  npcs: NPCDef[];
  /** Tileset firstgid values from the Tiled JSON, for GID → metatile ID mapping. */
  tilesetFirstGids: number[] = [];
  /** Tileset source filenames (e.g. 'general.tsj', 'pallet_town.tsj'), parallel to tilesetFirstGids. */
  tilesetSources: string[] = [];

  constructor(id: string, width: number, height: number) {
    this.id = id;
    this.width = width;
    this.height = height;
    this.bottomTiles = new Uint32Array(width * height);
    this.topTiles = new Uint32Array(width * height);
    this.collisionGrid = new Uint8Array(width * height);
    this.behaviorGrid = new Uint16Array(width * height);
    this.warps = [];
    this.zones = [];
    this.npcs = [];
  }

  getBottomTile(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.bottomTiles[y * this.width + x];
  }

  getTopTile(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.topTiles[y * this.width + x];
  }

  isPassable(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.collisionGrid[y * this.width + x] === 0;
  }

  getBehavior(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.behaviorGrid[y * this.width + x];
  }

  getWarpAt(x: number, y: number): Warp | null {
    return this.warps.find(w => w.x === x && w.y === y) ?? null;
  }

  getZoneAt(x: number, y: number): Zone | null {
    return this.zones.find(z =>
      x >= z.bounds.x && x < z.bounds.x + z.bounds.width &&
      y >= z.bounds.y && y < z.bounds.y + z.bounds.height
    ) ?? null;
  }


  static fromTiledJSON(json: TiledMap, id = 'unknown'): MapData {
    const map = new MapData(id, json.width, json.height);
    map.tilesetFirstGids = (json.tilesets || []).map((ts: any) => ts.firstgid);
    map.tilesetSources = (json.tilesets || []).map((ts: any) => ts.source ?? '');

    // Detect utility tileset GID offsets in Tiled-patched maps.
    // When present, collision/behavior layer values are Tiled GIDs, not raw values.
    let collisionFirstGid = 0;
    let behaviorFirstGid = 0;
    for (let i = 0; i < map.tilesetSources.length; i++) {
      const src = map.tilesetSources[i];
      if (src.includes('collision_overlay')) collisionFirstGid = map.tilesetFirstGids[i];
      else if (src.includes('behavior_overlay')) behaviorFirstGid = map.tilesetFirstGids[i];
    }

    for (const layer of json.layers) {
      if (layer.type === 'tilelayer') {
        const tileLayer = layer as TiledTileLayer;
        const arr = new Uint32Array(tileLayer.data);
        if (tileLayer.name === 'bottom') map.bottomTiles = arr;
        else if (tileLayer.name === 'top') map.topTiles = arr;
        else if (tileLayer.name === 'collision') {
          // Reverse GID remap: collision_firstgid → 1, 0 stays 0
          const grid = new Uint8Array(tileLayer.data.length);
          for (let i = 0; i < tileLayer.data.length; i++) {
            const v = tileLayer.data[i];
            grid[i] = (collisionFirstGid && v >= collisionFirstGid) ? 1 : (v ? 1 : 0);
          }
          map.collisionGrid = grid;
        }
        else if (tileLayer.name === 'behavior') {
          // Reverse GID remap: behavior_firstgid + value → value, 0 stays 0
          const grid = new Uint16Array(tileLayer.data.length);
          for (let i = 0; i < tileLayer.data.length; i++) {
            const v = tileLayer.data[i];
            grid[i] = (behaviorFirstGid && v >= behaviorFirstGid) ? v - behaviorFirstGid : v;
          }
          map.behaviorGrid = grid;
        }
      } else if (layer.type === 'objectgroup') {
        const objLayer = layer as TiledObjectLayer;
        if (objLayer.name === 'warps') {
          map.warps = objLayer.objects.map(obj => {
            const props = Object.fromEntries(
              (obj.properties ?? []).map(p => [p.name, p.value])
            );
            return {
              id: obj.id,
              x: Math.floor(obj.x / 16),
              y: Math.floor(obj.y / 16),
              destMap: String(props.destMap ?? ''),
              destWarpId: Number(props.destWarpId ?? 0),
              destX: 0,
              destY: 0,
            };
          });
        } else if (objLayer.name === 'npcs') {
          map.npcs = objLayer.objects.map(obj => {
            const props = Object.fromEntries(
              (obj.properties ?? []).map(p => [p.name, p.value])
            );
            return {
              id: obj.id,
              name: obj.name,
              x: Math.floor(obj.x / 16),
              y: Math.floor(obj.y / 16),
              sprite: String(props.sprite ?? ''),
              direction: (String(props.direction ?? 'down')) as Direction,
              movement: (String(props.movement ?? 'standing')) as NPCDef['movement'],
              ...(props.paceAxis ? { paceAxis: String(props.paceAxis) as 'horizontal' | 'vertical' } : {}),
              ...(props.paceDistance != null ? { paceDistance: Number(props.paceDistance) } : {}),
              ...(props.overheadIcon ? { overheadIcon: String(props.overheadIcon) } : {}),
            };
          });
        } else if (objLayer.name === 'zones') {
          map.zones = objLayer.objects.map(obj => {
            const props = Object.fromEntries(
              (obj.properties ?? []).map(p => [p.name, p.value])
            );
            return {
              id: obj.name,
              name: obj.name.replace('MAP_', '').replace(/_/g, ' ').toLowerCase()
                .replace(/\b\w/g, c => c.toUpperCase()),
              bounds: {
                x: Math.floor(obj.x / 16),
                y: Math.floor(obj.y / 16),
                width: Math.floor(obj.width / 16),
                height: Math.floor(obj.height / 16),
              },
              music: String(props.music ?? ''),
              weather: '',
              mapType: String(props.mapType ?? ''),
              showNameOnEntry: true,
            };
          });
        }
      }
    }

    return map;
  }

}
