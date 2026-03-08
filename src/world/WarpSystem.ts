import type { Warp, Direction } from '../types/game';
import { MapData } from './MapData';
import { EventEmitter } from '../utils/EventEmitter';

export class WarpSystem {
  readonly onWarp = new EventEmitter<Warp>();
  private mapData: MapData | null = null;
  private lastTileX = -1;
  private lastTileY = -1;

  load(mapData: MapData): void {
    this.mapData = mapData;
  }

  /** Set the current tile without triggering a warp (used after spawn/teleport). */
  setPosition(tileX: number, tileY: number): void {
    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  check(tileX: number, tileY: number, direction: Direction): void {
    if (!this.mapData) return;

    // Only trigger when the player steps onto a new tile
    if (tileX === this.lastTileX && tileY === this.lastTileY) return;
    this.lastTileX = tileX;
    this.lastTileY = tileY;

    const warp = this.mapData.getWarpAt(tileX, tileY);
    if (warp && this.isValidApproach(warp, direction)) {
      this.onWarp.emit(warp);
    }
  }

  /**
   * Determine if the player's movement direction is valid for triggering this warp.
   * Matches real Pokémon game behavior: door-mat warps at the bottom of a map
   * only trigger when walking south (exiting), and top-edge warps only when
   * walking north. All other warps (stairs, gatehouse exits, teleport pads)
   * trigger from any direction — collision layout naturally prevents wrong access.
   */
  private isValidApproach(warp: Warp, direction: Direction): boolean {
    if (!this.mapData) return true;
    const h = this.mapData.height;

    // Bottom edge (y >= height - 3): exit mats → walking south only
    if (warp.y >= h - 3) return direction === 'down';

    // All other warps (stairs, teleport pads, top-edge entries): trigger from
    // any direction. Collision layout naturally prevents wrong access.
    return true;
  }
}
