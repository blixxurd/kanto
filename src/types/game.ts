export type Direction = 'up' | 'down' | 'left' | 'right';
export type GameState = 'booting' | 'playing' | 'editor' | 'transitioning';

export interface Warp {
  id: number;
  x: number;
  y: number;
  destMap: string;
  destWarpId: number;
  destX: number;
  destY: number;
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
