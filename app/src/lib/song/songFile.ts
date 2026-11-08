// Song files: turning a Song into text that can be saved or sent to someone,
// and turning that text back into a Song. Plain TypeScript with no DOM, so it
// is easy to test; App.svelte does the actual downloading and file picking.
//
// A version 3 file looks like:
//   { "format": "lite-daw-song", "version": 3, "song": {
//       bpm, ppq, beatsPerBar, bars,
//       tracks:   [{ name }],
//       patterns: [{ name, length, volume, instrument: { type, ...settings },
//                    notes: [{ pitch, start, duration, velocity }] }],
//       clips:    [{ pattern, track, start, offset, length }] } }
// where a clip's `pattern` and `track` are positions in those lists.
//
// Older versions still open:
//   - Version 2 put the synth on each track instead of each pattern. A pattern
//     gets the synth of the track its first clip is on.
//   - Version 1 (from before tracks existed) has `synth` and `notes` on the
//     song, and loads as one track playing one pattern.
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
  newId,
  songFromNotes,
  type Clip,
  type Note,
  type Pattern,
  type Song,
  type SongTiming,
} from './song'
import {
  DEFAULT_INSTRUMENT,
  INSTRUMENTS,
  type ChoiceParam,
  type Instrument,
  type BuiltinType,
  type NumberParam,
} from '../instruments/definitions'

export const SONG_FILE_FORMAT = 'lite-daw-song'
export const SONG_FILE_VERSION = 3
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
      tracks: song.tracks.map((t) => ({ name: t.name })),
      patterns: song.patterns.map((p) => ({
        name: p.name,
        length: p.length,
        volume: p.volume,
        instrument: { ...p.instrument },
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

  return data.version === 1 ? parseVersion1(raw, timing) : parseTracksAndPatterns(raw, timing, data.version)
}

function parseVersion1(raw: Record<string, unknown>, timing: SongTiming): Song {
  const instrument = raw.synth === undefined ? DEFAULT_INSTRUMENT : parseInstrument(raw.synth, 'The synth settings')
  const song = songFromNotes(timing, [], instrument)
  const pattern = song.patterns[0]
  const notes = list(raw.notes, "The song's notes").map((n, i) => clampNote(parseNote(n, `note ${i + 1}`), pattern))
  return { ...song, patterns: [{ ...pattern, notes }] }
}

/** Versions 2 and 3, which differ only in where the instrument is kept. */
function parseTracksAndPatterns(raw: Record<string, unknown>, timing: SongTiming, version: number): Song {
  const rawTracks = list(raw.tracks, "The song's tracks").map((t, i) => {
    if (!isObject(t)) throw new SongFileError(`The song's track ${i + 1} is invalid.`)
    return t
  })
  const tracks = rawTracks.map((t, i) => createTrack(text(t.name, `track ${i + 1} name`)))
  // Version 2 only: each track's synth, handed to the patterns placed on it below.
  const trackInstruments =
    version === 2 ? rawTracks.map((t, i) => parseInstrument(t.synth, `The track ${i + 1} synth settings`)) : []

  const rawClips = list(raw.clips, "The song's clips")
  const patterns: Pattern[] = list(raw.patterns, "The song's patterns").map((p, i) => {
    const label = `pattern ${i + 1}`
    if (!isObject(p)) throw new SongFileError(`The song's ${label} is invalid.`)
    let instrument: Instrument
    if (version === 2) {
      const firstClip = rawClips.find((c) => isObject(c) && c.pattern === i) as Record<string, unknown> | undefined
      const track = typeof firstClip?.track === 'number' ? firstClip.track : 0
      instrument = trackInstruments[track] ?? DEFAULT_INSTRUMENT
    } else {
      instrument = parseInstrument(p.instrument, `The ${label} instrument settings`)
    }
    const pattern = createPattern(
      text(p.name, `${label} name`),
      number(p.length, `${label} length`, { min: 0, exclusiveMin: true }),
      [],
      instrument,
      // Added after version 3 first came out, so it may be missing: full volume.
      p.volume === undefined ? 1 : number(p.volume, `${label} volume`, { min: 0, max: 1 }),
    )
    const notes = list(p.notes, `The ${label} notes`).map((n, j) =>
      clampNote(parseNote(n, `${label} note ${j + 1}`), pattern),
    )
    return { ...pattern, notes }
  })

  const song: Song = { ...timing, tracks, patterns, clips: [] }
  const clips: Clip[] = rawClips.map((c, i) => {
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

/**
 * Reads an instrument, checking each setting against its range in
 * definitions.ts. Synths saved before there were several instrument types
 * have no `type`; they're the simple synth.
 */
function parseInstrument(raw: unknown, label: string): Instrument {
  if (!isObject(raw)) throw new SongFileError(`${label} are invalid.`)
  const type = raw.type ?? 'basic'
  if (type === 'wam') {
    // A plugin's settings are its own; keep them exactly as saved. Whether the
    // plugin is allowed to load is decided when it's played, not here, so a
    // song with an unapproved plugin still opens and keeps it.
    return {
      type: 'wam',
      url: text(raw.url, 'plugin address'),
      name: text(raw.name, 'plugin name'),
      state: raw.state === undefined ? null : raw.state,
    }
  }
  if (typeof type !== 'string' || !Object.hasOwn(INSTRUMENTS, type)) {
    throw new SongFileError(`Unknown instrument "${String(type)}".`)
  }
  const params = INSTRUMENTS[type as BuiltinType].params as Record<string, NumberParam | ChoiceParam>
  const instrument: Record<string, unknown> = { type }
  for (const [key, spec] of Object.entries(params)) {
    const value = raw[key]
    const field = `${spec.label.toLowerCase()} setting`
    if (spec.kind === 'number') {
      instrument[key] = number(value, field, { min: spec.min, max: spec.max })
    } else if (typeof value === 'string' && spec.options.includes(value)) {
      instrument[key] = value
    } else {
      throw new SongFileError(`The song's ${field} is invalid (${JSON.stringify(value) ?? 'missing'}).`)
    }
  }
  return instrument as unknown as Instrument
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
