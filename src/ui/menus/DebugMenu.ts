import { Container } from 'pixi.js';
import type { Input } from '../../core/Input';
import type { Menu, MenuStack } from '../MenuStack';
import type { Zone } from '../../types/game';
import { UIPanel } from '../UIPanel';
import { UIList } from '../UIList';
import { createText } from '../UIText';

export interface SpriteInfo {
  name: string;
  sheet: string;
}

export interface GameActions {
  teleport(x: number, y: number): void;
  getPlayerPos(): { x: number; y: number };
  getZone(): Zone | null;
  getScale(): number;
  setScale(s: number): void;
  toggleDebugOverlay(): void;
  getDebugMode(): string;
  getZones(): Zone[];
  getSurfing(): boolean;
  setSurfing(v: boolean): void;
  getAvailableSprites(): SpriteInfo[];
  setSprite(sheet: string): void;
  setOverheadIcon(icon: string | null): void;
}

export class DebugMenu implements Menu {
  container = new Container();
  private panel: UIPanel;
  private list: UIList;
  private actions: GameActions;
  private menuStack: MenuStack;
  private pixelScale: number;

  constructor(actions: GameActions, pixelScale: number, menuStack: MenuStack) {
    this.actions = actions;
    this.menuStack = menuStack;
    this.pixelScale = pixelScale;

    this.panel = new UIPanel(130, 111, pixelScale, 'DEBUG');
    this.container.addChild(this.panel);

    const overlay = actions.getDebugMode();
    const zoom = actions.getScale();

    this.list = new UIList([
      {
        label: 'Teleport...',
        action: () => this.openTeleportMenu(),
      },
      {
        label: 'Sprite...',
        action: () => this.openSpriteMenu(),
      },
      {
        label: 'Overhead...',
        action: () => this.openOverheadMenu(),
      },
      {
        label: 'Surf',
        value: actions.getSurfing() ? 'ON' : 'OFF',
        action: () => {
          actions.setSurfing(!actions.getSurfing());
          this.list.updateValue(3, actions.getSurfing() ? 'ON' : 'OFF');
        },
      },
      {
        label: 'Overlay',
        value: overlay,
        action: () => {
          actions.toggleDebugOverlay();
          this.list.updateValue(4, actions.getDebugMode());
        },
      },
      {
        label: 'Zoom',
        value: `${zoom}x`,
        action: () => {
          const s = actions.getScale();
          const next = s >= 8 ? 1 : s + 1;
          actions.setScale(next);
          this.list.updateValue(5, `${next}x`);
        },
      },
      {
        label: 'Info',
        action: () => this.showInfo(),
      },
    ]);

    const content = this.panel.getContentArea();
    this.list.x = content.x;
    this.list.y = content.y;
    this.panel.addChild(this.list);
  }

  onPush(): void {
    this.centerPanel();
  }

  onPop(): void {}

  handleInput(input: Input): void {
    if (input.justPressed('Escape') || input.justPressed('x') || input.justPressed('X')) {
      this.menuStack.clear();
      return;
    }
    this.list.handleInput(input);
  }

  update(): void {
    this.centerPanel();
  }

  private centerPanel(): void {
    this.panel.centerOnScreen(window.innerWidth, window.innerHeight);
  }

  private openTeleportMenu(): void {
    this.menuStack.push(new TeleportMenu(this.actions, this.pixelScale, this.menuStack));
  }

  private openSpriteMenu(): void {
    this.menuStack.push(new SpriteMenu(this.actions, this.pixelScale, this.menuStack));
  }

  private openOverheadMenu(): void {
    this.menuStack.push(new OverheadMenu(this.actions, this.pixelScale, this.menuStack));
  }

  private showInfo(): void {
    this.menuStack.push(new InfoMenu(this.actions, this.pixelScale, this.menuStack));
  }
}

class SpriteMenu implements Menu {
  container = new Container();
  private panel: UIPanel;
  private list: UIList;
  private menuStack: MenuStack;

  constructor(actions: GameActions, pixelScale: number, menuStack: MenuStack) {
    this.menuStack = menuStack;

    const sprites = actions.getAvailableSprites();
    const maxVisible = 10;
    const listHeight = maxVisible * 12 + 12;
    this.panel = new UIPanel(140, listHeight, pixelScale, 'SPRITE');
    this.container.addChild(this.panel);

    // "Default" option to reset to player sprite
    const items = [
      {
        label: 'Default (Red)',
        action: () => {
          actions.setSprite('./sprites/player_male.png');
          menuStack.clear();
        },
      },
      ...sprites.map((s) => ({
        label: s.name.replace(/_/g, ' '),
        action: () => {
          actions.setSprite(s.sheet);
          menuStack.clear();
        },
      })),
    ];

    this.list = new UIList(items, maxVisible);
    const content = this.panel.getContentArea();
    this.list.x = content.x;
    this.list.y = content.y;
    this.panel.addChild(this.list);
  }

  onPush(): void {
    this.centerPanel();
  }
  onPop(): void {}

  handleInput(input: Input): void {
    if (input.justPressed('Escape') || input.justPressed('x') || input.justPressed('X')) {
      this.menuStack.pop();
      return;
    }
    this.list.handleInput(input);
  }

