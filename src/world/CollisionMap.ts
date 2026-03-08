import { MapData } from './MapData';

export class CollisionMap {
  private mapData: MapData | null = null;

  load(mapData: MapData): void {
    this.mapData = mapData;
  }

  isPassable(x: number, y: number): boolean {
    if (!this.mapData) return false;
    return this.mapData.isPassable(x, y);
  }
}
