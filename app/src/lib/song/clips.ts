// Clip edits: placing, moving, trimming and removing clips in the track list.
// Like the note edits in edits.ts, each returns a new Song, and returns the
// same song when nothing changed so it never becomes an empty undo step.
//
// Snapping is the caller's job (as with notes); these only keep clips valid:
// inside the song, inside their pattern, and on a track that exists.

import { findPattern, songLengthTicks, type Clip, type Song } from './song'

export const MIN_CLIP_LENGTH = 1

/**
 * Keeps a clip valid: its trim stays inside its pattern, it's at least
 * MIN_CLIP_LENGTH long, and it starts and ends inside the song.
 */
export function clampClip(clip: Clip, song: Song): Clip {
  const patternLength = findPattern(song, clip.patternId)?.length ?? clip.offset + clip.length
  const songLength = songLengthTicks(song)
  const offset = Math.max(0, Math.min(clip.offset, patternLength - MIN_CLIP_LENGTH))
  const length = Math.max(MIN_CLIP_LENGTH, Math.min(clip.length, patternLength - offset, songLength))
  const start = Math.max(0, Math.min(clip.start, songLength - length))
  return { ...clip, offset, length, start }
}

export function addClip(song: Song, clip: Clip): Song {
  if (!findPattern(song, clip.patternId) || !song.tracks.some((t) => t.id === clip.trackId)) return song
  return { ...song, clips: [...song.clips, clampClip(clip, song)] }
}

export function removeClips(song: Song, ids: Iterable<string>): Song {
  const remove = new Set(ids)
  const clips = song.clips.filter((c) => !remove.has(c.id))
  return clips.length === song.clips.length ? song : { ...song, clips }
}

/** Applies changes to one clip, clamped. Changing to a track that doesn't exist is ignored. */
function updateClip(song: Song, id: string, changes: Partial<Omit<Clip, 'id' | 'patternId'>>): Song {
  const current = song.clips.find((c) => c.id === id)
  if (!current) return song
  if (changes.trackId !== undefined && !song.tracks.some((t) => t.id === changes.trackId)) {
    changes = { ...changes, trackId: current.trackId }
  }
  const next = clampClip({ ...current, ...changes }, song)
  const changed = (Object.keys(next) as (keyof Clip)[]).some((key) => next[key] !== current[key])
  if (!changed) return song
  return { ...song, clips: song.clips.map((c) => (c === current ? next : c)) }
}

/** Moves a clip to a new start time, and optionally onto another track. Its trim stays the same. */
export function moveClip(song: Song, id: string, start: number, trackId?: string): Song {
  return updateClip(song, id, trackId === undefined ? { start } : { start, trackId })
}

/**
 * Drags a clip's left edge to song time `start`. The right edge stays put and
 * the notes stay where they are in the song; only how much of the pattern
 * shows changes. It can't go further left than the pattern's beginning.
 */
export function trimClipStart(song: Song, id: string, start: number): Song {
  const clip = song.clips.find((c) => c.id === id)
  if (!clip) return song
  const end = clip.start + clip.length
  // How far the edge moves. It can't go left of the pattern's beginning or the
  // song's start, or right past the point where the clip would be too short.
  const delta = Math.max(-clip.offset, -clip.start, Math.min(start - clip.start, clip.length - MIN_CLIP_LENGTH))
  return updateClip(song, id, { start: clip.start + delta, offset: clip.offset + delta, length: end - (clip.start + delta) })
}

/** Drags a clip's right edge to song time `end`. It can't go past the pattern's end. */
export function trimClipEnd(song: Song, id: string, end: number): Song {
  const clip = song.clips.find((c) => c.id === id)
  if (!clip) return song
  return updateClip(song, id, { length: end - clip.start })
}
