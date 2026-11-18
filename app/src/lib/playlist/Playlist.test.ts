import { render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Playlist from './Playlist.svelte'
import { createClip, createPattern, createTrack, type Song } from '../song/song'
import { Transport } from '../song/transport'

// jsdom has no layout, so the lanes sit at (0, 0) and clientX/Y are lane
// coordinates. At 1px per tick, x equals ticks. Tracks are 56px tall.
const SNAP = 96
const rowY = (row: number) => row * 56 + 20

type PointerOptions = { button?: number; altKey?: boolean }

function pointer(el: Element, type: string, x: number, y: number, options: PointerOptions = {}) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, ...options }))
}

// A 4-bar song (1536 ticks) with two tracks and a 1-bar pattern (384 ticks),
// placed once on the first track at bar 2: ticks 384–768.
function setup(props: { selectedPatternId?: string | null } = {}) {
  const pattern = createPattern('Riff', 384)
  const tracks = [createTrack('Lead'), createTrack('Bass')]
  const clip = createClip(pattern, tracks[0], 384)
  const song: Song = { bpm: 120, ppq: 96, beatsPerBar: 4, bars: 4, tracks, patterns: [pattern], clips: [clip] }
  const onEdit = vi.fn<(next: Song) => void>()
  const onOpenPattern = vi.fn<(id: string) => void>()
  const onSelectPattern = vi.fn<(id: string) => void>()
  const onNewPattern = vi.fn()
  const onAddTrack = vi.fn()
  const { container, getByText } = render(Playlist, {
    song,
    transport: new Transport(() => song, () => 0),
    pxPerTick: 1,
    snap: SNAP,
    selectedPatternId: props.selectedPatternId === null ? undefined : pattern.id,
    onEdit,
    onSelectPattern,
    onOpenPattern,
    onNewPattern,
    onAddTrack,
  })
  const lanes = container.querySelector('.lanes')!
  const drag = (from: [number, number], to: [number, number], options?: PointerOptions) => {
    pointer(lanes, 'pointerdown', ...from, options)
    pointer(lanes, 'pointermove', ...to, options)
    pointer(lanes, 'pointerup', ...to, options)
  }
  const click = (x: number, y: number, options?: PointerOptions) => {
    pointer(lanes, 'pointerdown', x, y, options)
    pointer(lanes, 'pointerup', x, y, options)
  }
  const lastSong = () => onEdit.mock.lastCall![0]
  const patternButton = () => getByText('Riff', { selector: '.pattern' })
  return {
    song,
    pattern,
    tracks,
    clip,
    lanes,
    container,
    getByText,
    onEdit,
    onSelectPattern,
    onOpenPattern,
    onNewPattern,
    onAddTrack,
    drag,
    click,
    lastSong,
    patternButton,
  }
}

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
})

