import { Player } from './Player';
import { Input } from '../core/Input';
import { CollisionMap } from '../world/CollisionMap';
import { DIRECTION_DELTAS } from '../utils/Direction';
import { TILE_SIZE } from '../utils/TileCoords';
import type { Direction } from '../types/game';

const WALK_FRAMES = 12;
const RUN_FRAMES = 7;

export class PlayerController {
  private state: 'idle' | 'moving' = 'idle';
  private moveProgress = 0;
  private startX = 0;
  private startY = 0;
  private targetX = 0;
  private targetY = 0;
  private moveFrames = WALK_FRAMES;

  constructor(
    private player: Player,
    private input: Input,
    private collision: CollisionMap,
  ) {}

  update(): void {
    if (this.state === 'moving') {
      this.moveProgress++;
      const t = Math.min(1, this.moveProgress / this.moveFrames);
      this.player.pixelX = this.startX + (this.targetX - this.startX) * t;
      this.player.pixelY = this.startY + (this.targetY - this.startY) * t;
      this.player.updateSpritePosition();
      this.player.updateAnimation();

      if (t >= 1) {
        this.player.tileX = this.targetX / TILE_SIZE;
        this.player.tileY = this.targetY / TILE_SIZE;
        this.player.pixelX = this.targetX;
        this.player.pixelY = this.targetY;
        this.player.updateSpritePosition();
        this.state = 'idle';

        // Immediately check for next step if direction held
        const dir = this.input.getDirection();
        if (dir) {
          this.tryMove(dir);
        } else {
          this.player.playAnimation(`idle_${this.player.direction}`);
        }
      }
    } else {
      const dir = this.input.getDirection();
      if (dir) {
        this.tryMove(dir);
      }
    }
  }

  private tryMove(dir: Direction): void {
    this.player.direction = dir;
    const delta = DIRECTION_DELTAS[dir];
    const nextX = this.player.tileX + delta.dx;
    const nextY = this.player.tileY + delta.dy;

    if (!this.collision.isPassable(nextX, nextY)) {
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

    const animPrefix = this.input.isRunning() ? 'run' : 'walk';
    this.player.playAnimation(`${animPrefix}_${dir}`);
  }

  isMoving(): boolean {
    return this.state === 'moving';
  }

  getTileX(): number {
    return this.player.tileX;
  }

  getTileY(): number {
    return this.player.tileY;
  }
}
