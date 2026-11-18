import { playLengthTicks, secondsToTicks, songLengthTicks, ticksToSeconds, type Song } from './song'

/** Returns the current time in seconds. Swap in `() => audioContext.currentTime` once audio exists. */
export type Clock = () => number

const defaultClock: Clock = () => performance.now() / 1000

/**
 * Play/pause/stop/seek state. The position is computed from the clock instead
 * of being incremented every frame, so dropped frames never make it drift.
 */
export class Transport {
  loop = true

  // Position is anchorTick plus whatever time has passed since anchorTime.
  private anchorTick = 0
  private anchorTime = 0
  /** The position last handed out, to tell crossing the loop point apart from the song getting shorter. */
  private lastTick = 0
  private playing = false
  private listeners = new Set<() => void>()

  constructor(
    private getSong: () => Song,
    private clock: Clock = defaultClock,
  ) {}

  get isPlaying() {
    return this.playing
  }

  /**
   * Current position in ticks.
   *
   * The play length can change while playing (it ends at the last clip, and
   * clips get added, moved and deleted), so looping isn't worked out as "time
   * since play, modulo the length": that would jump whenever the length
   * changed. Instead the anchor moves back to the start at the moment the loop
   * point is crossed, the same way the audio player wraps its own cursor, so a
   * later change of length only affects what comes after.
   */
  position(): number {
    if (!this.playing) return this.anchorTick
    const song = this.getSong()
    const end = playLengthTicks(song)
    let tick = this.anchorTick + secondsToTicks(this.clock() - this.anchorTime, song)
    if (end > 0 && tick >= end) {
      if (!this.loop) {
        this.stop()
        return 0
      }
      if (this.lastTick >= end) {
        // We were already past the end last time, so the loop point didn't get
        // crossed: the song got shorter under the playhead (e.g. the clip
        // playing was deleted). Start the loop again from the top. Seeking tells
        // the audio player, so the sound jumps back too and stays in sync.
        this.seek(0)
        return 0
      }
      // Crossed the loop point since last time. Re-anchor at the exact moment
      // it was crossed, once per loop passed (more than one if the timer stalled).
      while (tick >= end) {
        this.anchorTime += ticksToSeconds(end - this.anchorTick, song)
        this.anchorTick = 0
        tick -= end
      }
    }
    this.lastTick = tick
    return tick
  }

  play() {
    if (this.playing) return
    this.anchorTime = this.clock()
    this.lastTick = this.anchorTick
    this.playing = true
    this.notify()
  }

  pause() {
    if (!this.playing) return
    this.anchorTick = this.position()
    this.playing = false
    this.notify()
  }

  toggle() {
    if (this.playing) this.pause()
    else this.play()
  }

  /** Stops and returns to the start, like FL's stop button. */
  stop() {
    this.playing = false
    this.anchorTick = 0
    this.lastTick = 0
    this.notify()
  }

  seek(tick: number) {
    this.anchorTick = Math.max(0, Math.min(tick, songLengthTicks(this.getSong())))
    this.anchorTime = this.clock()
    this.lastTick = this.anchorTick
    this.notify()
  }

  /** Called on play/pause/stop/seek (not every frame). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }
}
