/**
 * Editor type definitions.
 * See docs/TECH_SPEC.md Section 8.
 */

export type EditorToolType = 'tile_paint' | 'collision_paint' | 'warp' | 'erase' | 'select';

export interface EditorTool {
  name: EditorToolType;
  activate(): void;
  deactivate(): void;
  onPointerDown(worldX: number, worldY: number): void;
  onPointerMove(worldX: number, worldY: number): void;
  onPointerUp(): void;
}

export type UndoAction =
  | { type: 'tile'; x: number; y: number; layer: 'bottom' | 'top'; oldGid: number; newGid: number }
  | { type: 'collision'; x: number; y: number; oldValue: number; newValue: number }
  | { type: 'warp_add'; warp: import('./game').Warp }
  | { type: 'warp_remove'; warp: import('./game').Warp }
  | { type: 'warp_move'; id: number; oldX: number; oldY: number; newX: number; newY: number };

export interface BrushState {
  selectedGid: number;
  activeLayer: 'bottom' | 'top';
  size: number;
}
