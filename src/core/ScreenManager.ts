import { Application } from 'pixi.js';
import { Camera } from './Camera';

/**
 * Target virtual resolution presets.
 * The game world is rendered at this logical size, then integer-scaled to fill the browser window.
 */
export const RESOLUTION_PRESETS = {
  GBA:    { width: 240, height: 160 },  // 15×10 tiles — authentic GBA
  DS:     { width: 256, height: 192 },  // 16×12 tiles
  WIDE:   { width: 320, height: 180 },  // 20×11.25 tiles — 16:9
  LARGE:  { width: 480, height: 320 },  // 30×20 tiles — zoomed out
} as const;

export class ScreenManager {
  private app: Application;
  private camera: Camera;
  private scale = 4;
  private targetWidth: number = RESOLUTION_PRESETS.GBA.width;
  private targetHeight: number = RESOLUTION_PRESETS.GBA.height;

  constructor(app: Application, camera: Camera) {
    this.app = app;
    this.camera = camera;

    window.addEventListener('resize', () => this.fitToWindow());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11' || (e.key === 'f' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault();
        this.toggleFullscreen();
      }
      // +/- for manual zoom override
      if (e.key === '+' || e.key === '=') {
        this.setScale(this.scale + 1);
      } else if (e.key === '-') {
        this.setScale(this.scale - 1);
      }
    });

    this.fitToWindow();
  }

  /** Set a target virtual resolution. Zoom auto-calculates to fill the window. */
  setTargetResolution(width: number, height: number): void {
    this.targetWidth = width;
    this.targetHeight = height;
    this.fitToWindow();
  }

  /** Manual zoom override (disregards target resolution until next fitToWindow). */
  setScale(s: number): void {
    this.scale = Math.max(1, Math.min(10, Math.round(s)));
    this.camera.setZoom(this.scale);
    this.fitToWindow();
  }

  getScale(): number {
    return this.scale;
  }

  fitToWindow(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.app.renderer.resize(w, h);

    // Calculate integer zoom so the visible area ≈ target resolution
    const zoomX = Math.floor(w / this.targetWidth);
    const zoomY = Math.floor(h / this.targetHeight);
    this.scale = Math.max(1, Math.min(zoomX, zoomY));
    this.camera.setZoom(this.scale);

    this.camera.setScreenSize(w, h);
  }

  async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }
}
