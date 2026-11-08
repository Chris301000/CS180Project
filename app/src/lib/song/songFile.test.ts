import { describe, expect, it } from 'vitest'
import { createDemoSong, createNote, type Song } from './song'
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
const timing = { bpm: 120, ppq: 96, beatsPerBar: 4, bars: 2 }
const minimal = {
  ...timing,
  tracks: [{ name: 'T', synth }],
  patterns: [{ name: 'P', length: 384, notes: [] }],
  clips: [{ pattern: 0, track: 0, start: 0, offset: 0, length: 384 }],
}

describe('song files', () => {
  it('round-trips a song', () => {
    const song = createDemoSong()
    expect(strip(parseSong(serializeSong(song)))).toEqual(strip(song))
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
    const song = parseSong(
      file({ ...minimal, patterns: [{ name: 'P', length: 384, notes: [{ pitch: 60, start: 0, duration: 96 }] }] }),
    )
    expect(song.patterns[0].notes[0].velocity).toBe(0.8)
  })

  it('clamps notes that run past the end of their pattern', () => {
    const song = parseSong(
      file({ ...minimal, patterns: [{ name: 'P', length: 384, notes: [{ pitch: 60, start: 10000, duration: 96 }] }] }),
    )
    const note = song.patterns[0].notes[0]
    expect(note.start + note.duration).toBe(384)
  })

  it('clamps clips that run past their pattern or the song', () => {
    const song = parseSong(file({ ...minimal, clips: [{ pattern: 0, track: 0, start: 10000, offset: 0, length: 9999 }] }))
    expect(song.clips[0]).toMatchObject({ start: 768 - 384, length: 384 })
  })

  it.each([
    ['not JSON', 'hello'],
    ['the wrong format', JSON.stringify({ format: 'something-else', version: 2, song: minimal })],
    ['a newer version', file(minimal, { version: SONG_FILE_VERSION + 1 })],
    ['no song', JSON.stringify({ format: SONG_FILE_FORMAT, version: 2 })],
    ['a missing bpm', file({ ...minimal, bpm: undefined })],
    ['a zero bpm', file({ ...minimal, bpm: 0 })],
    ['fractional bars', file({ ...minimal, bars: 1.5 })],
    ['missing tracks', file({ ...minimal, tracks: undefined })],
    ['a track with no name', file({ ...minimal, tracks: [{ synth }] })],
    ['an unknown wave', file({ ...minimal, tracks: [{ name: 'T', synth: { ...synth, wave: 'noise' } }] })],
    ['missing patterns', file({ ...minimal, patterns: undefined })],
    ['a zero-length pattern', file({ ...minimal, patterns: [{ name: 'P', length: 0, notes: [] }] })],
    ['missing pattern notes', file({ ...minimal, patterns: [{ name: 'P', length: 384 }] })],
    [
      'an out-of-range pitch',
      file({ ...minimal, patterns: [{ name: 'P', length: 384, notes: [{ pitch: 200, start: 0, duration: 1 }] }] }),
    ],
    ['missing clips', file({ ...minimal, clips: undefined })],
    ['a clip of a pattern that is not there', file({ ...minimal, clips: [{ ...minimal.clips[0], pattern: 1 }] })],
    ['a clip on a track that is not there', file({ ...minimal, clips: [{ ...minimal.clips[0], track: -1 }] })],
    ['a zero-length clip', file({ ...minimal, clips: [{ ...minimal.clips[0], length: 0 }] })],
  ])('rejects %s', (_, text) => {
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
    expect(song.tracks[0].synth).toEqual(synth)
    expect(song.patterns).toHaveLength(1)
    expect(song.patterns[0].length).toBe(768)
    expect(song.patterns[0].notes.map(({ id: _id, ...n }) => n)).toEqual([{ ...notes[0], velocity: 0.8 }, notes[1]])
    expect(song.clips).toEqual([
      expect.objectContaining({ patternId: song.patterns[0].id, trackId: song.tracks[0].id, start: 0, offset: 0, length: 768 }),
    ])
  })

  it('use the default synth when it was left out', () => {
    expect(parseSong(v1({ ...timing, notes })).tracks[0].synth.wave).toBe('sawtooth')
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
