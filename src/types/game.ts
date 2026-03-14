export type Direction = 'up' | 'down' | 'left' | 'right';
export type GameState = 'booting' | 'playing' | 'transitioning';

/**
 * Warp type based on metatile behavior (from GBA field_control_avatar.c).
 * Each type has different triggering rules and transition effects.
 */
export type WarpType =
  | 'door'      // MB_WARP_DOOR (0x69) — animated door, requires facing north
  | 'cave'      // MB_CAVE_DOOR (0x60) — non-animated entrance, step-on
  | 'ladder'    // MB_LADDER (0x61) — step-on warp
  | 'regular'   // MB_REGULAR_WARP (0x67) — step-on warp
  | 'arrow'     // MB_*_ARROW_WARP (0x62-0x65) — directional, hold direction
  | 'stair'     // MB_*_STAIR_WARP (0x6C-0x6F) — directional with diagonal movement
  | 'escalator' // MB_UP/DOWN_ESCALATOR (0x6A-0x6B) — step-on
  | 'fall';     // MB_FALL_WARP (0x66) — step-on fall

export interface Warp {
  id: number;
  x: number;
  y: number;
  destMap: string;
  destWarpId: number;
  destX: number;
  destY: number;
}

export interface WarpEvent {
  warp: Warp;
  warpType: WarpType;
  behavior: number;
}

export interface Zone {
  id: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  music: string;
  weather: string;
  mapType: string;
  showNameOnEntry: boolean;
  encounterTable?: string;
}

export interface Connection {
  direction: Direction;
  map: string;
  offset: number;
}
