import type { TiledMap, TiledTileLayer, TiledObjectLayer } from '../types/tiled';
import type { Warp, Zone } from '../types/game';

export class MapData {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  bottomTiles: Uint32Array;
  topTiles: Uint32Array;
  collisionGrid: Uint8Array;
  warps: Warp[];
  zones: Zone[];

  constructor(id: string, width: number, height: number) {
    this.id = id;
    this.width = width;
    this.height = height;
    this.bottomTiles = new Uint32Array(width * height);
    this.topTiles = new Uint32Array(width * height);
    this.collisionGrid = new Uint8Array(width * height);
    this.warps = [];
    this.zones = [];
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

  getWarpAt(x: number, y: number): Warp | null {
    return this.warps.find(w => w.x === x && w.y === y) ?? null;
  }

  getZoneAt(x: number, y: number): Zone | null {
    return this.zones.find(z =>
      x >= z.bounds.x && x < z.bounds.x + z.bounds.width &&
      y >= z.bounds.y && y < z.bounds.y + z.bounds.height
    ) ?? null;
  }

  setTile(x: number, y: number, layer: 'bottom' | 'top', gid: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = y * this.width + x;
    if (layer === 'bottom') this.bottomTiles[idx] = gid;
    else this.topTiles[idx] = gid;
  }

  setCollision(x: number, y: number, blocked: boolean): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.collisionGrid[y * this.width + x] = blocked ? 1 : 0;
  }

  static fromTiledJSON(json: TiledMap, id = 'unknown'): MapData {
    const map = new MapData(id, json.width, json.height);

    for (const layer of json.layers) {
      if (layer.type === 'tilelayer') {
        const tileLayer = layer as TiledTileLayer;
        const arr = new Uint32Array(tileLayer.data);
        if (tileLayer.name === 'bottom') map.bottomTiles = arr;
        else if (tileLayer.name === 'top') map.topTiles = arr;
        else if (tileLayer.name === 'collision') map.collisionGrid = new Uint8Array(tileLayer.data);
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

  toTiledJSON(): TiledMap {
    return {
      width: this.width,
      height: this.height,
      tilewidth: 16,
      tileheight: 16,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      infinite: false,
      layers: [
        {
          name: 'bottom', type: 'tilelayer',
          width: this.width, height: this.height,
          data: Array.from(this.bottomTiles),
          visible: true, opacity: 1, x: 0, y: 0,
        },
        {
          name: 'top', type: 'tilelayer',
          width: this.width, height: this.height,
          data: Array.from(this.topTiles),
          visible: true, opacity: 1, x: 0, y: 0,
        },
        {
          name: 'collision', type: 'tilelayer',
          width: this.width, height: this.height,
          data: Array.from(this.collisionGrid),
          visible: false, opacity: 1, x: 0, y: 0,
        },
        {
          name: 'warps', type: 'objectgroup',
          objects: this.warps.map(w => ({
            id: w.id, name: w.destMap, type: 'warp',
            x: w.x * 16, y: w.y * 16, width: 16, height: 16,
            properties: [
              { name: 'destMap', type: 'string' as const, value: w.destMap },
              { name: 'destWarpId', type: 'int' as const, value: w.destWarpId },
            ],
          })),
        },
      ],
      tilesets: [],
    };
  }
}
