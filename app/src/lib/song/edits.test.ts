import { describe, expect, it } from 'vitest'
import { addNote, clampNote, noteAt, removeNotes, replacePattern, updateNote } from './edits'
import { History } from './history'
import { createDemoSong, createNote, createPattern, type Pattern } from './song'

function emptyPattern(): Pattern {
  return createPattern('Test', 768)
}

describe('edits', () => {
  it('adds a note without changing the original pattern', () => {
    const pattern = emptyPattern()
    const next = addNote(pattern, createNote({ pitch: 60, start: 0, duration: 96 }))
    expect(next.notes).toHaveLength(1)
    expect(pattern.notes).toHaveLength(0)
  })

  it('clamps notes into the pattern and MIDI range', () => {
    const pattern = emptyPattern()
    const end = pattern.length
    const note = clampNote(createNote({ pitch: 200, start: end - 10, duration: 96 }), pattern)
    expect(note.pitch).toBe(127)
    expect(note.start + note.duration).toBe(end)
    expect(clampNote({ ...note, start: -50 }, pattern).start).toBe(0)
    expect(clampNote({ ...note, duration: 0 }, pattern).duration).toBe(1)
  })

  it('updates only the targeted note and keeps the others as-is', () => {
    const a = createNote({ pitch: 60, start: 0, duration: 96 })
    const b = createNote({ pitch: 64, start: 0, duration: 96 })
    const pattern = { ...emptyPattern(), notes: [a, b] }
    const next = updateNote(pattern, a.id, { pitch: 62, start: 48 })
    expect(next.notes[0]).toMatchObject({ id: a.id, pitch: 62, start: 48 })
    expect(next.notes[1]).toBe(b)
  })

  it('removes notes by id', () => {
    const a = createNote({ pitch: 60, start: 0, duration: 96 })
    const b = createNote({ pitch: 64, start: 0, duration: 96 })
    const next = removeNotes({ ...emptyPattern(), notes: [a, b] }, [a.id])
    expect(next.notes).toEqual([b])
  })

  it('returns the same pattern when an update changes nothing', () => {
    const a = createNote({ pitch: 60, start: 0, duration: 96 })
    const pattern = { ...emptyPattern(), notes: [a] }
    expect(updateNote(pattern, a.id, { start: 0, pitch: 60 })).toBe(pattern)
    expect(updateNote(pattern, 'missing', { start: 48 })).toBe(pattern)
  })

  it('returns the same pattern when removing notes that are not there', () => {
    const pattern = { ...emptyPattern(), notes: [createNote({ pitch: 60, start: 0, duration: 96 })] }
    expect(removeNotes(pattern, ['missing'])).toBe(pattern)
  })

  it('finds the topmost note at a tick and pitch, with an exclusive end', () => {
    const a = createNote({ pitch: 60, start: 0, duration: 96 })
    const b = createNote({ pitch: 60, start: 48, duration: 96 })
    const pattern = { ...emptyPattern(), notes: [a, b] }
    expect(noteAt(pattern, 10, 60)).toBe(a)
    expect(noteAt(pattern, 60, 60)).toBe(b)
    expect(noteAt(pattern, 144, 60)).toBeUndefined()
    expect(noteAt(pattern, 10, 61)).toBeUndefined()
  })
})

describe('replacePattern', () => {
  it('swaps in the edited pattern and leaves the others alone', () => {
    const song = createDemoSong()
    const [first, second] = song.patterns
    const edited = removeNotes(second, [second.notes[0].id])
    const next = replacePattern(song, edited)
    expect(next.patterns[0]).toBe(first)
    expect(next.patterns[1]).toBe(edited)
    expect(song.patterns[1]).toBe(second)
  })

  it('returns the same song for an unchanged or unknown pattern', () => {
    const song = createDemoSong()
    expect(replacePattern(song, song.patterns[0])).toBe(song)
    expect(replacePattern(song, emptyPattern())).toBe(song)
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
