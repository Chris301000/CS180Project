import { describe, expect, it } from 'vitest'
import { clampPitch, isBlackKey, pitchName, pitchToY, snapTick, tickToX, xToTick, yToPitch } from './coords'
import { createDemoSong, formatPosition, secondsToTicks, songLengthTicks, ticksToSeconds } from './song'
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

  it('keeps demo notes inside the song', () => {
    for (const note of song.notes) {
      expect(note.start + note.duration).toBeLessThanOrEqual(songLengthTicks(song))
    }
    expect(new Set(song.notes.map((n) => n.id)).size).toBe(song.notes.length)
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
