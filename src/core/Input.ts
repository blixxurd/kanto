import type { Direction } from '../types/game';

const DIRECTION_KEYS: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

export class Input {
  private keys = new Set<string>();
  private justPressedKeys = new Set<string>();
  private justReleasedKeys = new Set<string>();
  private callbacks = new Map<string, Array<() => void>>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.key)) {
        this.justPressedKeys.add(e.key);
        this.callbacks.get(e.key)?.forEach(cb => cb());
      }
      this.keys.add(e.key);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key);
      this.justReleasedKeys.add(e.key);
    });
  }

  isDown(key: string): boolean {
    return this.keys.has(key);
  }

  justPressed(key: string): boolean {
    return this.justPressedKeys.has(key);
  }

  getDirection(): Direction | null {
    for (const [key, dir] of Object.entries(DIRECTION_KEYS)) {
      if (this.keys.has(key)) return dir;
    }
    return null;
  }

  isRunning(): boolean {
    return this.keys.has('Shift');
  }

  /** Returns true if any direction key is currently held. */
  isHoldingDirection(): boolean {
    for (const key of Object.keys(DIRECTION_KEYS)) {
      if (this.keys.has(key)) return true;
    }
    return false;
  }

  onKeyDown(key: string, callback: () => void): void {
    if (!this.callbacks.has(key)) this.callbacks.set(key, []);
    this.callbacks.get(key)!.push(callback);
  }

  poll(): void {
    this.justPressedKeys.clear();
    this.justReleasedKeys.clear();
  }
}
