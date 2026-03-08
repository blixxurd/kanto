import { Assets, Texture, Rectangle } from 'pixi.js';
import type { TiledMap, TiledTilesetRef } from '../types/tiled';

interface TiledTSJ {
  name: string;
  image: string;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
}

export class AssetLoader {
  private tileTextures = new Map<number, Texture>();

  async loadMapJSON(path: string): Promise<TiledMap> {
    const resp = await fetch(path);
    return resp.json();
  }

  async loadJSON<T>(path: string): Promise<T> {
    const resp = await fetch(path);
    return resp.json();
  }

  /** Cache of canvas-backed TextureSources keyed by image URL */
  private canvasSources = new Map<string, Texture>();

  async loadTilesets(tilesetRefs: TiledTilesetRef[], basePath: string): Promise<Map<number, Texture>> {
    this.tileTextures.clear();

    for (const ref of tilesetRefs) {
      const tsjPath = `${basePath}/${ref.source}`;
      const tsj: TiledTSJ = await this.loadJSON(tsjPath);
      const imagePath = `${basePath}/${tsj.image}`;

      // Always use canvas-backed textures for consistent behavior.
      // This avoids pixi texture identity issues when the same tileset image
      // is used across different maps (e.g. general.tsj in overworld AND caves).
      const canvasTex = await this.loadAsCanvas(imagePath);

      const cols = tsj.columns;
      const tileW = tsj.tilewidth;
      const tileH = tsj.tileheight;

      for (let i = 0; i < tsj.tilecount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const frame = new Rectangle(col * tileW, row * tileH, tileW, tileH);
        const texture = new Texture({ source: canvasTex.source, frame });
        this.tileTextures.set(ref.firstgid + i, texture);
      }
    }

    return this.tileTextures;
  }

  /**
   * Load an image and return a canvas-backed Texture.
   * Creates a fresh canvas copy each time to avoid pixi's cached ImageBitmap textures,
   * which can cause GL state issues when reused across tilemap destroy/recreate cycles.
   */
  private async loadAsCanvas(imagePath: string): Promise<Texture> {
    // Load the image through pixi's asset system (handles caching/fetching)
    const pixi_tex = await Assets.load(imagePath);
    const src = pixi_tex.source;

    // Create a canvas copy of the image data
    const canvas = document.createElement('canvas');
    canvas.width = src.pixelWidth;
    canvas.height = src.pixelHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(src.resource as any, 0, 0);

    // Create a new texture through pixi's standard pathway
    return Texture.from({ resource: canvas, scaleMode: 'nearest' });
  }

  getTileTexture(gid: number): Texture | undefined {
    return this.tileTextures.get(gid);
  }
}
