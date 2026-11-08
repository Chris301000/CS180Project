// Song data model. Plain TypeScript with no Svelte imports, so the piano roll
// and the audio player can both depend on it.
//
// A song has tracks (rows, each with its instrument), patterns (blocks of
// notes) and clips (a pattern placed on a track at some time, maybe trimmed).
//
// All times are in ticks. Pixels depend on zoom and seconds depend on tempo;
// ticks depend on neither, so the song stays valid when either changes.

export interface Note {
  id: string
  /** MIDI note number, 0–127 (60 = C4). */
  pitch: number
  /** Start time in ticks from the beginning of the song. */
  start: number
  /** Length in ticks. */
  duration: number
  /** 0–1. */
  velocity: number
}

/**
 * How a song sounds, as plain data so it can be saved and undone. Audio
 * backends turn this into actual sound; live voices never live in the song.
 */
export interface SynthSettings {
  wave: 'sine' | 'square' | 'sawtooth' | 'triangle'
  /** Fade-in, in seconds. */
  attack: number
  /** Fade-out after the note ends, in seconds. */
  release: number
}

export const DEFAULT_SYNTH: SynthSettings = { wave: 'sawtooth', attack: 0.01, release: 0.05 }

/** A row in the track list, and the instrument that plays every clip on it. */
export interface Track {
  id: string
  name: string
  synth: SynthSettings
}

/**
 * A reusable block of notes, like a prefab: every clip that uses it plays the
 * same notes, so editing the pattern changes all of them.
 */
export interface Pattern {
  id: string
  name: string
  /** Length in ticks. Notes stay inside it. */
  length: number
  /** Note starts are measured from the start of the pattern, not the song. */
  notes: Note[]
}

/**
 * One placement of a pattern in the track list. Trimming changes `offset` and
 * `length` and never touches the pattern's notes, so a trim can be undone by
 * dragging the edge back out.
 */
export interface Clip {
  id: string
  patternId: string
  /** The row it sits on, which decides the instrument. */
  trackId: string
  /** Where the clip begins in the song, in ticks. */
  start: number
  /** How far into the pattern the clip begins, in ticks (the left trim). */
  offset: number
  /** How much of the pattern plays, in ticks (the right trim). */
  length: number
}

export interface Song {
  bpm: number
  /** Ticks per quarter note. */
  ppq: number
  /** Quarter-note beats per bar (the time signature numerator, assuming x/4). */
  beatsPerBar: number
  /** Song length in bars. */
  bars: number
  tracks: Track[]
  patterns: Pattern[]
  clips: Clip[]
}

export const DEFAULT_PPQ = 96

// These only need the song's timing fields, so they also work on a SongTiming.

export const ticksPerBar = (song: Pick<Song, 'ppq' | 'beatsPerBar'>) => song.ppq * song.beatsPerBar

/** How long the timeline is: the most the track list shows, and where clips have to end. */
export const songLengthTicks = (song: Pick<Song, 'ppq' | 'beatsPerBar' | 'bars'>) => ticksPerBar(song) * song.bars

/**
 * How much of the song plays before stopping or looping: up to the end of the
 * last clip, rounded up to a whole bar, like FL. At least one bar, so an
 * empty song still has something to loop over.
 */
export function playLengthTicks(song: Song): number {
  const bar = ticksPerBar(song)
  const lastClipEnd = Math.max(0, ...song.clips.map((c) => c.start + c.length))
  return Math.min(songLengthTicks(song), Math.max(bar, Math.ceil(lastClipEnd / bar) * bar))
}

export const ticksToSeconds = (ticks: number, song: Pick<Song, 'bpm' | 'ppq'>) =>
  (ticks / song.ppq) * (60 / song.bpm)

export const secondsToTicks = (seconds: number, song: Pick<Song, 'bpm' | 'ppq'>) =>
  (seconds * song.bpm * song.ppq) / 60

/** Formats a tick position as FL-style "bar:beat:tick", all 1-based except tick. */
export function formatPosition(tick: number, song: Pick<Song, 'ppq' | 'beatsPerBar'>): string {
  const t = Math.max(0, Math.floor(tick))
  const bar = Math.floor(t / ticksPerBar(song))
  const beat = Math.floor((t % ticksPerBar(song)) / song.ppq)
  const rest = t % song.ppq
  return `${bar + 1}:${beat + 1}:${String(rest).padStart(2, '0')}`
}

