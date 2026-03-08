import { Container } from 'pixi.js';

export class Camera {
  x = 0;
  y = 0;
  private zoom = 4;
  private followTarget: { x: number; y: number } | null = null;
  private followLerp = 0.15;
  private screenW = 960;
  private screenH = 640;
  private boundsW = Infinity;
  private boundsH = Infinity;

  constructor(private worldContainer: Container) {
    this.setZoom(this.zoom);
  }

  setZoom(scale: number): void {
    this.zoom = Math.max(1, Math.min(10, Math.round(scale)));
    this.worldContainer.scale.set(this.zoom);
  }

  getZoom(): number {
    return this.zoom;
  }

  setScreenSize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
  }

  follow(target: { x: number; y: number }, lerp = 0.15): void {
    this.followTarget = target;
    this.followLerp = lerp;
  }

  stopFollow(): void {
    this.followTarget = null;
  }

  panTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  clampToBounds(mapW: number, mapH: number): void {
    this.boundsW = mapW;
    this.boundsH = mapH;
  }

  update(): void {
    if (this.followTarget) {
      this.x += (this.followTarget.x - this.x) * this.followLerp;
      this.y += (this.followTarget.y - this.y) * this.followLerp;
    }

    // Clamp to map bounds
    const halfViewW = this.screenW / (2 * this.zoom);
    const halfViewH = this.screenH / (2 * this.zoom);

    if (this.boundsW !== Infinity) {
      this.x = Math.max(halfViewW, Math.min(this.boundsW - halfViewW, this.x));
    }
    if (this.boundsH !== Infinity) {
      this.y = Math.max(halfViewH, Math.min(this.boundsH - halfViewH, this.y));
    }

    // Apply to container
    this.worldContainer.x = Math.round(this.screenW / 2 - this.x * this.zoom);
    this.worldContainer.y = Math.round(this.screenH / 2 - this.y * this.zoom);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.worldContainer.x) / this.zoom,
      y: (sy - this.worldContainer.y) / this.zoom,
    };
  }

  getViewport(): { left: number; top: number; right: number; bottom: number } {
    const halfW = this.screenW / (2 * this.zoom);
    const halfH = this.screenH / (2 * this.zoom);
    return {
      left: this.x - halfW,
      top: this.y - halfH,
      right: this.x + halfW,
      bottom: this.y + halfH,
    };
  }
}
