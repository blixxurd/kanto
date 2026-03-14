import { NPC } from './NPC';
import { CollisionMap } from '../world/CollisionMap';
import { DIRECTION_DELTAS } from '../utils/Direction';
import { TILE_SIZE } from '../utils/TileCoords';
import type { Direction, MovementPattern } from '../types/game';

const WALK_FRAMES = 12;
const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

export class NPCController {
  private state: 'idle' | 'moving' = 'idle';
  private moveProgress = 0;
  private startX = 0;
  private startY = 0;
  private targetPxX = 0;
  private targetPxY = 0;
  private targetTileX = 0;
  private targetTileY = 0;
  private idleTimer = 0;
  private paceDir = 1; // +1 or -1 for pace pattern
  private paceCount = 0;
  private paceNeedsTurn = false;

  constructor(
    private npc: NPC,
    private collision: CollisionMap,
    private occupancyCheck: (x: number, y: number) => boolean,
  ) {
    this.idleTimer = this.randomIdleTime();
  }

  /** The tile this NPC is moving toward (or current tile if idle). */
  getTargetTile(): { x: number; y: number } {
    if (this.state === 'moving') {
      return { x: this.targetTileX, y: this.targetTileY };
    }
    return { x: this.npc.tileX, y: this.npc.tileY };
  }

  update(): void {
    if (this.state === 'moving') {
      this.updateMove();
    } else {
      this.updateIdle();
    }
  }

  private updateMove(): void {
    this.moveProgress++;
    const t = Math.min(1, this.moveProgress / WALK_FRAMES);
    this.npc.pixelX = this.startX + (this.targetPxX - this.startX) * t;
    this.npc.pixelY = this.startY + (this.targetPxY - this.startY) * t;
    this.npc.updateSpritePosition();
    this.npc.updateAnimation();

    if (t >= 1) {
      this.npc.tileX = this.targetTileX;
      this.npc.tileY = this.targetTileY;
      this.npc.pixelX = this.targetPxX;
      this.npc.pixelY = this.targetPxY;
      this.npc.updateSpritePosition();

      // Pace: chain next step immediately (no idle gap) unless at turnaround
      if (this.npc.def.movement === 'pace' && !this.paceNeedsTurn) {
        this.state = 'idle';
        this.idleTimer = 0;
      } else {
        this.npc.playAnimation(`idle_${this.npc.direction}`);
        this.state = 'idle';
        this.idleTimer = this.randomIdleTime();
      }
    }
  }

  private updateIdle(): void {
    const pattern = this.npc.def.movement;
    if (pattern === 'standing') return;

    this.idleTimer--;
    if (this.idleTimer > 0) return;

    switch (pattern) {
      case 'look_around':
        this.doLookAround();
        break;
      case 'wander':
        this.doWander(3);
        break;
      case 'mega_wander':
        this.doWander(-1);
        break;
      case 'pace':
        this.doPace();
        break;
    }
  }

  private doLookAround(): void {
    const dir = DIRECTIONS[Math.floor(Math.random() * 4)];
    this.npc.direction = dir;
    this.npc.playAnimation(`idle_${dir}`);
    this.idleTimer = 60 + Math.floor(Math.random() * 120);
  }

  private doWander(radius: number): void {
    const dir = DIRECTIONS[Math.floor(Math.random() * 4)];
    const delta = DIRECTION_DELTAS[dir];
    const nx = this.npc.tileX + delta.dx;
    const ny = this.npc.tileY + delta.dy;

    // Check radius constraint
    if (radius > 0) {
      const dx = nx - this.npc.def.x;
      const dy = ny - this.npc.def.y;
      if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
        this.npc.direction = dir;
        this.npc.playAnimation(`idle_${dir}`);
        this.idleTimer = 30 + Math.floor(Math.random() * 60);
        return;
      }
    }

    this.tryStartMove(dir, nx, ny);
    if (this.state === 'idle') {
      this.idleTimer = 30 + Math.floor(Math.random() * 60);
    }
  }

  private doPace(): void {
    const axis = this.npc.def.paceAxis ?? 'horizontal';
    const dist = this.npc.def.paceDistance ?? 2;

    let dir: Direction;
    if (axis === 'horizontal') {
      dir = this.paceDir > 0 ? 'right' : 'left';
    } else {
      dir = this.paceDir > 0 ? 'down' : 'up';
    }

    const delta = DIRECTION_DELTAS[dir];
    const nx = this.npc.tileX + delta.dx;
    const ny = this.npc.tileY + delta.dy;

    this.tryStartMove(dir, nx, ny);

    if (this.state === 'moving') {
      this.paceCount++;
      this.paceNeedsTurn = this.paceCount >= dist;
      if (this.paceNeedsTurn) {
        this.paceDir *= -1;
        this.paceCount = 0;
      }
    } else {
      // Blocked — reverse
      this.paceDir *= -1;
      this.paceCount = 0;
      this.paceNeedsTurn = false;
      this.idleTimer = 12;
    }
  }

  private tryStartMove(dir: Direction, nx: number, ny: number): void {
    this.npc.direction = dir;

    if (!this.collision.isPassable(nx, ny) || this.occupancyCheck(nx, ny)) {
      this.npc.playAnimation(`idle_${dir}`);
      return;
    }

    this.state = 'moving';
    this.moveProgress = 0;
    this.startX = this.npc.tileX * TILE_SIZE;
    this.startY = this.npc.tileY * TILE_SIZE;
    this.targetTileX = nx;
    this.targetTileY = ny;
    this.targetPxX = nx * TILE_SIZE;
    this.targetPxY = ny * TILE_SIZE;
    this.npc.playAnimation(`walk_${dir}`);
  }

  private randomIdleTime(): number {
    const pattern = this.npc.def.movement;
    switch (pattern) {
      case 'look_around': return 60 + Math.floor(Math.random() * 120);
      case 'wander':
      case 'mega_wander': return 90 + Math.floor(Math.random() * 210);
      case 'pace': return 12;
      default: return 9999;
    }
  }
}
