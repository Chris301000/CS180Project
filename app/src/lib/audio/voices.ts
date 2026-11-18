// How each instrument type makes its sound with Web Audio. One function per
// type in VOICES; WebAudioBackend picks by `instrument.type`. A new instrument
// adds its function here (and its settings in instruments/definitions.ts).

import { pitchToFrequency, volumeToGain, type ScheduledNote } from './backend'
import type { BasicSynth, FmSynth, InstrumentOf, InstrumentType } from '../instruments/definitions'

/** Per-voice level, low enough that a few notes at once don't clip. */
const VOICE_GAIN = 0.25

/** A sounding note: what's needed to cut it short and to clean up after it. */
export interface Voice {
  /** Fades out quickly and stops at `time`, e.g. when playback stops. */
  stop(time: number): void
  /** Called once the voice has fully finished and been disconnected. */
  onEnded: (() => void) | null
}

type VoiceBuilder<T> = (context: AudioContext, output: AudioNode, note: ScheduledNote, instrument: T) => Voice

/**
 * A volume envelope: silent, fades up to `peak` over `attack`, holds until the
 * note ends, then fades out over `release`. Fading at each end avoids clicks.
 * Returns the gain node and when the sound is fully over.
 */
function envelope(context: AudioContext, start: number, note: ScheduledNote, attack: number, release: number) {
  const releaseAt = start + Math.max(note.duration, attack)
  const end = releaseAt + release
  const peak = VOICE_GAIN * note.velocity * volumeToGain(note.volume)
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + attack)
  gain.gain.setValueAtTime(peak, releaseAt)
  gain.gain.linearRampToValueAtTime(0, end)
  return { gain, end }
}

/**
 * Starts the oscillators, and wires up stopping and cleanup. `gain` is the
 * voice's envelope, the last node before the output.
 */
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

const basic: VoiceBuilder<BasicSynth> = (context, output, note, synth) => {
  const start = Math.max(note.time, context.currentTime)
  const { gain, end } = envelope(context, start, note, synth.attack, synth.release)
  const osc = context.createOscillator()
  osc.type = synth.wave
  osc.frequency.value = pitchToFrequency(note.pitch)
  osc.connect(gain).connect(output)
  return voice([osc], gain, start, end)
}

const fm: VoiceBuilder<FmSynth> = (context, output, note, synth) => {
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

export const VOICES: { [K in InstrumentType]: VoiceBuilder<InstrumentOf<K>> } = { basic, fm }

/** Starts the voice for a note, using its instrument's builder. */
export function startVoice(context: AudioContext, output: AudioNode, note: ScheduledNote): Voice {
  const build = VOICES[note.instrument.type] as VoiceBuilder<typeof note.instrument>
  return build(context, output, note, note.instrument)
}
