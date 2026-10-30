import type { AudioBackend } from './backend'
import { secondsToTicks, songLengthTicks, ticksToSeconds, type Note, type Song } from '../song/song'
import type { Transport } from '../song/transport'

/** How far ahead notes are queued, in seconds. */
const LOOKAHEAD = 0.1
/** How often the queue is topped up, in milliseconds. */
const INTERVAL = 25

/** Notes starting in [from, to). */
export const notesStartingIn = (song: Song, from: number, to: number): Note[] =>
  song.notes.filter((n) => n.start >= from && n.start < to)

/**
 * Feeds notes to the backend slightly ahead of time, following the transport.
 * A timer rather than the animation loop, because animation frames jitter and
 * stop in background tabs, while the backend can place queued notes exactly.
 */
export class AudioPlayer {
  // Everything before this point has been queued: cursorTick plays at cursorTime.
  private cursorTick = 0
  private cursorTime = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private unsubscribe: () => void

  constructor(
    private getSong: () => Song,
    private transport: Transport,
    private backend: AudioBackend,
  ) {
    this.unsubscribe = transport.subscribe(() => this.onTransportChange())
  }

  /** Queues any notes due within the lookahead. Runs on a timer while playing. */
  update() {
    const position = this.transport.position()
    if (!this.transport.isPlaying) return

    const song = this.getSong()
    const end = songLengthTicks(song)
    const now = this.backend.now()
    if (end <= 0) return

    // The timer stalled (e.g. a background tab). Notes in the gap are gone;
    // skip them rather than playing them all at once.
    if (this.cursorTime < now) this.moveCursor(position)

    const horizon = now + LOOKAHEAD
    while (this.cursorTime < horizon) {
      if (this.cursorTick >= end) {
        if (!this.transport.loop) return
        this.cursorTick = 0
      }
      const stop = Math.min(end, this.cursorTick + secondsToTicks(horizon - this.cursorTime, song))
      // Rounding can leave a gap too small to advance the cursor at all.
      if (stop <= this.cursorTick) break
      for (const note of notesStartingIn(song, this.cursorTick, stop)) {
        this.backend.playNote({
          pitch: note.pitch,
          time: this.cursorTime + ticksToSeconds(note.start - this.cursorTick, song),
          duration: ticksToSeconds(note.duration, song),
          velocity: note.velocity,
          synth: song.synth,
        })
      }
      this.cursorTime += ticksToSeconds(stop - this.cursorTick, song)
      this.cursorTick = stop
    }
  }

  dispose() {
    this.stopTimer()
    this.unsubscribe()
    this.backend.stopAll()
  }

  private onTransportChange() {
    this.backend.stopAll()
    this.moveCursor(this.transport.position())
    if (this.transport.isPlaying) {
      this.timer ??= setInterval(() => this.update(), INTERVAL)
      this.update()
    } else {
      this.stopTimer()
    }
  }

  private moveCursor(tick: number) {
    this.cursorTick = tick
    this.cursorTime = this.backend.now()
  }

  private stopTimer() {
    clearInterval(this.timer)
    this.timer = undefined
  }
}
