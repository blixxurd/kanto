import { Graphics, Container } from 'pixi.js';

export class TransitionEffect {
  private overlay: Graphics;
  private alpha = 0;
  private targetAlpha = 0;
  private speed = 0.05;
  private onComplete: (() => void) | null = null;
  private active = false;

  constructor(uiContainer: Container, screenW: number, screenH: number) {
    this.overlay = new Graphics();
    this.overlay.rect(0, 0, screenW, screenH);
    this.overlay.fill(0x000000);
    this.overlay.alpha = 0;
    uiContainer.addChild(this.overlay);
  }

  fadeOut(duration = 0.5, callback?: () => void): void {
    this.targetAlpha = 1;
    this.speed = 1 / (duration * 60);
    this.onComplete = callback ?? null;
    this.active = true;
  }

  fadeIn(duration = 0.5, callback?: () => void): void {
    this.targetAlpha = 0;
    this.speed = 1 / (duration * 60);
    this.onComplete = callback ?? null;
    this.active = true;
  }

  isActive(): boolean {
    return this.active;
  }

  update(): void {
    if (!this.active) return;

    if (this.alpha < this.targetAlpha) {
      this.alpha = Math.min(this.alpha + this.speed, this.targetAlpha);
    } else if (this.alpha > this.targetAlpha) {
      this.alpha = Math.max(this.alpha - this.speed, this.targetAlpha);
    }

    this.overlay.alpha = this.alpha;

    if (Math.abs(this.alpha - this.targetAlpha) < 0.001) {
      this.alpha = this.targetAlpha;
      this.overlay.alpha = this.alpha;
      this.active = false;
      this.onComplete?.();
      this.onComplete = null;
    }
  }

  resize(w: number, h: number): void {
    this.overlay.clear();
    this.overlay.rect(0, 0, w, h);
    this.overlay.fill(0x000000);
    this.overlay.alpha = this.alpha;
  }
}
