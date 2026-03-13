import { Graphics, Container } from 'pixi.js';

export type FadeColor = 'black' | 'white';

export class TransitionEffect {
  private overlay: Graphics;
  private alpha = 0;
  private targetAlpha = 0;
  private speed = 0.05;
  private onComplete: (() => void) | null = null;
  private active = false;
  private currentColor: FadeColor = 'black';
  private screenW: number;
  private screenH: number;
  private uiContainer: Container;

  constructor(uiContainer: Container, screenW: number, screenH: number) {
    this.uiContainer = uiContainer;
    this.screenW = screenW;
    this.screenH = screenH;
    this.overlay = new Graphics();
    this.overlay.rect(0, 0, screenW, screenH);
    this.overlay.fill(0x000000);
    this.overlay.alpha = 0;
    uiContainer.addChild(this.overlay);
  }

  /**
   * Fade to opaque overlay.
   * @param duration Fade duration in seconds
   * @param callback Called when fully opaque
   * @param color 'black' (entering indoor) or 'white' (exiting to outdoor)
   */
  fadeOut(duration = 0.5, callback?: () => void, color: FadeColor = 'black'): void {
    this.setColor(color);
    this.targetAlpha = 1;
    this.speed = 1 / (duration * 60);
    this.onComplete = callback ?? null;
    this.active = true;
  }

  /**
   * Fade from opaque overlay to transparent.
   * @param duration Fade duration in seconds
   * @param callback Called when fully transparent
   * @param color 'black' or 'white' — should match the preceding fadeOut
   */
  fadeIn(duration = 0.5, callback?: () => void, color: FadeColor = 'black'): void {
    this.setColor(color);
    this.targetAlpha = 0;
    this.speed = 1 / (duration * 60);
    this.onComplete = callback ?? null;
    this.active = true;
  }

  private setColor(color: FadeColor): void {
    if (color === this.currentColor) return;
    this.currentColor = color;
    this.overlay.clear();
    this.overlay.rect(0, 0, this.screenW, this.screenH);
    this.overlay.fill(color === 'white' ? 0xFFFFFF : 0x000000);
    this.overlay.alpha = this.alpha;
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
    this.screenW = w;
    this.screenH = h;
    this.overlay.clear();
    this.overlay.rect(0, 0, w, h);
    this.overlay.fill(this.currentColor === 'white' ? 0xFFFFFF : 0x000000);
    this.overlay.alpha = this.alpha;
  }
}
