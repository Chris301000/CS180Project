import type { AudioBackend } from './backend'
import {
  findPattern,
  findTrack,
  secondsToTicks,
  songLengthTicks,
  ticksToSeconds,
  type Song,
  type SynthSettings,
} from '../song/song'
import type { Transport } from '../song/transport'

/** How far ahead notes are queued, in seconds. */
const LOOKAHEAD = 0.1
/** How often the queue is topped up, in milliseconds. */
const INTERVAL = 25

/** A note as it plays in the song: in song time, cut to its clip, with its track's synth. */
export interface SongNote {
  pitch: number
  /** In ticks from the start of the song. */
  start: number
  duration: number
  velocity: number
  synth: SynthSettings
}

/**
 * Notes starting in [from, to), in song ticks, from every clip. A clip plays
 * the part of its pattern from `offset` to `offset + length`: notes starting
 * before the offset are trimmed away, and notes running past the clip's end
 * are cut short there. Sorted by start time.
 */
export function notesStartingIn(song: Song, from: number, to: number): SongNote[] {
  const result: SongNote[] = []
  for (const clip of song.clips) {
    // Skip clips that don't overlap the range at all.
    if (clip.start >= to || clip.start + clip.length <= from) continue
    const pattern = findPattern(song, clip.patternId)
    const track = findTrack(song, clip.trackId)
    if (!pattern || !track) continue
    const clipEnd = clip.offset + clip.length // in pattern ticks
    for (const note of pattern.notes) {
      if (note.start < clip.offset || note.start >= clipEnd) continue
      const start = clip.start + note.start - clip.offset
      if (start < from || start >= to) continue
      result.push({
        pitch: note.pitch,
        start,
        duration: Math.min(note.duration, clipEnd - note.start),
        velocity: note.velocity,
        synth: track.synth,
      })
    }
  }
  // Stable, so notes on the same tick keep their pattern order.
  return result.sort((a, b) => a.start - b.start)
}

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
          synth: note.synth,
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
