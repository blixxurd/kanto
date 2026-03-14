import { Container } from 'pixi.js';
import type { Input } from '../core/Input';

export interface Menu {
  container: Container;
  onPush(): void;
  onPop(): void;
  handleInput(input: Input): void;
  update(): void;
}

export class MenuStack {
  private stack: Menu[] = [];
  private uiContainer: Container;

  constructor(uiContainer: Container) {
    this.uiContainer = uiContainer;
  }

  push(menu: Menu): void {
    this.stack.push(menu);
    this.uiContainer.addChild(menu.container);
    menu.onPush();
  }

  pop(): Menu | undefined {
    const menu = this.stack.pop();
    if (menu) {
      this.uiContainer.removeChild(menu.container);
      menu.onPop();
    }
    return menu;
  }

  clear(): void {
    while (this.stack.length > 0) {
      this.pop();
    }
  }

  isEmpty(): boolean {
    return this.stack.length === 0;
  }

  handleInput(input: Input): void {
    const top = this.stack[this.stack.length - 1];
    top?.handleInput(input);
  }

  update(): void {
    const top = this.stack[this.stack.length - 1];
    top?.update();
  }
}
