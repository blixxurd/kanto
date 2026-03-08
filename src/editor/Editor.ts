import { Container, Graphics } from 'pixi.js';
import { Input } from '../core/Input';
import { Camera } from '../core/Camera';
import { MapData } from '../world/MapData';
import { TilemapRenderer } from '../world/TilemapRenderer';
import { EditorState } from './EditorState';
import { serializeAndDownload } from './MapSerializer';
import { TILE_SIZE } from '../utils/TileCoords';
import type { UndoAction } from '../types/editor';

export class Editor {
  private active = false;
  private state = new EditorState();
  private mapData: MapData | null = null;
  private renderer: TilemapRenderer | null = null;
  private camera: Camera;
  private input: Input;

  private overlayContainer: Container;
  private gridGraphics: Graphics;
  private collisionGraphics: Graphics;

  private painting = false;
  private toolbar: HTMLElement | null = null;

  constructor(
    worldContainer: Container,
    camera: Camera,
    input: Input,
  ) {
    this.camera = camera;
    this.input = input;

    this.overlayContainer = new Container();
    worldContainer.addChild(this.overlayContainer);

    this.gridGraphics = new Graphics();
    this.collisionGraphics = new Graphics();
    this.overlayContainer.addChild(this.collisionGraphics);
    this.overlayContainer.addChild(this.gridGraphics);
    this.overlayContainer.visible = false;

    // Keyboard shortcuts
    this.input.onKeyDown('t', () => { if (this.active) this.state.activeTool = 'tile_paint'; });
    this.input.onKeyDown('c', () => { if (this.active) this.state.activeTool = 'collision_paint'; });
    this.input.onKeyDown('e', () => { if (this.active) this.state.activeTool = 'erase'; });
    this.input.onKeyDown('1', () => { if (this.active) this.state.brush.activeLayer = 'bottom'; });
    this.input.onKeyDown('2', () => { if (this.active) this.state.brush.activeLayer = 'top'; });

    // Undo/redo
    window.addEventListener('keydown', (e) => {
      if (!this.active || !this.mapData) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          this.performUndo();
        } else if (e.key === 'z' && e.shiftKey || e.key === 'y') {
          e.preventDefault();
          this.performRedo();
        } else if (e.key === 's') {
          e.preventDefault();
          this.save();
        }
      }
    });

    // Mouse handlers
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
      canvas.addEventListener('pointerup', () => this.onPointerUp());
    }
  }

  load(mapData: MapData, renderer: TilemapRenderer): void {
    this.mapData = mapData;
    this.renderer = renderer;
  }

  toggle(): void {
    this.active = !this.active;
    this.overlayContainer.visible = this.active;

    if (this.active) {
      this.camera.stopFollow();
      this.renderCollisionOverlay();
      this.showToolbar();
    } else {
      this.hideToolbar();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  update(): void {
    if (!this.active) return;

    // WASD camera panning
    const panSpeed = 4;
    if (this.input.isDown('w') || this.input.isDown('W')) this.camera.panTo(this.camera.x, this.camera.y - panSpeed);
    if (this.input.isDown('s') || this.input.isDown('S')) this.camera.panTo(this.camera.x, this.camera.y + panSpeed);
    if (this.input.isDown('a') || this.input.isDown('A')) this.camera.panTo(this.camera.x - panSpeed, this.camera.y);
    if (this.input.isDown('d') || this.input.isDown('D')) this.camera.panTo(this.camera.x + panSpeed, this.camera.y);
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.active || !this.mapData) return;
    this.painting = true;
    this.state.startBatch();
    this.applyToolAt(e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.active || !this.painting || !this.mapData) return;
    this.applyToolAt(e);
  }

  private onPointerUp(): void {
    if (!this.active) return;
    this.painting = false;
    this.state.endBatch();
  }

  private applyToolAt(e: PointerEvent): void {
    if (!this.mapData || !this.renderer) return;
    const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);
    const tx = Math.floor(worldPos.x / TILE_SIZE);
    const ty = Math.floor(worldPos.y / TILE_SIZE);

    if (tx < 0 || tx >= this.mapData.width || ty < 0 || ty >= this.mapData.height) return;

    switch (this.state.activeTool) {
      case 'tile_paint': {
        const layer = this.state.brush.activeLayer;
        const oldGid = layer === 'bottom'
          ? this.mapData.getBottomTile(tx, ty)
          : this.mapData.getTopTile(tx, ty);
        const newGid = this.state.brush.selectedGid;
        if (oldGid !== newGid) {
          this.mapData.setTile(tx, ty, layer, newGid);
          this.state.addAction({ type: 'tile', x: tx, y: ty, layer, oldGid, newGid });
          this.renderer.refreshAll();
        }
        break;
      }
      case 'collision_paint': {
        const isRight = (window.event as MouseEvent)?.button === 2;
        const newVal = isRight ? 0 : 1;
        const oldVal = this.mapData.isPassable(tx, ty) ? 0 : 1;
        if (oldVal !== newVal) {
          this.mapData.setCollision(tx, ty, newVal === 1);
          this.state.addAction({ type: 'collision', x: tx, y: ty, oldValue: oldVal, newValue: newVal });
          this.renderCollisionOverlay();
        }
        break;
      }
      case 'erase': {
        const layer = this.state.brush.activeLayer;
        const oldGid = layer === 'bottom'
          ? this.mapData.getBottomTile(tx, ty)
          : this.mapData.getTopTile(tx, ty);
        if (oldGid !== 0) {
          this.mapData.setTile(tx, ty, layer, 0);
          this.state.addAction({ type: 'tile', x: tx, y: ty, layer, oldGid, newGid: 0 });
          this.renderer.refreshAll();
        }
        break;
      }
    }
  }

  private performUndo(): void {
    if (!this.mapData || !this.renderer) return;
    const batch = this.state.undo();
    if (!batch) return;
    for (const action of batch.reverse()) {
      this.revertAction(action);
    }
    this.renderer.refreshAll();
    this.renderCollisionOverlay();
  }

  private performRedo(): void {
    if (!this.mapData || !this.renderer) return;
    const batch = this.state.redo();
    if (!batch) return;
    for (const action of batch) {
      this.applyAction(action);
    }
    this.renderer.refreshAll();
    this.renderCollisionOverlay();
  }

  private revertAction(action: UndoAction): void {
    if (!this.mapData) return;
    switch (action.type) {
      case 'tile':
        this.mapData.setTile(action.x, action.y, action.layer, action.oldGid);
        break;
      case 'collision':
        this.mapData.setCollision(action.x, action.y, action.oldValue === 1);
        break;
    }
  }

  private applyAction(action: UndoAction): void {
    if (!this.mapData) return;
    switch (action.type) {
      case 'tile':
        this.mapData.setTile(action.x, action.y, action.layer, action.newGid);
        break;
      case 'collision':
        this.mapData.setCollision(action.x, action.y, action.newValue === 1);
        break;
    }
  }

  private renderCollisionOverlay(): void {
    if (!this.mapData) return;
    this.collisionGraphics.clear();
    const vp = this.camera.getViewport();
    const startX = Math.max(0, Math.floor(vp.left / TILE_SIZE));
    const startY = Math.max(0, Math.floor(vp.top / TILE_SIZE));
    const endX = Math.min(this.mapData.width, Math.ceil(vp.right / TILE_SIZE));
    const endY = Math.min(this.mapData.height, Math.ceil(vp.bottom / TILE_SIZE));

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const blocked = !this.mapData.isPassable(x, y);
        this.collisionGraphics.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        this.collisionGraphics.fill({ color: blocked ? 0xff0000 : 0x00ff00, alpha: 0.25 });
      }
    }
  }

  private save(): void {
    if (!this.mapData) return;
    const filename = this.mapData.id + '.json';
    const ok = serializeAndDownload(this.mapData, filename);
    if (import.meta.env.DEV) console.log(ok ? `Saved ${filename}` : 'Save failed');
  }

  private showToolbar(): void {
    if (this.toolbar) return;
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'editor-toolbar';
    this.toolbar.innerHTML = `
      <div style="position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.8);color:white;padding:10px;border-radius:5px;font-family:monospace;font-size:12px;z-index:100">
        <div><b>EDITOR</b> (F1 to close)</div>
        <div>Tool: <b>${this.state.activeTool}</b></div>
        <div>Layer: <b>${this.state.brush.activeLayer}</b></div>
        <div>T=paint C=collision E=erase</div>
        <div>1=bottom 2=top layer</div>
        <div>Ctrl+Z=undo Ctrl+S=save</div>
      </div>
    `;
    document.body.appendChild(this.toolbar);
  }

  private hideToolbar(): void {
    this.toolbar?.remove();
    this.toolbar = null;
  }
}
