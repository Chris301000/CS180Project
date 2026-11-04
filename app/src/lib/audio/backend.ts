// The boundary between the app and whatever makes the sound. Everything above
// this interface works in notes and seconds, so replacing the audio API means
// writing a new AudioBackend and changing nothing else.
//
// Keep Web Audio types (nodes, AudioParams, contexts) out of this file.

import type { SynthSettings } from '../song/song'

export interface ScheduledNote {
  /** MIDI note number. */
  pitch: number
  /** When to start, in seconds on the now() clock. May be slightly in the past. */
  time: number
  /** How long the note is held, in seconds, before its release. */
  duration: number
  /** 0–1. */
  velocity: number
  synth: SynthSettings
}

export interface AudioBackend {
  /** Current audio time in seconds. Playback position is measured against this. */
  now(): number
  /** Gets audio running. Call from a user gesture, since browsers require one. */
  start(): Promise<void>
  /** Queues a note. Backends may be asked for notes up to a moment ahead of time. */
  playNote(note: ScheduledNote): void
  /** Silences playing notes and cancels queued ones. */
  stopAll(): void
  /** Sets overall volume, 0–1. */
  setMasterGain(gain: number): void
}

/** Equal-tempered frequency of a MIDI pitch, in Hz (A4 = 69 = 440). */
export const pitchToFrequency = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12)