  update(): void {
    this.centerPanel();
  }

  private centerPanel(): void {
    this.panel.centerOnScreen(window.innerWidth, window.innerHeight);
  }
}

class TeleportMenu implements Menu {
  container = new Container();
  private panel: UIPanel;
  private list: UIList;
  private menuStack: MenuStack;

  constructor(actions: GameActions, pixelScale: number, menuStack: MenuStack) {
    this.menuStack = menuStack;

    const zones = actions.getZones();
    // Filter to towns/cities for teleport list
    const towns = zones.filter(
      (z) => z.mapType === 'MAP_TYPE_TOWN' || z.mapType === 'MAP_TYPE_CITY',
    );

    const maxVisible = Math.min(towns.length, 10);
    const listHeight = maxVisible * 12 + 12;
    this.panel = new UIPanel(140, listHeight, pixelScale, 'TELEPORT');
    this.container.addChild(this.panel);

    this.list = new UIList(
      towns.map((z) => ({
        label: z.name,
        action: () => {
          const cx = z.bounds.x + Math.floor(z.bounds.width / 2);
          const cy = z.bounds.y + Math.floor(z.bounds.height / 2);
          actions.teleport(cx, cy);
          menuStack.clear();
        },
      })),
      maxVisible,
    );

    const content = this.panel.getContentArea();
    this.list.x = content.x;
    this.list.y = content.y;
    this.panel.addChild(this.list);
  }

  onPush(): void {
    this.centerPanel();
  }
  onPop(): void {}

  handleInput(input: Input): void {
    if (input.justPressed('Escape') || input.justPressed('x') || input.justPressed('X')) {
      this.menuStack.pop();
      return;
    }
    this.list.handleInput(input);
  }

  update(): void {
    this.centerPanel();
  }

  private centerPanel(): void {
    this.panel.centerOnScreen(window.innerWidth, window.innerHeight);
  }
}

const OVERHEAD_ICONS = [
  'none',
  'exclamation',
  'question_yellow',
  'question_blue',
  'question_gray',
  'speech',
  'speech_full',
  'sleep',
  'treasure',
  'star',
];

class OverheadMenu implements Menu {
  container = new Container();
  private panel: UIPanel;
  private list: UIList;
  private menuStack: MenuStack;

  constructor(actions: GameActions, pixelScale: number, menuStack: MenuStack) {
    this.menuStack = menuStack;

    const maxVisible = OVERHEAD_ICONS.length;
    const listHeight = maxVisible * 12 + 12;
    this.panel = new UIPanel(140, listHeight, pixelScale, 'OVERHEAD');
    this.container.addChild(this.panel);

    this.list = new UIList(
      OVERHEAD_ICONS.map((icon) => ({
        label: icon.replace(/_/g, ' '),
        action: () => {
          actions.setOverheadIcon(icon === 'none' ? null : icon);
          menuStack.clear();
        },
      })),
      maxVisible,
    );

    const content = this.panel.getContentArea();
    this.list.x = content.x;
    this.list.y = content.y;
    this.panel.addChild(this.list);
  }

  onPush(): void {
    this.centerPanel();
  }
  onPop(): void {}

  handleInput(input: Input): void {
    if (input.justPressed('Escape') || input.justPressed('x') || input.justPressed('X')) {
      this.menuStack.pop();
      return;
    }
    this.list.handleInput(input);
  }

  update(): void {
    this.centerPanel();
  }

  private centerPanel(): void {
    this.panel.centerOnScreen(window.innerWidth, window.innerHeight);
  }
}

class InfoMenu implements Menu {
  container = new Container();
  private panel: UIPanel;
  private menuStack: MenuStack;
  private actions: GameActions;
  private infoText: ReturnType<typeof createText>;

  constructor(actions: GameActions, pixelScale: number, menuStack: MenuStack) {
    this.menuStack = menuStack;
    this.actions = actions;

    this.panel = new UIPanel(130, 60, pixelScale, 'INFO');
    this.container.addChild(this.panel);

    this.infoText = createText('', { fontSize: 7 });
    const content = this.panel.getContentArea();
    this.infoText.x = content.x;
    this.infoText.y = content.y;
    this.panel.addChild(this.infoText);

    this.refreshInfo();
  }

  onPush(): void {
    this.centerPanel();
  }
  onPop(): void {}

  handleInput(input: Input): void {
    if (
      input.justPressed('Escape') ||
      input.justPressed('x') ||
      input.justPressed('X') ||
      input.justPressed('Enter') ||
      input.justPressed(' ')
    ) {
      this.menuStack.pop();
    }
  }

  update(): void {
    this.centerPanel();
    this.refreshInfo();
  }

  private refreshInfo(): void {
    const pos = this.actions.getPlayerPos();
    const zone = this.actions.getZone();
    const scale = this.actions.getScale();
    const overlay = this.actions.getDebugMode();
    this.infoText.text =
      `Pos: (${pos.x}, ${pos.y})\n` +
      `Zone: ${zone?.name ?? 'none'}\n` +
      `Zoom: ${scale}x  Overlay: ${overlay}`;
  }

  private centerPanel(): void {
    this.panel.centerOnScreen(window.innerWidth, window.innerHeight);
  }
}
