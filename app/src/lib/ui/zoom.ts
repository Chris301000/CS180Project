// Horizontal zoom for the piano roll and track list: the ranges their sliders
// use, and Ctrl+wheel zooming (also what a trackpad pinch sends).

import { tick } from 'svelte'

export interface ZoomRange {
  min: number
  max: number
}

/** Pixels per tick. At 96 ticks per beat, 0.15 is about 14px a beat. */
export const PIANO_ROLL_ZOOM: ZoomRange = { min: 0.15, max: 2 }
/** Zoomed further out than the piano roll, since it shows a whole song: about 8px to 150px a bar. */
export const PLAYLIST_ZOOM: ZoomRange = { min: 0.02, max: 0.4 }

interface Options {
  /** Width of the sticky column on the left (piano keys, track names), which doesn't scroll. */
  gutter: number
  range: ZoomRange
  get: () => number
  set: (pxPerTick: number) => void
}

/**
 * Makes Ctrl+wheel over `scroller` zoom horizontally, keeping the spot under
 * the mouse still. Returns a function that removes the listener.
 *
 * It's added by hand rather than with `onwheel` in markup because Svelte makes
 * wheel listeners passive, and a passive listener can't stop the browser from
 * zooming the whole page.
 */
export function zoomOnCtrlWheel(scroller: HTMLElement, { gutter, range, get, set }: Options): () => void {
  const onWheel = async (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const old = get()
    const next = Math.min(range.max, Math.max(range.min, old * Math.exp(-e.deltaY * 0.002)))
    if (next === old) return
    // Where the mouse is, in grid pixels, before zooming.
    const mouse = e.clientX - scroller.getBoundingClientRect().left
    const gridX = scroller.scrollLeft + mouse - gutter
    set(next)
    // Wait for Svelte to redraw the grid at the new width, then scroll so the
    // same tick is under the mouse again.
    await tick()
    scroller.scrollLeft = (gridX * next) / old - mouse + gutter
  }
  scroller.addEventListener('wheel', onWheel, { passive: false })
  return () => scroller.removeEventListener('wheel', onWheel)
}
