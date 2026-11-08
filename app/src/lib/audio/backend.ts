// The boundary between the app and whatever makes the sound. Everything above
// this interface works in notes and seconds, so replacing the audio API means
// writing a new AudioBackend and changing nothing else.
//
// Keep Web Audio types (nodes, AudioParams, contexts) out of this file.
//
// Sound is organised in channels, like FL's channel rack: one per pattern,
// each a long-lived instrument with its own volume. The app says which
// channels exist with setChannels, then sends notes to them by id. Keeping the
// instrument alive between notes is what plugins (WAM, and VST in principle)
// need: they're created once and then sent note-on and note-off events.

import type { Instrument } from '../instruments/definitions'

/** What a channel should be. The backend builds or updates its instrument to match. */
export interface ChannelSetup {
  /** Stays the same for the channel's life. Currently the id of its pattern. */
  id: string
  instrument: Instrument
  /** 0–1, the volume slider. Turn it into a gain with `volumeToGain`. */
  volume: number
}

export interface ScheduledNote {
  /** The channel that plays it. Notes for a channel that doesn't exist are ignored. */
  channelId: string
  /** MIDI note number. */
  pitch: number
  /** When to start, in seconds on the now() clock. May be slightly in the past. */
  time: number
  /** How long the note is held, in seconds, before its release. */
  duration: number
  /** 0–1, how hard the note is played. */
  velocity: number
}

export interface AudioBackend {
  /** Current audio time in seconds. Playback position is measured against this. */
  now(): number
  /** Gets audio running. Call from a user gesture, since browsers require one. */
  start(): Promise<void>
  /**
   * Makes the channels match `channels`: creates the new ones, updates the
   * instrument or volume of changed ones, and removes the rest. Called
   * whenever the song changes, so it should be cheap when nothing did.
   */
  setChannels(channels: ChannelSetup[]): void
  /** Queues a note. Backends may be asked for notes up to a moment ahead of time. */
  playNote(note: ScheduledNote): void
  /** Silences playing notes and cancels queued ones, on every channel. */
  stopAll(): void
  /** Sets overall volume, 0–1. */
  setMasterGain(gain: number): void
}

/**
 * Turns a volume slider position (0–1) into a gain to multiply the sound by.
 * Squared, because loudness is heard on a curve: this way the slider's middle
 * sounds roughly half as loud, instead of hardly quieter at all.
 */
export const volumeToGain = (volume: number) => volume * volume

/** Equal-tempered frequency of a MIDI pitch, in Hz (A4 = 69 = 440). */
export const pitchToFrequency = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12)
