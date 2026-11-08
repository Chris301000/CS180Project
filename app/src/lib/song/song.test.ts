import { describe, expect, it } from 'vitest'
import { clampPitch, isBlackKey, pitchName, pitchToY, snapTick, tickToX, xToTick, yToPitch } from './coords'
import {
  createDemoSong,
  formatPosition,
  patternPosition,
  secondsToTicks,
  songFromNotes,
  songLengthTicks,
  ticksToSeconds,
  type Song,
} from './song'
import { Transport } from './transport'

const vp = { pxPerTick: 0.5, rowHeight: 10 }

describe('coords', () => {
  it('round-trips ticks and x', () => {
    expect(tickToX(96, vp)).toBe(48)
    expect(xToTick(tickToX(123, vp), vp)).toBe(123)
  })

  it('puts the highest pitch at the top', () => {
    expect(pitchToY(127, vp)).toBe(0)
    expect(pitchToY(0, vp)).toBe(1270)
  })

  it('maps any y inside a row back to that row', () => {
    expect(yToPitch(pitchToY(60, vp), vp)).toBe(60)
    expect(yToPitch(pitchToY(60, vp) + 9.9, vp)).toBe(60)
    expect(yToPitch(-5, vp)).toBe(127)
    expect(yToPitch(99999, vp)).toBe(0)
  })

  it('snaps ticks', () => {
    expect(snapTick(50, 24)).toBe(48)
    expect(snapTick(40, 24, 'round')).toBe(48)
    expect(snapTick(50, 0)).toBe(50)
  })

  it('names pitches', () => {
    expect(pitchName(60)).toBe('C4')
    expect(pitchName(69)).toBe('A4')
    expect(isBlackKey(61)).toBe(true)
    expect(isBlackKey(64)).toBe(false)
    expect(clampPitch(200)).toBe(127)
  })
})

