/**
 * Undo/redo by keeping snapshots. Edits never mutate a song (see edits.ts),
 * so a snapshot is just a reference and unchanged notes are shared between them.
 */
export class History<T> {
  private past: T[] = []
  private future: T[] = []

  constructor(
    private present: T,
    private limit = 200,
  ) {}

  get current() {
    return this.present
  }

  get canUndo() {
    return this.past.length > 0
  }

  get canRedo() {
    return this.future.length > 0
  }

  push(next: T) {
    if (next === this.present) return
    this.past.push(this.present)
    if (this.past.length > this.limit) this.past.shift()
    this.present = next
    this.future = []
  }

  undo(): T {
    const previous = this.past.pop()
    if (previous !== undefined) {
      this.future.push(this.present)
      this.present = previous
    }
    return this.present
  }

  redo(): T {
    const next = this.future.pop()
    if (next !== undefined) {
      this.past.push(this.present)
      this.present = next
    }
    return this.present
  }
}
