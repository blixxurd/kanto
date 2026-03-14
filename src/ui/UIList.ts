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
  private labels: ReturnType<typeof createText>[] = [];
  private values: ReturnType<typeof createText>[] = [];
  private _arrow: ReturnType<typeof createText>;

  constructor(items: ListItem[]) {
    super();
    this.items = items;

    this._arrow = createText(CURSOR_CHAR, { fontSize: 7 });
    this.addChild(this._arrow);

    for (let i = 0; i < items.length; i++) {
      const label = createText(items[i].label);
      label.x = 10;
      label.y = i * LINE_HEIGHT;
      this.addChild(label);
      this.labels.push(label);

      if (items[i].value !== undefined) {
        const val = createText(items[i].value!, { fill: 0xaaaaaa });
        val.y = i * LINE_HEIGHT;
        this.addChild(val);
        this.values.push(val);
      } else {
        this.values.push(null!);
      }
    }

    this.updateCursor();
    this.layoutValues();
  }

  handleInput(input: Input): void {
    if (input.justPressed('ArrowUp') || input.justPressed('w') || input.justPressed('W')) {
      this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
      this.updateCursor();
    } else if (input.justPressed('ArrowDown') || input.justPressed('s') || input.justPressed('S')) {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.updateCursor();
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
      this.layoutValues();
    }
  }

  private updateCursor(): void {
    this._arrow.x = 0;
    this._arrow.y = this.selectedIndex * LINE_HEIGHT + 1;
  }

  private layoutValues(): void {
    for (let i = 0; i < this.values.length; i++) {
      if (this.values[i]) {
        this.values[i].x = 70;
      }
    }
  }
}
