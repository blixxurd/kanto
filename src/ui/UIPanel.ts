import { Container, Graphics } from 'pixi.js';
import { createText } from './UIText';

const BG_COLOR = 0x101828;
const BG_ALPHA = 0.92;
const BORDER_COLOR = 0xffffff;
const BORDER_PADDING = 6;

export class UIPanel extends Container {
  private bg: Graphics;
  private panelWidth: number;
  private panelHeight: number;
  private pixelScale: number;

  constructor(width: number, height: number, pixelScale: number, title?: string) {
    super();
    this.panelWidth = width;
    this.panelHeight = height;
    this.pixelScale = pixelScale;
    this.scale.set(pixelScale);

    this.bg = new Graphics();
    this.drawBackground();
    this.addChild(this.bg);

    if (title) {
      const titleText = createText(title, { fontSize: 8 });
      titleText.x = Math.round((width - titleText.width) / 2);
      titleText.y = -4;
      this.addChild(titleText);
    }
  }

  private drawBackground(): void {
    const w = this.panelWidth;
    const h = this.panelHeight;

    // Fill
    this.bg.roundRect(0, 0, w, h, 2);
    this.bg.fill({ color: BG_COLOR, alpha: BG_ALPHA });

    // Outer border
    this.bg.roundRect(0, 0, w, h, 2);
    this.bg.stroke({ color: BORDER_COLOR, width: 1, alpha: 0.9 });

    // Inner border (1px inset)
    this.bg.roundRect(2, 2, w - 4, h - 4, 1);
    this.bg.stroke({ color: BORDER_COLOR, width: 1, alpha: 0.5 });
  }

  getContentArea(): { x: number; y: number; width: number; height: number } {
    return {
      x: BORDER_PADDING,
      y: BORDER_PADDING,
      width: this.panelWidth - BORDER_PADDING * 2,
      height: this.panelHeight - BORDER_PADDING * 2,
    };
  }

  centerOnScreen(screenWidth: number, screenHeight: number): void {
    this.x = Math.round((screenWidth - this.panelWidth * this.pixelScale) / 2);
    this.y = Math.round((screenHeight - this.panelHeight * this.pixelScale) / 2);
  }
}
