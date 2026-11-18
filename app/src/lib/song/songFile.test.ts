import { describe, expect, it } from 'vitest'
import { createDemoSong, createNote, type Song } from './song'
import { createInstrument } from '../instruments/definitions'
import { parseSong, serializeSong, SongFileError, SONG_FILE_FORMAT, SONG_FILE_VERSION } from './songFile'

/**
 * A song with its IDs swapped for positions, so a loaded song (which gets fresh
 * IDs) can be compared with the one that was saved.
 */
function strip(song: Song) {
  const pattern = (id: string) => song.patterns.findIndex((p) => p.id === id)
  const track = (id: string) => song.tracks.findIndex((t) => t.id === id)
  return {
    ...song,
    tracks: song.tracks.map(({ id: _id, ...rest }) => rest),
    patterns: song.patterns.map(({ id: _id, notes, ...rest }) => ({
      ...rest,
      notes: notes.map(({ id: _id, ...note }) => note),
    })),
    clips: song.clips.map(({ id: _id, patternId, trackId, ...rest }) => ({
      ...rest,
      pattern: pattern(patternId),
      track: track(trackId),
    })),
  }
}

function file(song: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ format: SONG_FILE_FORMAT, version: SONG_FILE_VERSION, song, ...extra })
}

const synth = { wave: 'sine', attack: 0, release: 0 }
const instrument = { type: 'basic', ...synth }
const timing = { bpm: 120, ppq: 96, beatsPerBar: 4, bars: 2 }
const minimal = {
  ...timing,
  tracks: [{ name: 'T' }],
  patterns: [{ name: 'P', length: 384, instrument, notes: [] }],
  clips: [{ pattern: 0, track: 0, start: 0, offset: 0, length: 384 }],
}
const withPattern = (pattern: Record<string, unknown>) => file({ ...minimal, patterns: [{ ...minimal.patterns[0], ...pattern }] })

describe('song files', () => {
  it('round-trips a song', () => {
    const song = createDemoSong()
    expect(strip(parseSong(serializeSong(song)))).toEqual(strip(song))
  })

  it('round-trips pattern volumes, and gives patterns saved without one full volume', () => {
    const song = createDemoSong()
    const quieter = { ...song, patterns: [{ ...song.patterns[0], volume: 0.35 }, song.patterns[1]] }
    expect(parseSong(serializeSong(quieter)).patterns.map((p) => p.volume)).toEqual([0.35, 1])
    expect(parseSong(file(minimal)).patterns[0].volume).toBe(1)
  })

  it('round-trips every instrument type', () => {
    const song = createDemoSong()
    const fm = { ...createInstrument('fm'), ratio: 3.5, depth: 7 }
    const withFm = { ...song, patterns: [{ ...song.patterns[0], instrument: fm }, song.patterns[1]] }
    expect(parseSong(serializeSong(withFm)).patterns[0].instrument).toEqual(fm)
  })

  it('gives everything loaded fresh IDs that do not collide with later ones', () => {
    const song = createDemoSong()
    const loaded = parseSong(serializeSong(song))
    const idsOf = (s: Song) => [
      ...s.tracks.map((t) => t.id),
      ...s.patterns.flatMap((p) => [p.id, ...p.notes.map((n) => n.id)]),
      ...s.clips.map((c) => c.id),
    ]
    const ids = new Set(idsOf(loaded))
    expect(ids.size).toBe(idsOf(loaded).length)
    for (const id of idsOf(song)) expect(ids.has(id)).toBe(false)
    expect(ids.has(createNote({ pitch: 60, start: 0, duration: 1 }).id)).toBe(false)
  })

  it('does not save IDs', () => {
    expect(serializeSong(createDemoSong())).not.toMatch(/"id"|"patternId"|"trackId"/)
  })

  it('fills in the default velocity', () => {
    const song = parseSong(withPattern({ notes: [{ pitch: 60, start: 0, duration: 96 }] }))
    expect(song.patterns[0].notes[0].velocity).toBe(0.8)
  })

  it('clamps notes that run past the end of their pattern', () => {
    const song = parseSong(withPattern({ notes: [{ pitch: 60, start: 10000, duration: 96 }] }))
    const note = song.patterns[0].notes[0]
    expect(note.start + note.duration).toBe(384)
  })

  it('clamps clips that run past their pattern or the song', () => {
    const song = parseSong(file({ ...minimal, clips: [{ pattern: 0, track: 0, start: 10000, offset: 0, length: 9999 }] }))
    expect(song.clips[0]).toMatchObject({ start: 768 - 384, length: 384 })
  })

  it.each([
    ['not JSON', 'hello'],
    ['the wrong format', JSON.stringify({ format: 'something-else', version: 3, song: minimal })],
    ['a newer version', file(minimal, { version: SONG_FILE_VERSION + 1 })],
    ['no song', JSON.stringify({ format: SONG_FILE_FORMAT, version: 3 })],
    ['a missing bpm', file({ ...minimal, bpm: undefined })],
    ['a zero bpm', file({ ...minimal, bpm: 0 })],
    ['fractional bars', file({ ...minimal, bars: 1.5 })],
    ['missing tracks', file({ ...minimal, tracks: undefined })],
    ['a track with no name', file({ ...minimal, tracks: [{}] })],
    ['missing patterns', file({ ...minimal, patterns: undefined })],
    ['a zero-length pattern', withPattern({ length: 0 })],
    ['missing pattern notes', withPattern({ notes: undefined })],
    ['a pattern with no instrument', withPattern({ instrument: undefined })],
    ['an unknown instrument', withPattern({ instrument: { type: 'theremin' } })],
    ['an unknown wave', withPattern({ instrument: { ...instrument, wave: 'noise' } })],
    ['a setting out of range', withPattern({ instrument: { ...createInstrument('fm'), depth: 99 } })],
    ['a volume above full', withPattern({ volume: 1.5 })],
    ['a text volume', withPattern({ volume: 'loud' })],
    ['a missing setting', withPattern({ instrument: { type: 'fm', ratio: 2 } })],
    ['an out-of-range pitch', withPattern({ notes: [{ pitch: 200, start: 0, duration: 1 }] })],
    ['missing clips', file({ ...minimal, clips: undefined })],
    ['a clip of a pattern that is not there', file({ ...minimal, clips: [{ ...minimal.clips[0], pattern: 1 }] })],
    ['a clip on a track that is not there', file({ ...minimal, clips: [{ ...minimal.clips[0], track: -1 }] })],
    ['a zero-length clip', file({ ...minimal, clips: [{ ...minimal.clips[0], length: 0 }] })],
  ])('rejects %s', (_, text) => {
    expect(() => parseSong(text)).toThrow(SongFileError)
  })
})

