import { Player } from './Player';
import { Input } from '../core/Input';
import { CollisionMap } from '../world/CollisionMap';
import { DIRECTION_DELTAS } from '../utils/Direction';
import { TILE_SIZE } from '../utils/TileCoords';
import type { Direction } from '../types/game';

const WALK_FRAMES = 12;
const RUN_FRAMES = 7;
const JUMP_FRAMES = 16;

/** Ledge behavior → required direction to jump */
const LEDGE_BEHAVIORS: Record<number, Direction> = {
  0x38: 'right', // MB_JUMP_EAST
  0x39: 'left',  // MB_JUMP_WEST
  0x3A: 'up',    // MB_JUMP_NORTH
  0x3B: 'down',  // MB_JUMP_SOUTH
};

/**
 * Vertical pixel offset for each frame of a 16-frame ledge jump arc.
 * From the GBA JUMP_TYPE_NORMAL table.
 */
const JUMP_ARC = [-2, -4, -6, -8, -9, -10, -10, -10, -9, -8, -6, -5, -3, -2, 0, 0];

export class PlayerController {
  private state: 'idle' | 'moving' | 'jumping' = 'idle';
  private moveProgress = 0;
  private startX = 0;
  private startY = 0;
  private targetX = 0;
  private targetY = 0;
  private moveFrames = WALK_FRAMES;

  /** Called when the player begins moving onto a new tile. */
  onStep: ((tileX: number, tileY: number, moveFrames: number) => void) | null = null;
  /** Called when the player lands from a ledge jump. */
  onLand: ((tileX: number, tileY: number) => void) | null = null;

  constructor(
    private player: Player,
    private input: Input,
    private collision: CollisionMap,
  ) {}

  update(): void {
    if (this.state === 'moving') {
      this.updateMove();
    } else if (this.state === 'jumping') {
      this.updateJump();
    } else {
      const dir = this.input.getDirection();
      if (dir) {
        this.tryMove(dir);
      }
    }
  }

  private updateMove(): void {
    this.moveProgress++;
    const t = Math.min(1, this.moveProgress / this.moveFrames);
    this.player.pixelX = this.startX + (this.targetX - this.startX) * t;
    this.player.pixelY = this.startY + (this.targetY - this.startY) * t;
    this.player.jumpOffset = 0;
    this.player.updateSpritePosition();
    this.player.updateAnimation();

    if (t >= 1) {
      this.finishMove();
    }
  }

  private updateJump(): void {
    this.moveProgress++;
    const t = Math.min(1, this.moveProgress / JUMP_FRAMES);
    this.player.pixelX = this.startX + (this.targetX - this.startX) * t;
    this.player.pixelY = this.startY + (this.targetY - this.startY) * t;

    // Apply vertical arc offset
    const arcIdx = Math.min(this.moveProgress, JUMP_ARC.length - 1);
    this.player.jumpOffset = JUMP_ARC[arcIdx];
    this.player.updateSpritePosition();
    this.player.updateAnimation();

    if (this.moveProgress >= JUMP_FRAMES) {
      this.player.jumpOffset = 0;
      this.finishJump();
    }
  }

  private finishMove(): void {
    this.player.tileX = this.targetX / TILE_SIZE;
    this.player.tileY = this.targetY / TILE_SIZE;
    this.player.pixelX = this.targetX;
    this.player.pixelY = this.targetY;
    this.player.updateSpritePosition();
    this.state = 'idle';

    const dir = this.input.getDirection();
    if (dir) {
      this.tryMove(dir);
    } else {
      this.player.playAnimation(`idle_${this.player.direction}`);
    }
  }

  private finishJump(): void {
    this.player.tileX = this.targetX / TILE_SIZE;
    this.player.tileY = this.targetY / TILE_SIZE;
    this.player.pixelX = this.targetX;
    this.player.pixelY = this.targetY;
    this.player.jumpOffset = 0;
    this.player.updateSpritePosition();
    this.state = 'idle';
    this.onLand?.(this.player.tileX, this.player.tileY);

    this.player.playAnimation(`idle_${this.player.direction}`);
  }

  private tryMove(dir: Direction): void {
    this.player.direction = dir;
    const delta = DIRECTION_DELTAS[dir];
    const nextX = this.player.tileX + delta.dx;
    const nextY = this.player.tileY + delta.dy;

    // Check if the next tile is a ledge we can jump
    if (!this.collision.isPassable(nextX, nextY)) {
      const ledgeDir = this.getLedgeDirection(nextX, nextY);
      if (ledgeDir === dir) {
        // Jump over the ledge — land 2 tiles from current position
        const landX = this.player.tileX + delta.dx * 2;
        const landY = this.player.tileY + delta.dy * 2;
        if (this.collision.isPassable(landX, landY)) {
          this.startJump(dir, landX, landY);
          return;
        }
      }
      this.player.playAnimation(`idle_${dir}`);
      return;
    }

    this.state = 'moving';
    this.moveProgress = 0;
    this.moveFrames = this.input.isRunning() ? RUN_FRAMES : WALK_FRAMES;
    this.startX = this.player.tileX * TILE_SIZE;
    this.startY = this.player.tileY * TILE_SIZE;
    this.targetX = nextX * TILE_SIZE;
    this.targetY = nextY * TILE_SIZE;
    this.onStep?.(nextX, nextY, this.moveFrames);

    const animPrefix = this.input.isRunning() ? 'run' : 'walk';
    this.player.playAnimation(`${animPrefix}_${dir}`);
  }

  private startJump(dir: Direction, landX: number, landY: number): void {
    this.state = 'jumping';
    this.moveProgress = 0;
    this.startX = this.player.tileX * TILE_SIZE;
    this.startY = this.player.tileY * TILE_SIZE;
    this.targetX = landX * TILE_SIZE;
    this.targetY = landY * TILE_SIZE;

    this.player.playAnimation(`walk_${dir}`);
  }

  /** Returns the allowed jump direction for a ledge tile, or null. */
  private getLedgeDirection(x: number, y: number): Direction | null {
    const behavior = this.collision.getBehavior(x, y);
    return LEDGE_BEHAVIORS[behavior] ?? null;
  }

  isMoving(): boolean {
    return this.state !== 'idle';
  }

  getTileX(): number {
    return this.player.tileX;
  }

  getTileY(): number {
    return this.player.tileY;
  }
}