let nextId = 0

/** A new ID, unique within this session. `prefix` just makes IDs easier to tell apart when debugging. */
export const newId = (prefix: string) => `${prefix}${nextId++}`

export function createNote(fields: Omit<Note, 'id' | 'velocity'> & { velocity?: number }): Note {
  return { id: newId('n'), velocity: 0.8, ...fields }
}

export const createTrack = (name: string, synth: SynthSettings = DEFAULT_SYNTH): Track => ({
  id: newId('t'),
  name,
  synth,
})

export const createPattern = (name: string, length: number, notes: Note[] = []): Pattern => ({
  id: newId('p'),
  name,
  length,
  notes,
})

/** A clip that plays the whole pattern, untrimmed. */
export const createClip = (pattern: Pattern, track: Track, start: number): Clip => ({
  id: newId('c'),
  patternId: pattern.id,
  trackId: track.id,
  start,
  offset: 0,
  length: pattern.length,
})

export type SongTiming = Pick<Song, 'bpm' | 'ppq' | 'beatsPerBar' | 'bars'>

/**
 * A song with one track playing one pattern from start to end. This is what
 * a song looked like before tracks existed, so old song files load as one.
 */
export function songFromNotes(timing: SongTiming, notes: Note[], synth: SynthSettings = DEFAULT_SYNTH): Song {
  const track = createTrack('Track 1', synth)
  const pattern = createPattern('Pattern 1', songLengthTicks(timing), notes)
  return { ...timing, tracks: [track], patterns: [pattern], clips: [createClip(pattern, track, 0)] }
}

export const findPattern = (song: Song, id: string) => song.patterns.find((p) => p.id === id)
export const findTrack = (song: Song, id: string) => song.tracks.find((t) => t.id === id)

/**
 * Where song position `tick` falls inside pattern `patternId`, or null if no
 * clip of that pattern is playing there. If clips overlap, the last one wins,
 * as it's drawn on top.
 */
export function patternPosition(song: Song, patternId: string, tick: number): number | null {
  const clip = song.clips.findLast((c) => c.patternId === patternId && tick >= c.start && tick < c.start + c.length)
  return clip ? tick - clip.start + clip.offset : null
}

/** A placeholder song so there is something to look at: a 4-bar loop of chords and a melody on two tracks, in a 16-bar timeline. */
export function createDemoSong(): Song {
  const ppq = DEFAULT_PPQ
  const beat = ppq
  const bar = ppq * 4
  const chordNotes: Note[] = []
  const melodyNotes: Note[] = []

  // Chords: C – Am – F – G, one per bar.
  const chords = [
    [48, 55, 64],
    [45, 52, 60],
    [41, 48, 57],
    [43, 50, 59],
  ]
  chords.forEach((chord, i) => {
    for (const pitch of chord) {
      chordNotes.push(createNote({ pitch, start: i * bar, duration: bar, velocity: 0.6 }))
    }
  })

  // Melody in eighth notes and quarters.
  const melody: [pitch: number, start: number, duration: number][] = [
    [72, 0, beat], [74, beat, beat / 2], [76, beat * 1.5, beat / 2], [79, beat * 2, beat * 2],
    [76, bar, beat], [72, bar + beat, beat], [69, bar + beat * 2, beat * 2],
    [72, bar * 2, beat / 2], [74, bar * 2 + beat / 2, beat / 2], [77, bar * 2 + beat, beat * 3],
    [79, bar * 3, beat], [77, bar * 3 + beat, beat], [74, bar * 3 + beat * 2, beat], [71, bar * 3 + beat * 3, beat],
  ]
  for (const [pitch, start, duration] of melody) {
    melodyNotes.push(createNote({ pitch, start, duration }))
  }

  const chordTrack = createTrack('Chords')
  const melodyTrack = createTrack('Melody')
  const chordPattern = createPattern('Chords', bar * 4, chordNotes)
  const melodyPattern = createPattern('Melody', bar * 4, melodyNotes)
  return {
    bpm: 120,
    ppq,
    beatsPerBar: 4,
    bars: 16,
    tracks: [chordTrack, melodyTrack],
    patterns: [chordPattern, melodyPattern],
    clips: [createClip(chordPattern, chordTrack, 0), createClip(melodyPattern, melodyTrack, 0)],
  }
}