describe('version 2 song files', () => {
  // Version 2 kept a synth on each track, and patterns had no instrument.
  const square = { wave: 'square', attack: 0.1, release: 0.2 }
  const v2 = (song: Record<string, unknown>) => file(song, { version: 2 })
  const pattern = (name: string) => ({ name, length: 384, notes: [] })
  const clip = (pattern: number, track: number, start = 0) => ({ pattern, track, start, offset: 0, length: 384 })

  it("give each pattern the synth of the track its first clip is on", () => {
    const song = parseSong(
      v2({
        ...timing,
        tracks: [{ name: 'Lead', synth }, { name: 'Bass', synth: square }],
        patterns: [pattern('A'), pattern('B')],
        clips: [clip(1, 1), clip(0, 0), clip(1, 0, 384)],
      }),
    )
    expect(song.tracks).toEqual([expect.objectContaining({ name: 'Lead' }), expect.objectContaining({ name: 'Bass' })])
    expect(song.patterns[0].instrument).toEqual({ type: 'basic', ...synth })
    expect(song.patterns[1].instrument).toEqual({ type: 'basic', ...square })
  })

  it("give a pattern with no clips the first track's synth", () => {
    const song = parseSong(v2({ ...timing, tracks: [{ name: 'T', synth: square }], patterns: [pattern('A')], clips: [] }))
    expect(song.patterns[0].instrument).toEqual({ type: 'basic', ...square })
  })

  it('reject a track with an invalid synth', () => {
    const text = v2({ ...timing, tracks: [{ name: 'T', synth: { ...synth, wave: 'noise' } }], patterns: [], clips: [] })
    expect(() => parseSong(text)).toThrow(SongFileError)
  })
})

describe('version 1 song files', () => {
  const v1 = (song: Record<string, unknown>) => file(song, { version: 1 })
  const notes = [
    { pitch: 60, start: 0, duration: 96 },
    { pitch: 64, start: 96, duration: 96, velocity: 0.5 },
  ]

  it('load as one track playing one pattern across the whole song', () => {
    const song = parseSong(v1({ ...timing, synth, notes }))
    expect(song.tracks).toHaveLength(1)
    expect(song.patterns).toHaveLength(1)
    expect(song.patterns[0].instrument).toEqual({ type: 'basic', ...synth })
    expect(song.patterns[0].length).toBe(768)
    expect(song.patterns[0].notes.map(({ id: _id, ...n }) => n)).toEqual([{ ...notes[0], velocity: 0.8 }, notes[1]])
    expect(song.clips).toEqual([
      expect.objectContaining({ patternId: song.patterns[0].id, trackId: song.tracks[0].id, start: 0, offset: 0, length: 768 }),
    ])
  })

  it('use the default synth when it was left out', () => {
    expect(parseSong(v1({ ...timing, notes })).patterns[0].instrument).toMatchObject({ type: 'basic', wave: 'sawtooth' })
  })

  it('clamp notes that run past the end of the song', () => {
    const note = parseSong(v1({ ...timing, notes: [{ pitch: 60, start: 10000, duration: 96 }] })).patterns[0].notes[0]
    expect(note.start + note.duration).toBe(768)
  })

  it.each([
    ['missing notes', v1({ ...timing })],
    ['a zero-length note', v1({ ...timing, notes: [{ pitch: 60, start: 0, duration: 0 }] })],
    ['a string start', v1({ ...timing, notes: [{ pitch: 60, start: '0', duration: 1 }] })],
    ['an unknown wave', v1({ ...timing, notes, synth: { ...synth, wave: 'noise' } })],
  ])('reject %s', (_, text) => {
    expect(() => parseSong(text)).toThrow(SongFileError)
  })
})
