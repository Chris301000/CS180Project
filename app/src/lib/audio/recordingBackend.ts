import type { AudioBackend, ScheduledNote } from './backend'

/** An AudioBackend that makes no sound and records what it was asked to do, for tests. */
export class RecordingBackend implements AudioBackend {
  time = 0
  gain = 1
  starts = 0
  stops = 0
  notes: ScheduledNote[] = []

  now() {
    return this.time
  }

  async start() {
    this.starts++
  }

  playNote(note: ScheduledNote) {
    this.notes.push(note)
  }

  stopAll() {
    this.stops++
  }

  setMasterGain(gain: number) {
    this.gain = gain
  }
}
