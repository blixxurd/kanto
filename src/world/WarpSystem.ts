import type { Warp, WarpEvent, WarpType, Direction } from '../types/game';
import { MapData } from './MapData';
import { DIRECTION_DELTAS } from '../utils/Direction';
import { EventEmitter } from '../utils/EventEmitter';

/**
 * Metatile behavior constants for warp types.
 * From decomp/include/constants/metatile_behaviors.h
 */
const MB_CAVE_DOOR           = 0x60;
const MB_LADDER              = 0x61;
const MB_EAST_ARROW_WARP     = 0x62;
const MB_WEST_ARROW_WARP     = 0x63;
const MB_NORTH_ARROW_WARP    = 0x64;
const MB_SOUTH_ARROW_WARP    = 0x65;
const MB_FALL_WARP           = 0x66;
const MB_REGULAR_WARP        = 0x67;
const MB_LAVARIDGE_1F_WARP   = 0x68;
const MB_WARP_DOOR           = 0x69;
const MB_UP_ESCALATOR        = 0x6A;
const MB_DOWN_ESCALATOR      = 0x6B;
const MB_UP_RIGHT_STAIR_WARP = 0x6C;
const MB_UP_LEFT_STAIR_WARP  = 0x6D;
const MB_DOWN_RIGHT_STAIR_WARP = 0x6E;
const MB_DOWN_LEFT_STAIR_WARP  = 0x6F;
const MB_UNION_ROOM_WARP     = 0x71;

/** Map behavior ID to WarpType. */
function classifyBehavior(behavior: number): WarpType | null {
  switch (behavior) {
    case MB_WARP_DOOR: return 'door';
    case MB_CAVE_DOOR: return 'cave';
    case MB_LADDER: return 'ladder';
    case MB_REGULAR_WARP:
    case MB_LAVARIDGE_1F_WARP:
    case MB_UNION_ROOM_WARP:
      return 'regular';
    case MB_EAST_ARROW_WARP:
    case MB_WEST_ARROW_WARP:
    case MB_NORTH_ARROW_WARP:
    case MB_SOUTH_ARROW_WARP:
      return 'arrow';
    case MB_UP_RIGHT_STAIR_WARP:
    case MB_UP_LEFT_STAIR_WARP:
    case MB_DOWN_RIGHT_STAIR_WARP:
    case MB_DOWN_LEFT_STAIR_WARP:
      return 'stair';
    case MB_UP_ESCALATOR:
    case MB_DOWN_ESCALATOR:
      return 'escalator';
    case MB_FALL_WARP:
      return 'fall';
    default:
      return null;
  }
}

/** Get the required direction for an arrow warp behavior. */
function getArrowWarpDirection(behavior: number): Direction | null {
  switch (behavior) {
    case MB_EAST_ARROW_WARP: return 'right';
    case MB_WEST_ARROW_WARP: return 'left';
    case MB_NORTH_ARROW_WARP: return 'up';
    case MB_SOUTH_ARROW_WARP: return 'down';
    default: return null;
  }
}

/**
 * Behavior-based warp detection system.
 *
 * Matching GBA field_control_avatar.c — warps require BOTH a warp event at
 * the position AND a recognized warp metatile behavior. Tiles with behavior
 * 0x00 (MB_NORMAL) never trigger warps even if a warp event exists there.
 *
 * Trigger paths:
 * 1. Step-on warps: trigger after completing a tile move (ladder, cave, regular, fall, escalator, door)
 * 2. Arrow warps: trigger while holding the matching direction on the tile
 * 3. Door warps: trigger while holding UP on a door tile (MB_WARP_DOOR)
 * 4. Stair warps: trigger while holding the matching direction
 */
export class WarpSystem {
  readonly onWarp = new EventEmitter<WarpEvent>();
  private mapData: MapData | null = null;
  private lastTileX = -1;
  private lastTileY = -1;
  private lastDirection: Direction | null = null;

  load(mapData: MapData): void {
    this.mapData = mapData;
  }

  /** Set the current tile without triggering a warp (used after spawn/teleport). */
  setPosition(tileX: number, tileY: number, direction?: Direction): void {
    this.lastTileX = tileX;
    this.lastTileY = tileY;
    if (direction !== undefined) this.lastDirection = direction;
  }

