import type { UndoAction, BrushState, EditorToolType } from '../types/editor';

export class EditorState {
  private undoStack: UndoAction[][] = [];
  private redoStack: UndoAction[][] = [];
  private currentBatch: UndoAction[] = [];
  dirty = false;

  brush: BrushState = {
    selectedGid: 1,
    activeLayer: 'bottom',
    size: 1,
  };

  activeTool: EditorToolType = 'tile_paint';

  startBatch(): void {
    this.currentBatch = [];
  }

  addAction(action: UndoAction): void {
    this.currentBatch.push(action);
    this.dirty = true;
  }

  endBatch(): void {
    if (this.currentBatch.length > 0) {
      this.undoStack.push(this.currentBatch);
      this.redoStack = [];
    }
    this.currentBatch = [];
  }

  undo(): UndoAction[] | null {
    const batch = this.undoStack.pop();
    if (!batch) return null;
    this.redoStack.push(batch);
    return batch;
  }

  redo(): UndoAction[] | null {
    const batch = this.redoStack.pop();
    if (!batch) return null;
    this.undoStack.push(batch);
    return batch;
  }
}
