import { afterEach, describe, expect, it } from 'vitest'
import { AudioPlayer, notesStartingIn } from './player'
import { RecordingBackend } from './recordingBackend'
import { pitchToFrequency } from './backend'
import { removeClips } from '../song/clips'
import { removeNotes, replacePattern } from '../song/edits'
import {
  createClip,
  createNote,
  createPattern,
  createTrack,
  songFromNotes,
  type Note,
  type Song,
} from '../song/song'
import { createInstrument, DEFAULT_INSTRUMENT } from '../instruments/definitions'
import { Transport } from '../song/transport'

// 120 BPM at 96 ppq: one beat is 96 ticks or 0.5s. The song is 1 bar, 2 seconds.
const TIMING = { bpm: 120, ppq: 96, beatsPerBar: 4, bars: 1 }
const makeSong = (notes: Note[]): Song => songFromNotes(TIMING, notes)

const players: AudioPlayer[] = []

function setup(notes: Note[]) {
  const state = { song: makeSong(notes) }
  const backend = new RecordingBackend()
  const transport = new Transport(() => state.song, () => backend.now())
  const player = new AudioPlayer(() => state.song, transport, backend)
  players.push(player)
  // Runs the scheduler in small steps, like its timer does.
  const advance = (seconds: number) => {
    const steps = Math.round(seconds / 0.025)
    for (let i = 0; i < steps; i++) {
      backend.time += 0.025
      player.update()
    }
  }
  return { state, backend, transport, player, advance }
}

/** Scheduled times, rounded to the millisecond to ignore floating point noise. */
const times = (backend: RecordingBackend) => backend.notes.map((n) => Math.round(n.time * 1000) / 1000)

const note = (start: number, pitch = 60) => createNote({ pitch, start, duration: 48 })

afterEach(() => {
  for (const player of players.splice(0)) player.dispose()
})

describe('notesStartingIn', () => {
  it('includes the start of the range and excludes the end', () => {
    const song = makeSong([note(0), note(48), note(96)])
    expect(notesStartingIn(song, 48, 96).map((n) => n.start)).toEqual([48])
  })

  // A 4-bar song with one 1-bar pattern, a note on each beat, placed by the clips given.
  function placed(...clips: { start: number; offset?: number; length?: number }[]): Song {
    const pattern = createPattern('P', 384, [0, 96, 192, 288].map((start) => note(start)))
    const track = createTrack('T')
    return {
      ...TIMING,
      bars: 4,
      tracks: [track],
      patterns: [pattern],
      clips: clips.map((c) => ({ ...createClip(pattern, track, c.start), ...c })),
    }
  }
  const starts = (song: Song) => notesStartingIn(song, 0, 1536).map((n) => n.start)

  it("moves a clip's notes to where the clip starts in the song", () => {
    expect(starts(placed({ start: 384 }))).toEqual([384, 480, 576, 672])
  })

  it('plays a pattern placed twice in both places', () => {
    expect(starts(placed({ start: 0 }, { start: 768 }))).toEqual([0, 96, 192, 288, 768, 864, 960, 1056])
  })

  it('skips notes trimmed off the left, keeping the rest where they were', () => {
    // Trimmed by 100 ticks: the clip's left edge is at 484, and the note at pattern tick 96 is gone.
    expect(starts(placed({ start: 484, offset: 100, length: 284 }))).toEqual([576, 672])
  })

  it('skips notes trimmed off the right and cuts short the one crossing the end', () => {
    const notes = notesStartingIn(placed({ start: 0, length: 120 }), 0, 1536)
    expect(notes.map((n) => [n.start, n.duration])).toEqual([[0, 48], [96, 24]])
  })

  it("plays each note with its own pattern's instrument, whatever track it's on", () => {
    const fm = createInstrument('fm')
    const lead = createPattern('Lead', 384, [note(0)])
    const bells = createPattern('Bells', 384, [note(0)], fm)
    const track = createTrack('T')
    const song: Song = {
      ...TIMING,
      tracks: [track],
      patterns: [lead, bells],
      clips: [createClip(lead, track, 0), createClip(bells, track, 0)],
    }
    expect(notesStartingIn(song, 0, 384).map((n) => n.instrument)).toEqual([DEFAULT_INSTRUMENT, fm])
  })
})

describe('pitchToFrequency', () => {
  it('matches known pitches', () => {
    expect(pitchToFrequency(69)).toBe(440)
    expect(pitchToFrequency(81)).toBe(880)
    expect(pitchToFrequency(60)).toBeCloseTo(261.63, 2)
  })
})

