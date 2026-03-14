import { MapData } from './MapData';

/** Water tile behaviors that become passable when surfing */
const SURFABLE_BEHAVIORS = new Set([
  0x10, // pond_water
  0x11, // fast_water
  0x12, // deep_water
  0x15, // ocean_water
]);

export class CollisionMap {
  private mapData: MapData | null = null;
  surfing = false;

  load(mapData: MapData): void {
    this.mapData = mapData;
  }

  isPassable(x: number, y: number): boolean {
    if (!this.mapData) return false;
    if (this.mapData.isPassable(x, y)) return true;
    if (this.surfing && SURFABLE_BEHAVIORS.has(this.mapData.getBehavior(x, y))) return true;
    return false;
  }

  getBehavior(x: number, y: number): number {
    if (!this.mapData) return 0;
    return this.mapData.getBehavior(x, y);
  }
}
