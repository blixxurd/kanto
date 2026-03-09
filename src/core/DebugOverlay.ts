import { Container, Graphics, Text } from 'pixi.js';
import { Camera } from './Camera';
import { MapData } from '../world/MapData';
import { TILE_SIZE } from '../utils/TileCoords';

/** Human-readable names for common metatile behaviors */
const BEHAVIOR_NAMES: Record<number, string> = {
  0x00: 'normal', 0x02: 'tall_grass', 0x03: 'long_grass',
  0x04: 'normal', 0x05: 'sand', 0x06: 'underwater',
  0x08: 'deep_sand', 0x09: 'short_grass',
  0x10: 'pond_water', 0x11: 'fast_water', 0x12: 'deep_water',
  0x13: 'waterfall', 0x15: 'ocean_water',
  0x20: 'ice', 0x21: 'sand_cave',
  0x30: 'impassable_E', 0x31: 'impassable_W', 0x32: 'impassable_N', 0x33: 'impassable_S',
  0x60: 'ledge_S', 0x61: 'ledge_N', 0x62: 'ledge_W', 0x63: 'ledge_E',
  0x69: 'warp_door', 0x6A: 'warp_stairs', 0x6C: 'warp_arrow',
  0xD1: 'cycling_grass',
};

type OverlayMode = 'none' | 'collision' | 'zones' | 'tile_ids';

export class DebugOverlay {
  private container: Container;
  private graphics = new Graphics();
  private labels: Text[] = [];
  private camera: Camera;
  private mapData: MapData | null = null;
  private mode: OverlayMode = 'none';
  private lastViewport = '';

  // Tile hover tooltip
  private tooltip: Text;
  private hoverHighlight = new Graphics();
  private mouseX = -1;
  private mouseY = -1;

  constructor(worldContainer: Container, camera: Camera) {
    this.camera = camera;
    this.container = new Container();
    this.container.addChild(this.graphics);
    this.container.addChild(this.hoverHighlight);
    worldContainer.addChild(this.container);
    this.container.visible = false;

    // Tooltip is in screen-space (added to stage, not world)
    this.tooltip = new Text({
      text: '',
      style: {
        fontFamily: 'monospace',
        fontSize: 11,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
        lineHeight: 14,
      },
    });
    this.tooltip.visible = false;

    // Track mouse position
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    window.addEventListener('mouseleave', () => {
      this.mouseX = -1;
      this.mouseY = -1;
    });
  }

  /** Must be called once after the UI container is available */
  attachTooltip(uiContainer: Container): void {
    uiContainer.addChild(this.tooltip);
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
    if (this.mode === 'none' || !this.mapData) {
      this.tooltip.visible = false;
      this.hoverHighlight.clear();
      return;
    }

    // Update hover tooltip
    this.updateTooltip();

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

  private updateTooltip(): void {
    if (this.mouseX < 0 || !this.mapData) {
      this.tooltip.visible = false;
      this.hoverHighlight.clear();
      return;
    }

    const world = this.camera.screenToWorld(this.mouseX, this.mouseY);
    const tx = Math.floor(world.x / TILE_SIZE);
    const ty = Math.floor(world.y / TILE_SIZE);

    if (tx < 0 || tx >= this.mapData.width || ty < 0 || ty >= this.mapData.height) {
      this.tooltip.visible = false;
      this.hoverHighlight.clear();
      return;
    }

    // Highlight hovered tile
    this.hoverHighlight.clear();
    this.hoverHighlight.rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    this.hoverHighlight.stroke({ color: 0xffff00, width: 1, alpha: 0.9 });

    // Build tooltip text
    const bottomGid = this.mapData.getBottomTile(tx, ty);
    const topGid = this.mapData.getTopTile(tx, ty);
    const passable = this.mapData.isPassable(tx, ty);
    const behavior = this.mapData.getBehavior(tx, ty);
    const behaviorName = BEHAVIOR_NAMES[behavior] || `0x${behavior.toString(16).padStart(2, '0')}`;
    const zone = this.mapData.getZoneAt(tx, ty);
    const warp = this.mapData.getWarpAt(tx, ty);

    let text = `(${tx}, ${ty})`;
    text += `\nGID: ${bottomGid}`;
    if (topGid > 0) text += ` / top: ${topGid}`;
    text += `\n${passable ? 'passable' : 'blocked'}`;
    text += ` | ${behaviorName}`;
    if (zone) text += `\n${zone.id}`;
    if (warp) text += `\nwarp → ${warp.destMap}`;

    this.tooltip.text = text;
    this.tooltip.visible = true;

    // Position tooltip near cursor, offset slightly
    this.tooltip.x = this.mouseX + 16;
    this.tooltip.y = this.mouseY + 16;
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