describe('placing clips', () => {
  it('places the selected pattern on the clicked track, snapped down to the grid', () => {
    const { click, onEdit, lastSong, pattern, tracks } = setup()
    click(150, rowY(1))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(lastSong().clips[1]).toMatchObject({ patternId: pattern.id, trackId: tracks[1].id, start: 96, length: 384 })
  })

  it('lets the same drag move the new clip, as one edit', () => {
    const { drag, onEdit, lastSong } = setup()
    drag([0, rowY(1)], [200, rowY(1)])
    expect(onEdit).toHaveBeenCalledOnce()
    expect(lastSong().clips[1].start).toBe(192)
  })

  it('does nothing on empty space when no pattern is selected', () => {
    const { click, onEdit } = setup({ selectedPatternId: null })
    click(150, rowY(1))
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('moving clips', () => {
  it('moves in time by snapped steps and onto another track', () => {
    const { drag, lastSong, tracks } = setup()
    drag([500, rowY(0)], [600, rowY(1)])
    expect(lastSong().clips[0]).toMatchObject({ start: 480, trackId: tracks[1].id, offset: 0, length: 384 })
  })

  it('makes no edit when a clip is clicked without moving', () => {
    const { click, onEdit } = setup()
    click(500, rowY(0))
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('draws a preview during a drag without committing it', async () => {
    const { lanes, container, onEdit } = setup()
    pointer(lanes, 'pointerdown', 500, rowY(0))
    pointer(lanes, 'pointermove', 692, rowY(0))
    await tick()
    expect(container.querySelector<HTMLElement>('.clip')!.style.left).toBe('576px')
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('trimming clips', () => {
  it('trims the left edge to the grid, keeping the right edge', () => {
    const { drag, lastSong } = setup()
    drag([386, rowY(0)], [480, rowY(0)])
    expect(lastSong().clips[0]).toMatchObject({ start: 480, offset: 96, length: 288 })
  })

  it('trims the right edge to the grid', () => {
    const { drag, lastSong } = setup()
    drag([766, rowY(0)], [670, rowY(0)])
    expect(lastSong().clips[0]).toMatchObject({ start: 384, offset: 0, length: 288 })
  })
})

describe('deleting clips', () => {
  it('deletes on right-click', () => {
    const { click, lastSong } = setup()
    click(500, rowY(0), { button: 2 })
    expect(lastSong().clips).toEqual([])
  })

  it('deletes the selected clip with Delete', () => {
    const { click, lastSong } = setup()
    click(500, rowY(0))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(lastSong().clips).toEqual([])
  })

  it('ignores Delete once something outside the track list was clicked', () => {
    const { click, onEdit } = setup()
    click(500, rowY(0))
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('other actions', () => {
  it("opens a clip's pattern on double-click", () => {
    const { lanes, onOpenPattern, pattern } = setup()
    pointer(lanes, 'dblclick', 500, rowY(0))
    expect(onOpenPattern).toHaveBeenCalledWith(pattern.id)
  })

  it('shows track names and adds tracks with the button', () => {
    const { getByText, onAddTrack } = setup()
    expect(getByText('Lead')).toBeTruthy()
    expect(getByText('Bass')).toBeTruthy()
    getByText('+ Track').click()
    expect(onAddTrack).toHaveBeenCalledOnce()
  })
})

describe('pattern list', () => {
  // jsdom has no layout, so give every element the same big box at (0, 0).
  // The visible track area then starts below the ruler and right of the track names.
  function withLayout() {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, right: 5000, bottom: 5000, width: 5000, height: 5000, x: 0, y: 0, toJSON: () => ({}) },
    )
  }

  afterEach(() => vi.restoreAllMocks())

  it('lists the patterns and highlights the selected one', () => {
    const { patternButton } = setup()
    expect(patternButton().classList.contains('selected')).toBe(true)
  })

  it('selects a pattern on click and opens it on double-click', () => {
    const { patternButton, onSelectPattern, onOpenPattern, onEdit, pattern } = setup()
    pointer(patternButton(), 'pointerdown', 10, 10)
    pointer(patternButton(), 'pointerup', 10, 10)
    expect(onSelectPattern).toHaveBeenCalledWith(pattern.id)
    pointer(patternButton(), 'dblclick', 10, 10)
    expect(onOpenPattern).toHaveBeenCalledWith(pattern.id)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('places a pattern dragged onto a track, snapped, as one edit', () => {
    withLayout()
    const { patternButton, onEdit, lastSong, pattern, tracks } = setup()
    pointer(patternButton(), 'pointerdown', 10, 10)
    pointer(patternButton(), 'pointermove', 400, rowY(1))
    pointer(patternButton(), 'pointermove', 1000, rowY(1))
    pointer(patternButton(), 'pointerup', 1000, rowY(1))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(lastSong().clips[1]).toMatchObject({ patternId: pattern.id, trackId: tracks[1].id, start: 960, length: 384 })
  })

  it('shows the dragged clip while over a track, before it is dropped', async () => {
    withLayout()
    const { patternButton, container, onEdit } = setup()
    pointer(patternButton(), 'pointerdown', 10, 10)
    pointer(patternButton(), 'pointermove', 1000, rowY(1))
    await tick()
    expect(container.querySelectorAll('.clip')).toHaveLength(2)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('places nothing when dropped outside the tracks', () => {
    withLayout()
    const { patternButton, onEdit } = setup()
    pointer(patternButton(), 'pointerdown', 10, 10)
    // Over the track names, left of the tracks.
    pointer(patternButton(), 'pointermove', 50, rowY(1))
    pointer(patternButton(), 'pointerup', 50, rowY(1))
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('makes a new pattern with the button', () => {
    const { getByText, onNewPattern } = setup()
    getByText('+ Pattern').click()
    expect(onNewPattern).toHaveBeenCalledOnce()
  })
})
