// Every change to a song goes through these functions. Each returns a new
// Song and leaves the old one untouched, which is what makes undo a matter of
// keeping the old songs around (see history.ts).

import { clampPitch } from './coords'
import { songLengthTicks, type Note, type Song } from './song'

export const MIN_DURATION = 1

/** Keeps a note's pitch in MIDI range and its start and end inside the song. */
export function clampNote(note: Note, song: Song): Note {
  const length = songLengthTicks(song)
  const duration = Math.max(MIN_DURATION, Math.min(note.duration, length))
  const start = Math.max(0, Math.min(note.start, length - duration))
  return { ...note, pitch: clampPitch(note.pitch), start, duration }
}

export function addNote(song: Song, note: Note): Song {
  return { ...song, notes: [...song.notes, clampNote(note, song)] }
}

export function removeNotes(song: Song, ids: Iterable<string>): Song {
  const remove = new Set(ids)
  return { ...song, notes: song.notes.filter((n) => !remove.has(n.id)) }
}

export function updateNote(song: Song, id: string, changes: Partial<Omit<Note, 'id'>>): Song {
  return {
    ...song,
    notes: song.notes.map((n) => (n.id === id ? clampNote({ ...n, ...changes }, song) : n)),
  }
}

/** The note covering `tick` on row `pitch`. Later notes are drawn on top, so they win. */
export function noteAt(song: Song, tick: number, pitch: number): Note | undefined {
  return song.notes.findLast((n) => n.pitch === pitch && tick >= n.start && tick < n.start + n.duration)
}
