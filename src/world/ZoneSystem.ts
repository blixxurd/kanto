import type { Zone } from '../types/game';
import { MapData } from './MapData';
import { EventEmitter } from '../utils/EventEmitter';

export class ZoneSystem {
  private currentZone: Zone | null = null;
  readonly onZoneChange = new EventEmitter<{ from: Zone | null; to: Zone | null }>();
  private mapData: MapData | null = null;

  load(mapData: MapData): void {
    this.mapData = mapData;
    this.currentZone = null;
  }

  update(tileX: number, tileY: number): void {
    if (!this.mapData) return;
    const zone = this.mapData.getZoneAt(tileX, tileY);
    if (zone?.id !== this.currentZone?.id) {
      const from = this.currentZone;
      this.currentZone = zone;
      this.onZoneChange.emit({ from, to: zone });
    }
  }

  getCurrentZone(): Zone | null {
    return this.currentZone;
  }
}
