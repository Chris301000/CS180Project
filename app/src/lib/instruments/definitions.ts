// Instruments: what a pattern sounds like, as plain data so it can be saved
// and undone. No Svelte or Web Audio here. Each instrument type has three
// parts, kept in separate places so they don't depend on each other:
//
//   - here: its settings, defaults, and the range of each setting
//   - editors.ts: the component that draws its controls (its "interface")
//   - audio/voices.ts: the code that makes its sound
//
// Adding an instrument means adding it to the `Instrument` union and to all
// three; TypeScript points out any place that's missing.

export const WAVES = ['sine', 'square', 'sawtooth', 'triangle'] as const
export type Wave = (typeof WAVES)[number]

/** One oscillator with a fade in and out: the original synth. */
export interface BasicSynth {
  type: 'basic'
  wave: Wave
  /** Fade-in, in seconds. */
  attack: number
  /** Fade-out after the note ends, in seconds. */
  release: number
}

/**
 * Two-operator FM: a second sine wave wobbles the pitch of the first very fast,
 * which adds overtones. Gives bells, electric pianos and metallic sounds.
 */
export interface FmSynth {
  type: 'fm'
  /** The modulator's frequency as a multiple of the note's. Whole numbers sound tuned; others sound clangy. */
  ratio: number
  /** How strongly the modulator bends the pitch. 0 is a plain sine; higher is brighter. */
  depth: number
  attack: number
  release: number
}

export type Instrument = BasicSynth | FmSynth
export type InstrumentType = Instrument['type']
/** The instrument with type `K`, e.g. `InstrumentOf<'fm'>` is `FmSynth`. */
export type InstrumentOf<K extends InstrumentType> = Extract<Instrument, { type: K }>

export interface NumberParam {
  kind: 'number'
  label: string
  min: number
  max: number
  unit?: 's'
  /** 'squared' gives finer control near the minimum, for times. */
  curve?: 'linear' | 'squared'
}

export interface ChoiceParam {
  kind: 'choice'
  label: string
  options: readonly string[]
}

/** A description of every setting of instrument `T` (all its fields except `type`). */
type ParamSpecs<T> = { [K in Exclude<keyof T, 'type'>]: T[K] extends number ? NumberParam : ChoiceParam }

interface Definition<T extends Instrument> {
  name: string
  defaults: Omit<T, 'type'>
  params: ParamSpecs<T>
}

const attack: NumberParam = { kind: 'number', label: 'Attack', min: 0, max: 2, unit: 's', curve: 'squared' }
const release: NumberParam = { kind: 'number', label: 'Release', min: 0, max: 5, unit: 's', curve: 'squared' }

export const INSTRUMENTS: { [K in InstrumentType]: Definition<InstrumentOf<K>> } = {
  basic: {
    name: 'Simple synth',
    defaults: { wave: 'sawtooth', attack: 0.01, release: 0.05 },
    params: { wave: { kind: 'choice', label: 'Wave', options: WAVES }, attack, release },
  },
  fm: {
    name: 'FM synth',
    defaults: { ratio: 2, depth: 3, attack: 0.005, release: 0.4 },
    params: {
      ratio: { kind: 'number', label: 'Ratio', min: 0.5, max: 8 },
      depth: { kind: 'number', label: 'Depth', min: 0, max: 10 },
      attack,
      release,
    },
  },
}

export const INSTRUMENT_TYPES = Object.keys(INSTRUMENTS) as InstrumentType[]

/** A new instrument of the given type with its default settings. */
export function createInstrument<K extends InstrumentType>(type: K): InstrumentOf<K> {
  return { type, ...INSTRUMENTS[type].defaults } as InstrumentOf<K>
}

export const DEFAULT_INSTRUMENT: Instrument = createInstrument('basic')
