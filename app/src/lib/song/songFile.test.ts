import { describe, expect, it } from 'vitest'
import { createDemoSong, createNote, songLengthTicks } from './song'
import { parseSong, serializeSong, SongFileError, SONG_FILE_FORMAT, SONG_FILE_VERSION } from './songFile'

const strip = (song: ReturnType<typeof createDemoSong>) => ({
  ...song,
  notes: song.notes.map(({ id: _id, ...rest }) => rest),
})

function file(song: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ format: SONG_FILE_FORMAT, version: SONG_FILE_VERSION, song, ...extra })
}

const minimal = { bpm: 120, ppq: 96, beatsPerBar: 4, bars: 2, notes: [] }

describe('song files', () => {
  it('round-trips a song', () => {
    const song = createDemoSong()
    const loaded = parseSong(serializeSong(song))
    expect(strip(loaded)).toEqual(strip(song))
  })

  it('gives loaded notes fresh IDs that do not collide with later ones', () => {
    const song = createDemoSong()
    const loaded = parseSong(serializeSong(song))
    const ids = new Set(loaded.notes.map((n) => n.id))
    expect(ids.size).toBe(loaded.notes.length)
    for (const note of song.notes) expect(ids.has(note.id)).toBe(false)
    expect(ids.has(createNote({ pitch: 60, start: 0, duration: 1 }).id)).toBe(false)
  })

  it('does not save note IDs', () => {
    expect(serializeSong(createDemoSong())).not.toContain('"id"')
  })

  it('fills in defaults for an omitted synth and velocity', () => {
    const song = parseSong(file({ ...minimal, notes: [{ pitch: 60, start: 0, duration: 96 }] }))
    expect(song.synth.wave).toBe('sawtooth')
    expect(song.notes[0].velocity).toBe(0.8)
  })

  it('clamps notes that run past the end of the song', () => {
    const song = parseSong(file({ ...minimal, notes: [{ pitch: 60, start: 10000, duration: 96 }] }))
    const note = song.notes[0]
    expect(note.start + note.duration).toBeLessThanOrEqual(songLengthTicks(song))
  })

  it.each([
    ['not JSON', 'hello'],
    ['the wrong format', JSON.stringify({ format: 'something-else', version: 1, song: minimal })],
    ['a newer version', file(minimal, { version: SONG_FILE_VERSION + 1 })],
    ['no song', JSON.stringify({ format: SONG_FILE_FORMAT, version: 1 })],
    ['a missing bpm', file({ ...minimal, bpm: undefined })],
    ['a zero bpm', file({ ...minimal, bpm: 0 })],
    ['fractional bars', file({ ...minimal, bars: 1.5 })],
    ['missing notes', file({ ...minimal, notes: undefined })],
    ['an out-of-range pitch', file({ ...minimal, notes: [{ pitch: 200, start: 0, duration: 1 }] })],
    ['a zero-length note', file({ ...minimal, notes: [{ pitch: 60, start: 0, duration: 0 }] })],
    ['a string start', file({ ...minimal, notes: [{ pitch: 60, start: '0', duration: 1 }] })],
    ['an unknown wave', file({ ...minimal, synth: { wave: 'noise', attack: 0, release: 0 } })],
  ])('rejects %s', (_, text) => {
    expect(() => parseSong(text)).toThrow(SongFileError)
  })
})
