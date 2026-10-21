import { describe, expect, it } from 'vitest'
import { addNote, clampNote, noteAt, removeNotes, updateNote } from './edits'
import { History } from './history'
import { createNote, songLengthTicks, type Song } from './song'

function emptySong(): Song {
  return { bpm: 120, ppq: 96, beatsPerBar: 4, bars: 2, notes: [] }
}

describe('edits', () => {
  it('adds a note without changing the original song', () => {
    const song = emptySong()
    const next = addNote(song, createNote({ pitch: 60, start: 0, duration: 96 }))
    expect(next.notes).toHaveLength(1)
    expect(song.notes).toHaveLength(0)
  })

  it('clamps notes into the song and MIDI range', () => {
    const song = emptySong()
    const end = songLengthTicks(song)
    const note = clampNote(createNote({ pitch: 200, start: end - 10, duration: 96 }), song)
    expect(note.pitch).toBe(127)
    expect(note.start + note.duration).toBe(end)
    expect(clampNote({ ...note, start: -50 }, song).start).toBe(0)
    expect(clampNote({ ...note, duration: 0 }, song).duration).toBe(1)
  })

  it('updates only the targeted note and keeps the others as-is', () => {
    const a = createNote({ pitch: 60, start: 0, duration: 96 })
    const b = createNote({ pitch: 64, start: 0, duration: 96 })
    const song = { ...emptySong(), notes: [a, b] }
    const next = updateNote(song, a.id, { pitch: 62, start: 48 })
    expect(next.notes[0]).toMatchObject({ id: a.id, pitch: 62, start: 48 })
    expect(next.notes[1]).toBe(b)
  })

  it('removes notes by id', () => {
    const a = createNote({ pitch: 60, start: 0, duration: 96 })
    const b = createNote({ pitch: 64, start: 0, duration: 96 })
    const next = removeNotes({ ...emptySong(), notes: [a, b] }, [a.id])
    expect(next.notes).toEqual([b])
  })

  it('finds the topmost note at a tick and pitch, with an exclusive end', () => {
    const a = createNote({ pitch: 60, start: 0, duration: 96 })
    const b = createNote({ pitch: 60, start: 48, duration: 96 })
    const song = { ...emptySong(), notes: [a, b] }
    expect(noteAt(song, 10, 60)).toBe(a)
    expect(noteAt(song, 60, 60)).toBe(b)
    expect(noteAt(song, 144, 60)).toBeUndefined()
    expect(noteAt(song, 10, 61)).toBeUndefined()
  })
})

describe('History', () => {
  it('undoes and redoes', () => {
    const history = new History('a')
    history.push('b')
    history.push('c')
    expect(history.undo()).toBe('b')
    expect(history.undo()).toBe('a')
    expect(history.canUndo).toBe(false)
    expect(history.undo()).toBe('a')
    expect(history.redo()).toBe('b')
  })

  it('drops the redo stack after a new edit', () => {
    const history = new History('a')
    history.push('b')
    history.undo()
    history.push('c')
    expect(history.canRedo).toBe(false)
    expect(history.current).toBe('c')
  })

  it('ignores pushing the current value and respects the limit', () => {
    const history = new History(0, 2)
    history.push(0)
    expect(history.canUndo).toBe(false)
    history.push(1)
    history.push(2)
    history.push(3)
    history.undo()
    history.undo()
    expect(history.canUndo).toBe(false)
    expect(history.current).toBe(1)
  })
})
