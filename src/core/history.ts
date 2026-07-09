export interface Command {
  label: string;
  undo(): void;
  redo(): void;
}

export class History extends EventTarget {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private limit: number;

  constructor(limit = 100) {
    super();
    this.limit = limit;
  }

  push(command: Command) {
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
    this.emit();
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return;
    command.redo();
    this.undoStack.push(command);
    this.emit();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private emit() {
    this.dispatchEvent(new CustomEvent('changed'));
  }
}
