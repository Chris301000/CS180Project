// How each instrument type makes its sound with Web Audio.
//
// Each channel holds an InstrumentEngine: one long-lived object that's sent
// notes, like a plugin instance. The built-in synths are engines that build a
// short-lived "voice" (a few oscillators and an envelope) for each note. A WAM
// plugin will be an engine too, forwarding notes as MIDI events instead.
//
// A new instrument adds its engine to ENGINES here (and its settings in
// instruments/definitions.ts).

import { pitchToFrequency, type ScheduledNote } from './backend'
import type { BasicSynth, FmSynth, Instrument, InstrumentOf, InstrumentType } from '../instruments/definitions'

/** A note as an engine gets it: the channel has already been picked. */
export type EngineNote = Omit<ScheduledNote, 'channelId'>

export interface InstrumentEngine {
  /** Plays a note at `note.time` for `note.duration`. */
  play(note: EngineNote): void
  /** New settings of the same instrument type. Notes already sounding may keep the old ones. */
  update(instrument: Instrument): void
  /** Quickly silences everything, playing or queued, at `time`. */
  stopAll(time: number): void
  /** Silences everything and releases its resources. The engine isn't used again. */
  dispose(): void
}

/** Builds the engine for an instrument, sending its sound into `output`. */
type EngineFactory<T> = (context: AudioContext, output: AudioNode, instrument: T) => InstrumentEngine

/** Per-voice level, low enough that a few notes at once don't clip. */
const VOICE_GAIN = 0.25

/** A sounding note of a built-in synth: what's needed to cut it short and clean up after it. */
interface Voice {
  stop(time: number): void
  onEnded: (() => void) | null
}

type VoiceBuilder<T> = (context: AudioContext, output: AudioNode, note: EngineNote, instrument: T) => Voice

/**
 * A volume envelope: silent, fades up over `attack`, holds until the note
 * ends, then fades out over `release`. Fading at each end avoids clicks.
 * Returns the gain node and when the sound is fully over.
 */
function envelope(context: AudioContext, start: number, note: EngineNote, attack: number, release: number) {
  const releaseAt = start + Math.max(note.duration, attack)
  const end = releaseAt + release
  const peak = VOICE_GAIN * note.velocity
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + attack)
  gain.gain.setValueAtTime(peak, releaseAt)
  gain.gain.linearRampToValueAtTime(0, end)
  return { gain, end }
}

/** Starts the oscillators, and wires up stopping and cleanup. `gain` is the voice's envelope. */
function voice(oscillators: OscillatorNode[], gain: GainNode, start: number, end: number): Voice {
  for (const osc of oscillators) {
    osc.start(start)
    osc.stop(end)
  }
  const result: Voice = {
    stop(time) {
      gain.gain.cancelScheduledValues(time)
      gain.gain.setTargetAtTime(0, time, 0.003)
      for (const osc of oscillators) osc.stop(time + 0.01)
    },
    onEnded: null,
  }
  oscillators[0].onended = () => {
    gain.disconnect()
    for (const osc of oscillators) osc.disconnect()
    result.onEnded?.()
  }
  return result
}

const basicVoice: VoiceBuilder<BasicSynth> = (context, output, note, synth) => {
  const start = Math.max(note.time, context.currentTime)
  const { gain, end } = envelope(context, start, note, synth.attack, synth.release)
  const osc = context.createOscillator()
  osc.type = synth.wave
  osc.frequency.value = pitchToFrequency(note.pitch)
  osc.connect(gain).connect(output)
  return voice([osc], gain, start, end)
}

const fmVoice: VoiceBuilder<FmSynth> = (context, output, note, synth) => {
  const start = Math.max(note.time, context.currentTime)
  const { gain, end } = envelope(context, start, note, synth.attack, synth.release)
  const frequency = pitchToFrequency(note.pitch)

  // The carrier is the sine you hear. The modulator is a second sine added to
  // the carrier's frequency, so the carrier's pitch swings up and down by
  // `depth × modulator frequency`, hundreds of times a second.
  const carrier = context.createOscillator()
  carrier.frequency.value = frequency
  const modulator = context.createOscillator()
  modulator.frequency.value = frequency * synth.ratio
  const modulation = context.createGain()
  modulation.gain.value = synth.depth * frequency * synth.ratio

  modulator.connect(modulation).connect(carrier.frequency)
  carrier.connect(gain).connect(output)
  return voice([carrier, modulator], gain, start, end)
}

/**
 * An engine that builds a fresh voice for every note, using the instrument's
 * settings at the time the note is queued.
 */
function voiceEngine<T extends Instrument>(build: VoiceBuilder<T>): EngineFactory<T> {
  return (context, output, initial) => {
    let instrument = initial
    const voices = new Set<Voice>()
    const stopAll = (time: number) => {
      for (const v of voices) v.stop(time)
    }
    return {
      play(note) {
        const v = build(context, output, note, instrument)
        voices.add(v)
        v.onEnded = () => voices.delete(v)
      },
      update(next) {
        instrument = next as T
      },
      stopAll,
      dispose() {
        stopAll(context.currentTime)
      },
    }
  }
}

export const ENGINES: { [K in InstrumentType]: EngineFactory<InstrumentOf<K>> } = {
  basic: voiceEngine(basicVoice),
  fm: voiceEngine(fmVoice),
}

/** Builds the engine for an instrument of any type. */
export function createEngine(context: AudioContext, output: AudioNode, instrument: Instrument): InstrumentEngine {
  const factory = ENGINES[instrument.type] as EngineFactory<Instrument>
  return factory(context, output, instrument)
}