describe('song', () => {
  const song = createDemoSong()

  it('converts between ticks and seconds at the song tempo', () => {
    // 120 BPM: one beat is half a second.
    expect(ticksToSeconds(song.ppq, song)).toBe(0.5)
    expect(secondsToTicks(0.5, song)).toBe(song.ppq)
  })

  it('formats positions as bar:beat:tick', () => {
    expect(formatPosition(0, song)).toBe('1:1:00')
    expect(formatPosition(song.ppq * 5 + 7, song)).toBe('2:2:07')
  })

  it('keeps demo notes inside their patterns and clips inside the song', () => {
    for (const pattern of song.patterns) {
      for (const note of pattern.notes) expect(note.start + note.duration).toBeLessThanOrEqual(pattern.length)
    }
    for (const clip of song.clips) expect(clip.start + clip.length).toBeLessThanOrEqual(songLengthTicks(song))
  })

  it('gives every demo note, track, pattern and clip its own id', () => {
    const ids = [
      ...song.patterns.flatMap((p) => [p.id, ...p.notes.map((n) => n.id)]),
      ...song.tracks.map((t) => t.id),
      ...song.clips.map((c) => c.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('makes a one-track song covering the whole song from notes', () => {
    const one = songFromNotes({ bpm: 120, ppq: 96, beatsPerBar: 4, bars: 2 }, [])
    expect(one.tracks).toHaveLength(1)
    expect(one.patterns[0].length).toBe(768)
    expect(one.clips[0]).toMatchObject({ start: 0, offset: 0, length: 768 })
  })
})

describe('patternPosition', () => {
  // One pattern, placed twice: untrimmed at bar 1, and at bar 3 with its first 100 ticks trimmed off.
  const base = songFromNotes({ bpm: 120, ppq: 96, beatsPerBar: 4, bars: 4 }, [])
  const pattern = { ...base.patterns[0], length: 384 }
  const first = { ...base.clips[0], length: 384 }
  const second = { ...first, id: 'second', start: 768, offset: 100, length: 284 }
  const song: Song = { ...base, patterns: [pattern], clips: [first, second] }

  it('maps a song position inside a clip to the pattern', () => {
    expect(patternPosition(song, pattern.id, 50)).toBe(50)
    expect(patternPosition(song, pattern.id, 768)).toBe(100)
    expect(patternPosition(song, pattern.id, 800)).toBe(132)
  })

  it('is null outside every clip of the pattern', () => {
    expect(patternPosition(song, pattern.id, 500)).toBeNull()
    expect(patternPosition(song, pattern.id, 768 + 284)).toBeNull()
    expect(patternPosition(song, 'other', 50)).toBeNull()
  })
})

describe('Transport', () => {
  function setup() {
    const song = createDemoSong()
    let now = 0
    const transport = new Transport(() => song, () => now)
    return { song, transport, advance: (s: number) => (now += s) }
  }

  it('advances only while playing', () => {
    const { song, transport, advance } = setup()
    advance(1)
    expect(transport.position()).toBe(0)
    transport.play()
    advance(0.5)
    expect(transport.position()).toBe(song.ppq)
    transport.pause()
    advance(10)
    expect(transport.position()).toBe(song.ppq)
  })

  it('stops back at the start', () => {
    const { transport, advance } = setup()
    transport.play()
    advance(1)
    transport.stop()
    expect(transport.isPlaying).toBe(false)
    expect(transport.position()).toBe(0)
  })

  it('seeks while playing and keeps going from there', () => {
    const { song, transport, advance } = setup()
    transport.play()
    advance(3)
    transport.seek(song.ppq * 2)
    advance(0.5)
    expect(transport.position()).toBe(song.ppq * 3)
  })

  it('loops at the end of the song', () => {
    const { song, transport, advance } = setup()
    const songSeconds = ticksToSeconds(songLengthTicks(song), song)
    transport.play()
    advance(songSeconds + 0.5)
    expect(transport.position()).toBeCloseTo(song.ppq)
  })

  it('stops at the end when not looping', () => {
    const { song, transport, advance } = setup()
    transport.loop = false
    transport.play()
    advance(ticksToSeconds(songLengthTicks(song), song) + 1)
    expect(transport.position()).toBe(0)
    expect(transport.isPlaying).toBe(false)
  })

  it('ignores play while already playing, without losing its place', () => {
    const { song, transport, advance } = setup()
    transport.play()
    advance(0.5)
    transport.play()
    advance(0.5)
    expect(transport.position()).toBe(song.ppq * 2)
  })

  it('resumes from where it paused', () => {
    const { song, transport, advance } = setup()
    transport.play()
    advance(0.5)
    transport.pause()
    advance(5)
    transport.play()
    advance(0.5)
    expect(transport.position()).toBe(song.ppq * 2)
  })

  it('seeks while paused and stays there', () => {
    const { song, transport, advance } = setup()
    transport.seek(song.ppq)
    advance(5)
    expect(transport.position()).toBe(song.ppq)
    expect(transport.isPlaying).toBe(false)
  })

  it('clamps seeks to the song', () => {
    const { song, transport } = setup()
    transport.seek(-10)
    expect(transport.position()).toBe(0)
    transport.seek(1e9)
    expect(transport.position()).toBe(songLengthTicks(song))
  })

  it('keeps position across several loops and a pause', () => {
    const { song, transport, advance } = setup()
    const songSeconds = ticksToSeconds(songLengthTicks(song), song)
    transport.play()
    advance(songSeconds * 3 + 0.5)
    transport.pause()
    expect(transport.position()).toBeCloseTo(song.ppq)
  })

  it('notifies listeners on state changes', () => {
    const { transport } = setup()
    let calls = 0
    const unsubscribe = transport.subscribe(() => calls++)
    transport.play()
    transport.pause()
    unsubscribe()
    transport.play()
    expect(calls).toBe(2)
  })
})