describe('AudioPlayer', () => {
  it('queues nothing until playing', () => {
    const { backend, player } = setup([note(0)])
    player.update()
    expect(backend.notes).toEqual([])
  })

  it('queues a note ahead of time at its exact audio time', () => {
    const { backend, transport, advance } = setup([note(96)])
    backend.time = 10
    transport.play()
    advance(0.45)
    expect(backend.notes).toHaveLength(1)
    expect(backend.notes[0].time).toBeCloseTo(10.5)
    expect(backend.now()).toBeLessThan(10.5)
  })

  it('sends the note details and its instrument to the backend', () => {
    const { backend, transport } = setup([createNote({ pitch: 72, start: 0, duration: 96, velocity: 0.5 })])
    transport.play()
    expect(backend.notes[0]).toMatchObject({ pitch: 72, duration: 0.5, velocity: 0.5, instrument: DEFAULT_INSTRUMENT })
  })

  it("sends each note's pattern volume to the backend", () => {
    const { state, backend, transport } = setup([note(0)])
    state.song = replacePattern(state.song, { ...state.song.patterns[0], volume: 0.4 })
    transport.play()
    expect(backend.notes[0].volume).toBe(0.4)
  })

  it('plays each note once across many passes', () => {
    const { backend, transport, advance } = setup([note(0), note(48), note(96), note(144)])
    transport.play()
    advance(1)
    expect(times(backend)).toEqual([0, 0.25, 0.5, 0.75])
  })

  it('plays notes on the same tick together', () => {
    const { backend, transport } = setup([note(0, 60), note(0, 64), note(0, 67)])
    transport.play()
    expect(backend.notes.map((n) => n.pitch)).toEqual([60, 64, 67])
  })

  it('loops, scheduling the start of the song after the loop point', () => {
    const { backend, transport, advance } = setup([note(0), note(380)])
    transport.play()
    advance(2.05)
    expect(times(backend)).toEqual([0, 1.979, 2])
  })

  it('schedules across a loop point inside a single pass', () => {
    const { backend, transport, advance } = setup([note(0)])
    transport.seek(372) // 0.0625s before the end
    transport.play()
    advance(0.05)
    expect(times(backend)).toEqual([0.063])
  })

  it('does not run past the end when not looping', () => {
    const { backend, transport, advance } = setup([note(0)])
    transport.loop = false
    transport.play()
    advance(3)
    expect(backend.notes).toHaveLength(1)
    expect(transport.isPlaying).toBe(false)
  })

  it('silences on pause and carries on from the same place', () => {
    const { backend, transport, advance } = setup([note(0), note(192)])
    transport.play()
    advance(0.5)
    const stops = backend.stops
    transport.pause()
    expect(backend.stops).toBe(stops + 1)
    backend.time += 5
    transport.play()
    advance(0.5)
    expect(backend.notes.at(-1)!.time).toBeCloseTo(5.5 + 0.5)
  })

  it('silences on stop and plays nothing afterwards', () => {
    const { backend, transport, player } = setup([note(0)])
    transport.play()
    transport.stop()
    const count = backend.notes.length
    backend.time += 1
    player.update()
    expect(backend.stops).toBeGreaterThan(0)
    expect(backend.notes).toHaveLength(count)
  })

  it('jumps to the new position on seek', () => {
    const { backend, transport, advance } = setup([note(0), note(240)])
    transport.play()
    advance(0.1)
    backend.notes.length = 0
    transport.seek(230)
    advance(0.1)
    expect(times(backend)).toEqual([0.152])
  })

  it('picks up edits made during playback', () => {
    const { state, backend, transport, advance } = setup([note(192), note(288)])
    transport.play()
    const pattern = state.song.patterns[0]
    state.song = replacePattern(state.song, removeNotes(pattern, [pattern.notes[1].id]))
    advance(1.8)
    expect(times(backend)).toEqual([1])
  })

  it('skips missed notes after a stall instead of playing them in a burst', () => {
    const { backend, transport, player, advance } = setup([note(48), note(96), note(288)])
    transport.play()
    backend.time = 1 // Timer didn't run for a second: the first two notes were missed.
    player.update()
    advance(0.6)
    expect(times(backend)).toEqual([1.5])
  })

  it('jumps back with the playhead when the song gets shorter under it', () => {
    // A 4-bar song with a 1-bar pattern at bar 1 and bar 3, so it loops every 3 bars.
    const pattern = createPattern('P', 384, [note(0)])
    const track = createTrack('T')
    const far = createClip(pattern, track, 768)
    const state = {
      song: { ...TIMING, bars: 4, tracks: [track], patterns: [pattern], clips: [createClip(pattern, track, 0), far] } as Song,
    }
    const backend = new RecordingBackend()
    const transport = new Transport(() => state.song, () => backend.now())
    const player = new AudioPlayer(() => state.song, transport, backend)
    players.push(player)
    const advance = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / 0.025); i++) {
        backend.time += 0.025
        player.update()
      }
    }
    transport.play()
    advance(4.2) // Inside the far clip, which starts at 4s.
    const stops = backend.stops
    state.song = removeClips(state.song, [far.id]) // Now it loops every bar.
    advance(0.05)
    expect(backend.stops).toBe(stops + 1)
    // The first note plays again right away, where the playhead now is.
    expect(backend.notes.at(-1)!.time).toBeCloseTo(4.225, 2)
    expect(transport.position()).toBeLessThan(24)
  })

  it('stops listening once disposed', () => {
    const { backend, transport, player } = setup([note(0)])
    player.dispose()
    transport.play()
    expect(backend.notes).toEqual([])
  })
})
