import { secondsToTicks, songLengthTicks, type Song } from './song'

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
  private playing = false
  private listeners = new Set<() => void>()

  constructor(
    private getSong: () => Song,
    private clock: Clock = defaultClock,
  ) {}

  get isPlaying() {
    return this.playing
  }

  /** Current position in ticks. */
  position(): number {
    if (!this.playing) return this.anchorTick
    const song = this.getSong()
    const end = songLengthTicks(song)
    const tick = this.anchorTick + secondsToTicks(this.clock() - this.anchorTime, song)
    if (end <= 0 || tick < end) return tick
    if (this.loop) return tick % end
    this.stop()
    return 0
  }

  play() {
    if (this.playing) return
    this.anchorTime = this.clock()
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
    this.notify()
  }

  seek(tick: number) {
    this.anchorTick = Math.max(0, Math.min(tick, songLengthTicks(this.getSong())))
    this.anchorTime = this.clock()
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