  /**
   * Check for warps. Called every frame with the player's current position.
   * @param tileX Current tile X
   * @param tileY Current tile Y
   * @param direction Direction the player is facing
   * @param holdingDirection Whether the player is actively pressing a direction key
   * @param tookStep Whether the player just completed a tile move this frame
   */
  check(
    tileX: number,
    tileY: number,
    direction: Direction,
    holdingDirection: boolean,
    tookStep: boolean,
  ): void {
    if (!this.mapData) return;

    const isNewTile = tileX !== this.lastTileX || tileY !== this.lastTileY;
    const dirChanged = direction !== this.lastDirection;

    // Path 3 (checked first): Door warps — check the tile AHEAD of the player.
    // In the GBA, door detection looks at the metatile the player is FACING,
    // not standing on. The door opens before the player walks onto it.
    // This must run regardless of the current tile's behavior.
    if (holdingDirection && direction === 'up') {
      const delta = DIRECTION_DELTAS[direction];
      const aheadX = tileX + delta.dx;
      const aheadY = tileY + delta.dy;
      const aheadBehavior = this.mapData.getBehavior(aheadX, aheadY);
      const aheadType = classifyBehavior(aheadBehavior);
      if (aheadType === 'door') {
        const aheadWarp = this.mapData.getWarpAt(aheadX, aheadY);
        if (aheadWarp) {
          this.lastTileX = tileX;
          this.lastTileY = tileY;
          this.lastDirection = direction;
          this.onWarp.emit({ warp: aheadWarp, warpType: 'door', behavior: aheadBehavior });
          return;
        }
      }
    }

    const behavior = this.mapData.getBehavior(tileX, tileY);
    const warpType = classifyBehavior(behavior);

    // Check for a warp event at this position
    const warp = this.mapData.getWarpAt(tileX, tileY);
    if (!warp) {
      if (isNewTile) {
        this.lastTileX = tileX;
        this.lastTileY = tileY;
      }
      this.lastDirection = direction;
      return;
    }

    // Behavior-based warp detection (matching GBA field_control_avatar.c)

    if (warpType) {
      // Path 1: Step-on warps — trigger when stepping onto a new tile
      if (warpType === 'ladder' || warpType === 'cave' || warpType === 'regular'
          || warpType === 'fall' || warpType === 'escalator') {
        if (isNewTile && tookStep) {
          this.lastTileX = tileX;
          this.lastTileY = tileY;
          this.lastDirection = direction;
          this.onWarp.emit({ warp, warpType, behavior });
          return;
        }
      }

      // Path 2: Arrow warps — trigger on matching direction.
      // tookStep: stepped onto tile facing the required direction (key may be released
      //   by the frame the step completes, but the step itself proves intent).
      // holdingDirection && dirChanged: turned to face the warp direction on the tile.
      if (warpType === 'arrow') {
        const requiredDir = getArrowWarpDirection(behavior);
        if (requiredDir === direction && (tookStep || (holdingDirection && dirChanged))) {
          this.lastTileX = tileX;
          this.lastTileY = tileY;
          this.lastDirection = direction;
          this.onWarp.emit({ warp, warpType, behavior });
          return;
        }
      }

      // Path 4: Stair warps — trigger on matching direction.
      // Same two-path logic as arrows: tookStep for walk-on, dirChanged for turn.
      if (warpType === 'stair') {
        if (isStairDirectionValid(behavior, direction)
            && (tookStep || (holdingDirection && dirChanged))) {
          this.lastTileX = tileX;
          this.lastTileY = tileY;
          this.lastDirection = direction;
          this.onWarp.emit({ warp, warpType, behavior });
          return;
        }
      }
    }
    // No fallback for behavior 0x00 — matching GBA field_control_avatar.c:
    // IsWarpMetatileBehavior() returns false for MB_NORMAL, so tiles with
    // behavior 0x00 never auto-trigger warps even if a warp event exists.
    // In the GBA, those warps are script-triggered only.

    // Update position tracker for non-triggering visits
    if (isNewTile) {
      this.lastTileX = tileX;
      this.lastTileY = tileY;
    }
    this.lastDirection = direction;
  }
}

/**
 * GBA stair direction check (from IsDirectionalStairWarpMetatileBehavior):
 * - Left stairs (UP_LEFT, DOWN_LEFT) trigger when holding WEST (left)
 * - Right stairs (UP_RIGHT, DOWN_RIGHT) trigger when holding EAST (right)
 */
function isStairDirectionValid(behavior: number, direction: Direction): boolean {
  switch (direction) {
    case 'left':
      return behavior === MB_UP_LEFT_STAIR_WARP || behavior === MB_DOWN_LEFT_STAIR_WARP;
    case 'right':
      return behavior === MB_UP_RIGHT_STAIR_WARP || behavior === MB_DOWN_RIGHT_STAIR_WARP;
    default:
      return false;
  }
}
