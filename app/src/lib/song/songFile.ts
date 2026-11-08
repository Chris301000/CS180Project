// Song files: turning a Song into text that can be saved or sent to someone,
// and turning that text back into a Song. Plain TypeScript with no DOM, so it
// is easy to test; App.svelte does the actual downloading and file picking.
//
// A version 2 file looks like:
//   { "format": "lite-daw-song", "version": 2, "song": {
//       bpm, ppq, beatsPerBar, bars,
//       tracks:   [{ name, synth }],
//       patterns: [{ name, length, notes: [{ pitch, start, duration, velocity }] }],
//       clips:    [{ pattern, track, start, offset, length }] } }
// where a clip's `pattern` and `track` are positions in those lists.
//
// Version 1 files (from before tracks existed) have `synth` and `notes` on the
// song instead, and load as one track playing one pattern.
//
// IDs are not saved. They only matter inside one session, and giving loaded
// notes, tracks, patterns and clips fresh IDs means they can never collide
// with ones made later. That's why clips refer to patterns and tracks by
// position in the file instead.

import { clampClip } from './clips'
import { clampNote } from './edits'
import {
  createNote,
  createPattern,
  createTrack,
  DEFAULT_SYNTH,
  newId,
  songFromNotes,
  type Clip,
  type Note,
  type Pattern,
  type Song,
  type SongTiming,
  type SynthSettings,
  type Track,
} from './song'

export const SONG_FILE_FORMAT = 'lite-daw-song'
export const SONG_FILE_VERSION = 2
export const SONG_FILE_EXTENSION = '.litedaw.json'

/** Thrown when a file can't be read as a song. The message is safe to show the user. */
export class SongFileError extends Error {
  override name = 'SongFileError'
}

export function serializeSong(song: Song): string {
  const patternIndex = new Map(song.patterns.map((p, i) => [p.id, i]))
  const trackIndex = new Map(song.tracks.map((t, i) => [t.id, i]))
  const file = {
    format: SONG_FILE_FORMAT,
    version: SONG_FILE_VERSION,
    song: {
      bpm: song.bpm,
      ppq: song.ppq,
      beatsPerBar: song.beatsPerBar,
      bars: song.bars,
      tracks: song.tracks.map((t) => ({ name: t.name, synth: { ...t.synth } })),
      patterns: song.patterns.map((p) => ({
        name: p.name,
        length: p.length,
        notes: p.notes.map(({ pitch, start, duration, velocity }) => ({ pitch, start, duration, velocity })),
      })),
      clips: song.clips.map((c) => ({
        pattern: patternIndex.get(c.patternId),
        track: trackIndex.get(c.trackId),
        start: c.start,
        offset: c.offset,
        length: c.length,
      })),
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

  const timing: SongTiming = {
    bpm: number(raw.bpm, 'bpm', { min: 1, max: 999 }),
    ppq: number(raw.ppq, 'ppq', { min: 1, max: 9600, integer: true }),
    beatsPerBar: number(raw.beatsPerBar, 'beatsPerBar', { min: 1, max: 64, integer: true }),
    bars: number(raw.bars, 'bars', { min: 1, max: 9999, integer: true }),
  }

  return data.version === 1 ? parseVersion1(raw, timing) : parseVersion2(raw, timing)
}

function parseVersion1(raw: Record<string, unknown>, timing: SongTiming): Song {
  const synth = raw.synth === undefined ? DEFAULT_SYNTH : parseSynth(raw.synth, 'The synth settings')
  const song = songFromNotes(timing, [], synth)
  const pattern = song.patterns[0]
  const notes = list(raw.notes, "The song's notes").map((n, i) => clampNote(parseNote(n, `note ${i + 1}`), pattern))
  return { ...song, patterns: [{ ...pattern, notes }] }
}

function parseVersion2(raw: Record<string, unknown>, timing: SongTiming): Song {
  const tracks: Track[] = list(raw.tracks, "The song's tracks").map((t, i) => {
    const label = `track ${i + 1}`
    if (!isObject(t)) throw new SongFileError(`The song's ${label} is invalid.`)
    return createTrack(text(t.name, `${label} name`), parseSynth(t.synth, `The ${label} synth settings`))
  })

  const patterns: Pattern[] = list(raw.patterns, "The song's patterns").map((p, i) => {
    const label = `pattern ${i + 1}`
    if (!isObject(p)) throw new SongFileError(`The song's ${label} is invalid.`)
    const pattern = createPattern(
      text(p.name, `${label} name`),
      number(p.length, `${label} length`, { min: 0, exclusiveMin: true }),
    )
    const notes = list(p.notes, `The ${label} notes`).map((n, j) => clampNote(parseNote(n, `${label} note ${j + 1}`), pattern))
    return { ...pattern, notes }
  })

  const song: Song = { ...timing, tracks, patterns, clips: [] }
  const clips: Clip[] = list(raw.clips, "The song's clips").map((c, i) => {
    const label = `clip ${i + 1}`
    if (!isObject(c)) throw new SongFileError(`The song's ${label} is invalid.`)
    const pattern = patterns[number(c.pattern, `${label} pattern`, { min: 0, max: patterns.length - 1, integer: true })]
    const track = tracks[number(c.track, `${label} track`, { min: 0, max: tracks.length - 1, integer: true })]
    const clip: Clip = {
      id: newId('c'),
      patternId: pattern.id,
      trackId: track.id,
      start: number(c.start, `${label} start`, { min: 0 }),
      offset: number(c.offset, `${label} offset`, { min: 0 }),
      length: number(c.length, `${label} length`, { min: 0, exclusiveMin: true }),
    }
    return clampClip(clip, song)
  })

  return { ...song, clips }
}

function parseSynth(raw: unknown, label: string): SynthSettings {
  if (!isObject(raw)) throw new SongFileError(`${label} are invalid.`)
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

function parseNote(raw: unknown, label: string): Note {
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

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new SongFileError(`The song's ${field} is invalid.`)
  return value
}

/** `label` reads as the start of a sentence, e.g. "The song's notes". */
function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new SongFileError(`${label} are missing.`)
  return value
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
