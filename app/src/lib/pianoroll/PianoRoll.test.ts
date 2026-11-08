import { render } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PianoRoll from './PianoRoll.svelte'
import { createNote, songFromNotes, type Note, type Pattern } from '../song/song'
import { Transport } from '../song/transport'

// jsdom has no layout, so the grid sits at (0, 0) and clientX/Y are grid
// coordinates. At this viewport x equals ticks, and pitch 60's row is y = 670–680.
const viewport = { pxPerTick: 1, rowHeight: 10 }
const SNAP = 24
const rowY = (pitch: number) => (127 - pitch) * 10 + 5

type PointerOptions = { button?: number; altKey?: boolean }

function pointer(el: Element, type: string, x: number, y: number, options: PointerOptions = {}) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, ...options }))
}

function setup(notes: Note[] = []) {
  const song = songFromNotes({ bpm: 120, ppq: 96, beatsPerBar: 4, bars: 2 }, notes)
  const onEdit = vi.fn<(next: Pattern) => void>()
  const { container } = render(PianoRoll, {
    song,
    pattern: song.patterns[0],
    transport: new Transport(() => song, () => 0),
    viewport,
    snap: SNAP,
    onEdit,
  })
  const grid = container.querySelector('.grid')!
  const drag = (from: [number, number], to: [number, number], options?: PointerOptions) => {
    pointer(grid, 'pointerdown', ...from, options)
    pointer(grid, 'pointermove', ...to, options)
    pointer(grid, 'pointerup', ...to, options)
  }
  const click = (x: number, y: number, options?: PointerOptions) => {
    pointer(grid, 'pointerdown', x, y, options)
    pointer(grid, 'pointerup', x, y, options)
  }
  return { song, grid, onEdit, drag, click, container }
}

const lastPattern = (onEdit: ReturnType<typeof setup>['onEdit']) => onEdit.mock.lastCall![0]

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
})

describe('adding notes', () => {
  it('adds a note on the clicked row, snapped down to the grid', () => {
    const { click, onEdit } = setup()
    click(50, rowY(60))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(lastPattern(onEdit).notes).toHaveLength(1)
    expect(lastPattern(onEdit).notes[0]).toMatchObject({ pitch: 60, start: 48, duration: SNAP })
  })

  it('makes new notes the length of the last note clicked', () => {
    const note = createNote({ pitch: 60, start: 0, duration: 72 })
    const { click, onEdit } = setup([note])
    click(10, rowY(60))
    click(200, rowY(62))
    expect(lastPattern(onEdit).notes.at(-1)).toMatchObject({ pitch: 62, duration: 72 })
  })

  it('lets the same drag move a new note, as one edit', () => {
    const { drag, onEdit } = setup()
    drag([48, rowY(60)], [96, rowY(62)])
    expect(onEdit).toHaveBeenCalledOnce()
    expect(lastPattern(onEdit).notes[0]).toMatchObject({ pitch: 62, start: 96 })
  })
})

