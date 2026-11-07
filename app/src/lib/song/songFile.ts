// Song files: turning a Song into text that can be saved or sent to someone,
// and turning that text back into a Song. Plain TypeScript with no DOM, so it
// is easy to test; App.svelte does the actual downloading and file picking.
//
// A file looks like:
//   { "format": "lite-daw-song", "version": 1, "song": { bpm, ppq, ..., notes: [...] } }
//
// Note IDs are not saved. They only matter inside one session, and giving
// loaded notes fresh IDs means they can never collide with notes made later.

import { clampNote } from './edits'
import { createNote, DEFAULT_SYNTH, type Note, type Song, type SynthSettings } from './song'

export const SONG_FILE_FORMAT = 'lite-daw-song'
export const SONG_FILE_VERSION = 1
export const SONG_FILE_EXTENSION = '.litedaw.json'

/** Thrown when a file can't be read as a song. The message is safe to show the user. */
export class SongFileError extends Error {
  override name = 'SongFileError'
}

export function serializeSong(song: Song): string {
  const file = {
    format: SONG_FILE_FORMAT,
    version: SONG_FILE_VERSION,
    song: {
      bpm: song.bpm,
      ppq: song.ppq,
      beatsPerBar: song.beatsPerBar,
      bars: song.bars,
      synth: { ...song.synth },
      notes: song.notes.map(({ pitch, start, duration, velocity }) => ({ pitch, start, duration, velocity })),
    },
  }
  return JSON.stringify(file, null, 2)
}

/** Reads a song file's text. Throws `SongFileError` if it isn't a valid song. */
export function parseSong(text: string): Song {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new SongFileError('This file is not a song file (it is not valid JSON).')
  }

  if (!isObject(data) || data.format !== SONG_FILE_FORMAT) {
    throw new SongFileError('This file is not a song file.')
  }
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
    throw new SongFileError('This song file has an invalid version.')
  }
  if (data.version > SONG_FILE_VERSION) {
    throw new SongFileError('This song was saved by a newer version of the app and cannot be opened.')
  }

  const raw = data.song
  if (!isObject(raw)) throw new SongFileError('This song file has no song in it.')

  const base = {
    bpm: number(raw.bpm, 'bpm', { min: 1, max: 999 }),
    ppq: number(raw.ppq, 'ppq', { min: 1, max: 9600, integer: true }),
    beatsPerBar: number(raw.beatsPerBar, 'beatsPerBar', { min: 1, max: 64, integer: true }),
    bars: number(raw.bars, 'bars', { min: 1, max: 9999, integer: true }),
    synth: raw.synth === undefined ? DEFAULT_SYNTH : parseSynth(raw.synth),
    notes: [] as Note[],
  }

  if (!Array.isArray(raw.notes)) throw new SongFileError('The song\'s notes are missing.')
  const notes = raw.notes.map((n, i) => clampNote(parseNote(n, i), base))
  return { ...base, notes }
}

function parseSynth(raw: unknown): SynthSettings {
  if (!isObject(raw)) throw new SongFileError('The synth settings are invalid.')
  const waves: SynthSettings['wave'][] = ['sine', 'square', 'sawtooth', 'triangle']
  if (!waves.includes(raw.wave as SynthSettings['wave'])) {
    throw new SongFileError(`Unknown synth wave "${String(raw.wave)}".`)
  }
  return {
    wave: raw.wave as SynthSettings['wave'],
    attack: number(raw.attack, 'synth attack', { min: 0, max: 60 }),
    release: number(raw.release, 'synth release', { min: 0, max: 60 }),
  }
}

function parseNote(raw: unknown, index: number): Note {
  const label = `note ${index + 1}`
  if (!isObject(raw)) throw new SongFileError(`The song's ${label} is invalid.`)
  const note = createNote({
    pitch: number(raw.pitch, `${label} pitch`, { min: 0, max: 127, integer: true }),
    start: number(raw.start, `${label} start`, { min: 0 }),
    duration: number(raw.duration, `${label} duration`, { min: 0, exclusiveMin: true }),
  })
  if (raw.velocity !== undefined) {
    note.velocity = number(raw.velocity, `${label} velocity`, { min: 0, max: 1 })
  }
  return note
}

interface Range {
  min?: number
  max?: number
  exclusiveMin?: boolean
  integer?: boolean
}

function number(value: unknown, field: string, range: Range): number {
  const ok =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (!range.integer || Number.isInteger(value)) &&
    (range.min === undefined || (range.exclusiveMin ? value > range.min : value >= range.min)) &&
    (range.max === undefined || value <= range.max)
  if (!ok) throw new SongFileError(`The song's ${field} is invalid (${JSON.stringify(value) ?? 'missing'}).`)
  return value as number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
