// Conversions between song space (ticks, MIDI pitch) and piano roll pixels.
// x = 0 is tick 0; y = 0 is the top row, which is the highest pitch.

export const MIN_PITCH = 0
export const MAX_PITCH = 127
export const PITCH_COUNT = MAX_PITCH - MIN_PITCH + 1

export interface Viewport {
  /** Horizontal zoom. */
  pxPerTick: number
  /** Height of one pitch row. */
  rowHeight: number
}

export const tickToX = (tick: number, vp: Viewport) => tick * vp.pxPerTick

export const xToTick = (x: number, vp: Viewport) => x / vp.pxPerTick

export const pitchToY = (pitch: number, vp: Viewport) => (MAX_PITCH - pitch) * vp.rowHeight

export const clampPitch = (pitch: number) => Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch))

/** The pitch whose row contains y. */
export const yToPitch = (y: number, vp: Viewport) => clampPitch(MAX_PITCH - Math.floor(y / vp.rowHeight))

/** Snaps a tick to a grid of `grid` ticks. Use 'floor' for placing notes, 'round' for dragging. */
export function snapTick(tick: number, grid: number, mode: 'floor' | 'round' = 'floor'): number {
  if (grid <= 0) return tick
  const steps = mode === 'floor' ? Math.floor(tick / grid) : Math.round(tick / grid)
  return steps * grid
}

const BLACK_KEYS = new Set([1, 3, 6, 8, 10])
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const isBlackKey = (pitch: number) => BLACK_KEYS.has(pitch % 12)

/** MIDI pitch to a name like "C4" (60 = C4). */
export const pitchName = (pitch: number) => `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`