describe('moving notes', () => {
  it('moves in time and pitch by snapped steps', () => {
    const note = createNote({ pitch: 60, start: 96, duration: 96 })
    const { drag, onEdit } = setup([note])
    drag([120, rowY(60)], [150, rowY(64)])
    expect(lastPattern(onEdit).notes[0]).toMatchObject({ pitch: 64, start: 120, duration: 96 })
  })

  it('ignores snapping while Alt is held', () => {
    const note = createNote({ pitch: 60, start: 96, duration: 96 })
    const { drag, onEdit } = setup([note])
    drag([120, rowY(60)], [127, rowY(60)], { altKey: true })
    expect(lastPattern(onEdit).notes[0].start).toBe(103)
  })

  it('keeps a dragged note inside the pattern', () => {
    const note = createNote({ pitch: 60, start: 96, duration: 96 })
    const { drag, onEdit } = setup([note])
    drag([120, rowY(60)], [-500, rowY(60)])
    expect(lastPattern(onEdit).notes[0].start).toBe(0)
  })

  it('makes no edit when the mouse wobbles without moving a whole step', () => {
    const note = createNote({ pitch: 60, start: 96, duration: 96 })
    const { drag, onEdit } = setup([note])
    drag([120, rowY(60)], [122, rowY(60)])
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('makes no edit when a note is dragged back to where it started', () => {
    const note = createNote({ pitch: 60, start: 96, duration: 96 })
    const { grid, onEdit } = setup([note])
    pointer(grid, 'pointerdown', 120, rowY(60))
    pointer(grid, 'pointermove', 200, rowY(64))
    pointer(grid, 'pointermove', 120, rowY(60))
    pointer(grid, 'pointerup', 120, rowY(60))
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('resizing notes', () => {
  it('drags the right edge to a snapped length', () => {
    const note = createNote({ pitch: 60, start: 0, duration: 96 })
    const { drag, onEdit } = setup([note])
    drag([94, rowY(60)], [146, rowY(60)])
    expect(lastPattern(onEdit).notes[0]).toMatchObject({ start: 0, duration: 144 })
  })

  it('never shrinks below one snap step', () => {
    const note = createNote({ pitch: 60, start: 96, duration: 96 })
    const { drag, onEdit } = setup([note])
    drag([190, rowY(60)], [0, rowY(60)])
    expect(lastPattern(onEdit).notes[0].duration).toBe(SNAP)
  })

  it('stops at the end of the pattern', () => {
    const note = createNote({ pitch: 60, start: 700, duration: 48 })
    const { drag, onEdit } = setup([note])
    drag([746, rowY(60)], [5000, rowY(60)])
    expect(lastPattern(onEdit).notes[0].duration).toBe(768 - 700)
  })
})

describe('deleting notes', () => {
  it('deletes on right-click', () => {
    const note = createNote({ pitch: 60, start: 0, duration: 96 })
    const { click, onEdit } = setup([note])
    click(10, rowY(60), { button: 2 })
    expect(lastPattern(onEdit).notes).toEqual([])
  })

  it('deletes every note swept by a right-drag, as one edit', () => {
    const a = createNote({ pitch: 60, start: 0, duration: 48 })
    const b = createNote({ pitch: 60, start: 96, duration: 48 })
    const { drag, onEdit } = setup([a, b])
    drag([10, rowY(60)], [110, rowY(60)], { button: 2 })
    expect(onEdit).toHaveBeenCalledOnce()
    expect(lastPattern(onEdit).notes).toEqual([])
  })

  it('does nothing when right-clicking empty space', () => {
    const { click, onEdit } = setup()
    click(10, rowY(60), { button: 2 })
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('deletes the selected note with Backspace', () => {
    const note = createNote({ pitch: 60, start: 0, duration: 96 })
    const { click, onEdit } = setup([note])
    click(10, rowY(60))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    expect(lastPattern(onEdit).notes).toEqual([])
  })

  it('does nothing on Backspace after Escape clears the selection', () => {
    const note = createNote({ pitch: 60, start: 0, duration: 96 })
    const { click, onEdit } = setup([note])
    click(10, rowY(60))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }))
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('drawing', () => {
  it('draws a preview during a drag without committing it', async () => {
    const note = createNote({ pitch: 60, start: 96, duration: 96 })
    const { grid, onEdit, container } = setup([note])
    pointer(grid, 'pointerdown', 120, rowY(60))
    pointer(grid, 'pointermove', 216, rowY(60))
    await Promise.resolve()
    const drawn = container.querySelector<HTMLElement>('.note')!
    expect(drawn.style.left).toBe('192px')
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('throws away the preview if the drag is cancelled', async () => {
    const note = createNote({ pitch: 60, start: 96, duration: 96 })
    const { grid, onEdit, container } = setup([note])
    pointer(grid, 'pointerdown', 120, rowY(60))
    pointer(grid, 'pointermove', 216, rowY(60))
    pointer(grid, 'pointercancel', 216, rowY(60))
    await Promise.resolve()
    expect(container.querySelector<HTMLElement>('.note')!.style.left).toBe('96px')
    expect(onEdit).not.toHaveBeenCalled()
  })
})
