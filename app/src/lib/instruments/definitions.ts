// Instruments: what a pattern sounds like, as plain data so it can be saved
// and undone. No Svelte or Web Audio here. Each instrument type has three
// parts, kept in separate places so they don't depend on each other:
//
//   - here: its settings, defaults, and the range of each setting
//   - editors.ts: the component that draws its controls (its "interface")
//   - audio/voices.ts (or audio/wamEngine.ts): the code that makes its sound
//
// There are two kinds. Built-in synths have settings this app understands,
// described in INSTRUMENTS. WAM plugins are other people's synths loaded from
// a URL; their settings are an opaque blob only the plugin understands.
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

/**
 * A Web Audio Module plugin: a synth someone else made, loaded from `url`.
 * Only plugins on the approved list (WAM_PLUGINS) are ever loaded, since a
 * plugin is code that runs inside the app.
 */
export interface WamPlugin {
  type: 'wam'
  /** The plugin's JavaScript module. */
  url: string
  /** Its name, to show before it loads (or if it can't). */
  name: string
  /**
   * The plugin's own saved settings, from its getState(), or null for its
   * defaults. Only the plugin understands it; the app just keeps it.
   */
  state: unknown
}

export type BuiltinInstrument = BasicSynth | FmSynth
export type BuiltinType = BuiltinInstrument['type']
export type Instrument = BuiltinInstrument | WamPlugin
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

interface Definition<T extends BuiltinInstrument> {
  name: string
  defaults: Omit<T, 'type'>
  params: ParamSpecs<T>
}

const attack: NumberParam = { kind: 'number', label: 'Attack', min: 0, max: 2, unit: 's', curve: 'squared' }
const release: NumberParam = { kind: 'number', label: 'Release', min: 0, max: 5, unit: 's', curve: 'squared' }

/** The built-in synths: their names, defaults and settings. */
export const INSTRUMENTS: { [K in BuiltinType]: Definition<InstrumentOf<K>> } = {
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

export const BUILTIN_TYPES = Object.keys(INSTRUMENTS) as BuiltinType[]

/** A new built-in synth of the given type with its default settings. */
export function createInstrument<K extends BuiltinType>(type: K): InstrumentOf<K> {
  return { type, ...INSTRUMENTS[type].defaults } as InstrumentOf<K>
}

/**
 * The approved WAM plugins: the only ones the app will load. Each runs its
 * own code inside the app, so a song file naming any other URL keeps it but
 * doesn't load it.
 *
 * They load from their own sites, so using one needs the internet, and the
 * code that runs is whatever that site serves at the time (it can change).
 * Before adding one, read through what it loads and does.
 *
 * Synth-101 (reviewed 2026-11-07): a webpack development build containing
 * Preact (MIT), the WAM SDK and the plugin's own code. It loads index.js,
 * descriptor.json, EnvelopeGeneratorProcessor.js and SlewProcessor.js from its
 * folder and nothing from anywhere else; draws its interface in a shadow DOM;
 * uses no storage or cookies. Its licence isn't stated in its files.
 */
export const WAM_PLUGINS: readonly { name: string; url: string }[] = [
  { name: 'Synth-101', url: 'https://www.webaudiomodules.com/community/plugins/burns-audio/synth101/index.js' },
]

export const isApprovedPlugin = (url: string) => WAM_PLUGINS.some((p) => p.url === url)

/** A plugin instrument at the plugin's own defaults. */
export const createWamInstrument = (plugin: { name: string; url: string }): WamPlugin => ({
  type: 'wam',
  url: plugin.url,
  name: plugin.name,
  state: null,
})

/**
 * Whether two instruments can be played by the same engine, so a change
 * between them is just new settings. A different type, or a different
 * plugin, needs a new engine (like loading another plugin in FL).
 */
export function sameEngine(a: Instrument, b: Instrument): boolean {
  if (a.type !== b.type) return false
  return a.type !== 'wam' || a.url === (b as WamPlugin).url
}

/**
 * Whether two plugin states are the same, allowing for rounding: plugins
 * often keep settings as 32-bit floats, so 0.2 comes back as 0.20000000298.
 */
export function sameState(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a))
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((k) => sameState((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export const DEFAULT_INSTRUMENT: Instrument = createInstrument('basic')
