// Song data model. Plain TypeScript with no Svelte imports, so the piano roll
// and (later) the audio renderer can both depend on it.
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

export interface Song {
  bpm: number
  /** Ticks per quarter note. */
  ppq: number
  /** Quarter-note beats per bar (the time signature numerator, assuming x/4). */
  beatsPerBar: number
  /** Song length in bars. */
  bars: number
  notes: Note[]
  synth: SynthSettings
}

export const DEFAULT_PPQ = 96

export const ticksPerBar = (song: Song) => song.ppq * song.beatsPerBar

export const songLengthTicks = (song: Song) => ticksPerBar(song) * song.bars

export const ticksToSeconds = (ticks: number, song: Song) =>
  (ticks / song.ppq) * (60 / song.bpm)

export const secondsToTicks = (seconds: number, song: Song) =>
  (seconds * song.bpm * song.ppq) / 60

/** Formats a tick position as FL-style "bar:beat:tick", all 1-based except tick. */
export function formatPosition(tick: number, song: Song): string {
  const t = Math.max(0, Math.floor(tick))
  const bar = Math.floor(t / ticksPerBar(song))
  const beat = Math.floor((t % ticksPerBar(song)) / song.ppq)
  const rest = t % song.ppq
  return `${bar + 1}:${beat + 1}:${String(rest).padStart(2, '0')}`
}

let nextId = 0

export function createNote(fields: Omit<Note, 'id' | 'velocity'> & { velocity?: number }): Note {
  return { id: `n${nextId++}`, velocity: 0.8, ...fields }
}

/** A 4-bar placeholder song so there is something to look at. */
export function createDemoSong(): Song {
  const ppq = DEFAULT_PPQ
  const beat = ppq
  const bar = ppq * 4
  const notes: Note[] = []

  // Chords: C – Am – F – G, one per bar.
  const chords = [
    [48, 55, 64],
    [45, 52, 60],
    [41, 48, 57],
    [43, 50, 59],
  ]
  chords.forEach((chord, i) => {
    for (const pitch of chord) {
      notes.push(createNote({ pitch, start: i * bar, duration: bar, velocity: 0.6 }))
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
    notes.push(createNote({ pitch, start, duration }))
  }

  return { bpm: 120, ppq, beatsPerBar: 4, bars: 4, notes, synth: DEFAULT_SYNTH }
}
