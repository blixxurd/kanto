import { Container, Graphics, Text } from 'pixi.js';
import { Camera } from './Camera';
import { MapData } from '../world/MapData';
import { TILE_SIZE } from '../utils/TileCoords';

type OverlayMode = 'none' | 'collision' | 'zones' | 'tile_ids';

export class DebugOverlay {
  private container: Container;
  private graphics = new Graphics();
  private labels: Text[] = [];
  private camera: Camera;
  private mapData: MapData | null = null;
  private mode: OverlayMode = 'none';
  private lastViewport = '';

  constructor(worldContainer: Container, camera: Camera) {
    this.camera = camera;
    this.container = new Container();
    this.container.addChild(this.graphics);
    worldContainer.addChild(this.container);
    this.container.visible = false;
  }

  load(mapData: MapData): void {
    this.mapData = mapData;
    this.lastViewport = '';
  }

  toggle(): void {
    const modes: OverlayMode[] = ['none', 'collision', 'zones', 'tile_ids'];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
    this.container.visible = this.mode !== 'none';
    this.lastViewport = '';
    this.clearLabels();
  }

  getMode(): string {
    return this.mode;
  }

  update(): void {
    if (this.mode === 'none' || !this.mapData) return;

    const vp = this.camera.getViewport();
    const key = `${Math.floor(vp.left)},${Math.floor(vp.top)},${Math.floor(vp.right)},${Math.floor(vp.bottom)},${this.mode}`;
    if (key === this.lastViewport) return;
    this.lastViewport = key;

    this.graphics.clear();
    this.clearLabels();

    const startX = Math.max(0, Math.floor(vp.left / TILE_SIZE));
    const startY = Math.max(0, Math.floor(vp.top / TILE_SIZE));
    const endX = Math.min(this.mapData.width, Math.ceil(vp.right / TILE_SIZE));
    const endY = Math.min(this.mapData.height, Math.ceil(vp.bottom / TILE_SIZE));

    switch (this.mode) {
      case 'collision':
        this.renderCollision(startX, startY, endX, endY);
        break;
      case 'zones':
        this.renderZones(startX, startY, endX, endY);
        break;
      case 'tile_ids':
        this.renderTileIds(startX, startY, endX, endY);
        break;
    }
  }

  private renderCollision(sx: number, sy: number, ex: number, ey: number): void {
    if (!this.mapData) return;
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const blocked = !this.mapData.isPassable(x, y);
        this.graphics.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        this.graphics.fill({ color: blocked ? 0xff0000 : 0x00ff00, alpha: 0.25 });
      }
    }
  }

  private renderZones(sx: number, sy: number, ex: number, ey: number): void {
    if (!this.mapData) return;
    const zones = this.mapData.zones;
    if (!zones) return;

    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff];
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const b = z.bounds;
      // Only draw if visible
      if (b.x + b.width < sx || b.x > ex || b.y + b.height < sy || b.y > ey) continue;
      const color = colors[i % colors.length];
      this.graphics.rect(b.x * TILE_SIZE, b.y * TILE_SIZE, b.width * TILE_SIZE, b.height * TILE_SIZE);
      this.graphics.stroke({ color, width: 2, alpha: 0.7 });

      const label = new Text({
        text: z.name || z.id,
        style: { fontFamily: 'monospace', fontSize: 8, fill: color },
      });
      label.x = b.x * TILE_SIZE + 2;
      label.y = b.y * TILE_SIZE + 2;
      this.container.addChild(label);
      this.labels.push(label);
    }
  }

  private renderTileIds(sx: number, sy: number, ex: number, ey: number): void {
    if (!this.mapData) return;
    // Only render tile IDs at high zoom to keep readable
    const zoom = this.camera.getZoom();
    if (zoom < 3) return;

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const gid = this.mapData.getBottomTile(x, y);
        if (gid <= 0) continue;
        const label = new Text({
          text: String(gid),
          style: { fontFamily: 'monospace', fontSize: 6, fill: 0xffffff, stroke: { color: 0x000000, width: 1 } },
        });
        label.x = x * TILE_SIZE + 1;
        label.y = y * TILE_SIZE + 1;
        this.container.addChild(label);
        this.labels.push(label);
      }
    }
  }

  private clearLabels(): void {
    for (const l of this.labels) {
      this.container.removeChild(l);
      l.destroy();
    }
    this.labels = [];
  }
}
