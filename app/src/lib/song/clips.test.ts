import { describe, expect, it } from 'vitest'
import { addClip, clampClip, clipAt, moveClip, removeClips, trimClipEnd, trimClipStart } from './clips'
import { createClip, createPattern, createTrack, type Song } from './song'

// A 4-bar song (1536 ticks) with a 1-bar pattern (384 ticks) on two tracks.
// The one clip sits at bar 2, untrimmed: song ticks 384–768.
function setup() {
  const pattern = createPattern('P', 384)
  const tracks = [createTrack('A'), createTrack('B')]
  const clip = createClip(pattern, tracks[0], 384)
  const song: Song = { bpm: 120, ppq: 96, beatsPerBar: 4, bars: 4, tracks, patterns: [pattern], clips: [clip] }
  const only = (s: Song) => s.clips[0]
  return { song, pattern, tracks, clip, only }
}

describe('clampClip', () => {
  it('keeps the trim inside the pattern', () => {
    const { song, clip } = setup()
    expect(clampClip({ ...clip, offset: 300, length: 300 }, song)).toMatchObject({ offset: 300, length: 84 })
    expect(clampClip({ ...clip, offset: -20 }, song).offset).toBe(0)
  })

  it('keeps the clip inside the song', () => {
    const { song, clip } = setup()
    expect(clampClip({ ...clip, start: 5000 }, song).start).toBe(1536 - 384)
    expect(clampClip({ ...clip, start: -5 }, song).start).toBe(0)
  })
})

describe('adding and removing clips', () => {
  it('adds a clip, clamped, without changing the original song', () => {
    const { song, pattern, tracks } = setup()
    const next = addClip(song, createClip(pattern, tracks[1], 5000))
    expect(next.clips).toHaveLength(2)
    expect(next.clips[1]).toMatchObject({ trackId: tracks[1].id, start: 1536 - 384 })
    expect(song.clips).toHaveLength(1)
  })

  it('ignores a clip for a pattern or track that does not exist', () => {
    const { song, pattern, tracks } = setup()
    expect(addClip(song, createClip(createPattern('Other', 96), tracks[0], 0))).toBe(song)
    expect(addClip(song, createClip(pattern, createTrack('Other'), 0))).toBe(song)
  })

  it('removes clips by id, and returns the same song if none matched', () => {
    const { song, clip } = setup()
    expect(removeClips(song, [clip.id]).clips).toEqual([])
    expect(removeClips(song, ['missing'])).toBe(song)
  })
})

describe('moveClip', () => {
  it('moves in time, keeping the trim', () => {
    const { song, clip, only } = setup()
    const trimmed = { ...song, clips: [{ ...clip, offset: 96, length: 192 }] }
    expect(only(moveClip(trimmed, clip.id, 0))).toMatchObject({ start: 0, offset: 96, length: 192 })
  })

  it('moves onto another track, but not onto one that does not exist', () => {
    const { song, clip, tracks, only } = setup()
    expect(only(moveClip(song, clip.id, 384, tracks[1].id)).trackId).toBe(tracks[1].id)
    expect(only(moveClip(song, clip.id, 0, 'missing'))).toMatchObject({ start: 0, trackId: tracks[0].id })
  })

  it('returns the same song when nothing moves', () => {
    const { song, clip } = setup()
    expect(moveClip(song, clip.id, 384)).toBe(song)
    expect(moveClip(song, 'missing', 0)).toBe(song)
  })
})

describe('trimClipStart', () => {
  it('trims the left edge in, keeping the right edge and the notes where they are', () => {
    const { song, clip, only } = setup()
    // The pattern starts at song tick start - offset; trimming must not move it.
    const next = only(trimClipStart(song, clip.id, 480))
    expect(next).toMatchObject({ start: 480, offset: 96, length: 288 })
    expect(next.start - next.offset).toBe(clip.start - clip.offset)
  })

  it('drags the left edge back out, but not past the start of the pattern', () => {
    const { song, clip, only } = setup()
    const trimmed = trimClipStart(song, clip.id, 480)
    expect(only(trimClipStart(trimmed, clip.id, 432))).toMatchObject({ start: 432, offset: 48, length: 336 })
    expect(only(trimClipStart(trimmed, clip.id, 0))).toMatchObject({ start: 384, offset: 0, length: 384 })
  })

  it('stops before the clip vanishes', () => {
    const { song, clip, only } = setup()
    expect(only(trimClipStart(song, clip.id, 5000))).toMatchObject({ start: 767, offset: 383, length: 1 })
  })
})

describe('clipAt', () => {
  it('finds the clip under a tick on a track, with an exclusive end', () => {
    const { song, clip, tracks } = setup()
    expect(clipAt(song, 384, tracks[0].id)).toBe(clip)
    expect(clipAt(song, 767, tracks[0].id)).toBe(clip)
    expect(clipAt(song, 768, tracks[0].id)).toBeUndefined()
    expect(clipAt(song, 500, tracks[1].id)).toBeUndefined()
  })

  it('picks the later clip where two overlap', () => {
    const { song, pattern, tracks } = setup()
    const next = addClip(song, createClip(pattern, tracks[0], 576))
    expect(clipAt(next, 600, tracks[0].id)).toBe(next.clips[1])
  })
})

describe('trimClipEnd', () => {
  it('trims the right edge in and back out, but not past the end of the pattern', () => {
    const { song, clip, only } = setup()
    const trimmed = trimClipEnd(song, clip.id, 576)
    expect(only(trimmed)).toMatchObject({ start: 384, offset: 0, length: 192 })
    expect(only(trimClipEnd(trimmed, clip.id, 5000)).length).toBe(384)
  })

  it('stops before the clip vanishes', () => {
    const { song, clip, only } = setup()
    expect(only(trimClipEnd(song, clip.id, 0)).length).toBe(1)
  })
})
