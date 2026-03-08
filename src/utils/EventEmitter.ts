export class EventEmitter<T = void> {
  private listeners: Array<(data: T) => void> = [];

  on(callback: (data: T) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  emit(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
}
