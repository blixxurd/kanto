import { Container } from 'pixi.js';
import { createText } from './UIText';
import type { Input } from '../core/Input';

export interface ListItem {
  label: string;
  value?: string;
  action?: () => void;
}

const LINE_HEIGHT = 12;
const CURSOR_CHAR = '\u25B6'; // ▶

export class UIList extends Container {
  private items: ListItem[] = [];
  private selectedIndex = 0;
  private scrollOffset = 0;
  private maxVisible: number;
  private labels: ReturnType<typeof createText>[] = [];
  private values: ReturnType<typeof createText>[] = [];
  private _arrow: ReturnType<typeof createText>;
  private scrollUp: ReturnType<typeof createText> | null = null;
  private scrollDown: ReturnType<typeof createText> | null = null;

  constructor(items: ListItem[], maxVisible?: number) {
    super();
    this.items = items;
    this.maxVisible = maxVisible ?? items.length;

    this._arrow = createText(CURSOR_CHAR, { fontSize: 7 });
    this.addChild(this._arrow);

    for (let i = 0; i < items.length; i++) {
      const label = createText(items[i].label);
      label.x = 10;
      this.addChild(label);
      this.labels.push(label);

      if (items[i].value !== undefined) {
        const val = createText(items[i].value!, { fill: 0xaaaaaa });
        this.addChild(val);
        this.values.push(val);
      } else {
        this.values.push(null!);
      }
    }

    // Scroll indicators
    if (items.length > this.maxVisible) {
      this.scrollUp = createText('\u25B2', { fontSize: 6, fill: 0x888888 }); // ▲
      this.scrollUp.x = 0;
      this.addChild(this.scrollUp);

      this.scrollDown = createText('\u25BC', { fontSize: 6, fill: 0x888888 }); // ▼
      this.scrollDown.x = 0;
      this.addChild(this.scrollDown);
    }

    this.layoutItems();
  }

  handleInput(input: Input): void {
    if (input.justPressed('ArrowUp') || input.justPressed('w') || input.justPressed('W')) {
      this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
      this.ensureVisible();
      this.layoutItems();
    } else if (input.justPressed('ArrowDown') || input.justPressed('s') || input.justPressed('S')) {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.ensureVisible();
      this.layoutItems();
    } else if (
      input.justPressed('Enter') ||
      input.justPressed('z') ||
      input.justPressed('Z') ||
      input.justPressed(' ')
    ) {
      this.items[this.selectedIndex]?.action?.();
    }
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  updateValue(index: number, value: string): void {
    if (this.values[index]) {
      this.values[index].text = value;
      this.layoutItems();
    }
  }

  /** Scroll so the selected index is within the visible window. */
  private ensureVisible(): void {
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
      this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
    }
    // Wrap: if we wrapped from 0 to last, jump scroll to bottom
    if (this.selectedIndex === this.items.length - 1 && this.scrollOffset === 0) {
      this.scrollOffset = Math.max(0, this.items.length - this.maxVisible);
    }
    // Wrap: if we wrapped from last to 0, jump scroll to top
    if (this.selectedIndex === 0) {
      this.scrollOffset = 0;
    }
  }

  private layoutItems(): void {
    const end = Math.min(this.scrollOffset + this.maxVisible, this.items.length);

    for (let i = 0; i < this.items.length; i++) {
      const visible = i >= this.scrollOffset && i < end;
      const row = i - this.scrollOffset;

      this.labels[i].visible = visible;
      if (visible) {
        this.labels[i].y = row * LINE_HEIGHT;
      }

      if (this.values[i]) {
        this.values[i].visible = visible;
        if (visible) {
          this.values[i].x = 70;
          this.values[i].y = row * LINE_HEIGHT;
        }
      }
    }

    // Cursor
    const cursorRow = this.selectedIndex - this.scrollOffset;
    this._arrow.x = 0;
    this._arrow.y = cursorRow * LINE_HEIGHT + 1;

    // Scroll indicators
    if (this.scrollUp) {
      this.scrollUp.visible = this.scrollOffset > 0;
      this.scrollUp.y = -LINE_HEIGHT + 2;
    }
    if (this.scrollDown) {
      this.scrollDown.visible = end < this.items.length;
      this.scrollDown.y = this.maxVisible * LINE_HEIGHT;
    }
  }
}
