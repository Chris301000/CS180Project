// Note edits. Every change to a pattern's notes goes through these functions.
// Each returns a new Pattern and leaves the old one untouched, which is what
// makes undo a matter of keeping the old songs around (see history.ts). An
// edit that changes nothing returns the same pattern, so it never becomes an
// empty undo step.
//
// They work on one pattern, not the whole song, so the piano roll only needs
// the pattern it's editing; replacePattern puts the result back into the song.

import { clampPitch } from './coords'
import type { Note, Pattern, Song } from './song'

export const MIN_DURATION = 1

/** Keeps a note's pitch in MIDI range and its start and end inside the pattern. */
export function clampNote(note: Note, pattern: Pick<Pattern, 'length'>): Note {
  const duration = Math.max(MIN_DURATION, Math.min(note.duration, pattern.length))
  const start = Math.max(0, Math.min(note.start, pattern.length - duration))
  return { ...note, pitch: clampPitch(note.pitch), start, duration }
}

export function addNote(pattern: Pattern, note: Note): Pattern {
  return { ...pattern, notes: [...pattern.notes, clampNote(note, pattern)] }
}

export function removeNotes(pattern: Pattern, ids: Iterable<string>): Pattern {
  const remove = new Set(ids)
  const notes = pattern.notes.filter((n) => !remove.has(n.id))
  return notes.length === pattern.notes.length ? pattern : { ...pattern, notes }
}

export function updateNote(pattern: Pattern, id: string, changes: Partial<Omit<Note, 'id'>>): Pattern {
  const current = pattern.notes.find((n) => n.id === id)
  if (!current) return pattern
  const next = clampNote({ ...current, ...changes }, pattern)
  const changed = (Object.keys(next) as (keyof Note)[]).some((key) => next[key] !== current[key])
  if (!changed) return pattern
  return { ...pattern, notes: pattern.notes.map((n) => (n === current ? next : n)) }
}

/** The note covering `tick` on row `pitch`. Later notes are drawn on top, so they win. */
export function noteAt(pattern: Pattern, tick: number, pitch: number): Note | undefined {
  return pattern.notes.findLast((n) => n.pitch === pitch && tick >= n.start && tick < n.start + n.duration)
}

/** Swaps in an edited pattern (matched by id). Returns the same song if nothing changed. */
export function replacePattern(song: Song, pattern: Pattern): Song {
  const index = song.patterns.findIndex((p) => p.id === pattern.id)
  if (index === -1 || song.patterns[index] === pattern) return song
  return { ...song, patterns: song.patterns.with(index, pattern) }
}
