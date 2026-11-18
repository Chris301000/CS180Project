import { describe, expect, it } from 'vitest'
import { KEEP_VISIBLE_PX, TITLE_BAR_HEIGHT, fitRect, moveRect, resizeRect } from './windowGeometry'

const bounds = { width: 1000, height: 600 }
const min = { width: 200, height: 100 }
const start = { x: 100, y: 100, width: 400, height: 300 }

describe('moveRect', () => {
  it('moves by the pointer distance', () => {
    expect(moveRect(start, 50, -20, bounds)).toEqual({ ...start, x: 150, y: 80 })
  })

  it('keeps part of the window on screen sideways', () => {
    expect(moveRect(start, -5000, 0, bounds).x).toBe(KEEP_VISIBLE_PX - start.width)
    expect(moveRect(start, 5000, 0, bounds).x).toBe(bounds.width - KEEP_VISIBLE_PX)
  })

  it('keeps the title bar inside the top and bottom', () => {
    expect(moveRect(start, 0, -5000, bounds).y).toBe(0)
    expect(moveRect(start, 0, 5000, bounds).y).toBe(bounds.height - TITLE_BAR_HEIGHT)
  })
})

describe('resizeRect', () => {
  it('grows from the bottom-right corner', () => {
    expect(resizeRect(start, { right: true, bottom: true }, 30, 40, bounds, min)).toEqual({
      ...start,
      width: 430,
      height: 340,
    })
  })

  it('keeps the right edge still when dragging the left edge', () => {
    const next = resizeRect(start, { left: true }, -50, 0, bounds, min)
    expect(next.x).toBe(50)
    expect(next.x + next.width).toBe(start.x + start.width)
  })

  it('keeps the bottom edge still when dragging the top edge', () => {
    const next = resizeRect(start, { top: true }, 0, 60, bounds, min)
    expect(next.y).toBe(160)
    expect(next.y + next.height).toBe(start.y + start.height)
  })

  it('never goes below the minimum size', () => {
    expect(resizeRect(start, { right: true, bottom: true }, -5000, -5000, bounds, min)).toMatchObject(min)
    const fromLeft = resizeRect(start, { left: true, top: true }, 5000, 5000, bounds, min)
    expect(fromLeft).toMatchObject(min)
    expect(fromLeft.x + fromLeft.width).toBe(start.x + start.width)
  })

  it('stops at the workspace edges', () => {
    const grown = resizeRect(start, { right: true, bottom: true }, 5000, 5000, bounds, min)
    expect(grown.x + grown.width).toBe(bounds.width)
    expect(grown.y + grown.height).toBe(bounds.height)
    expect(resizeRect(start, { left: true, top: true }, -5000, -5000, bounds, min)).toMatchObject({ x: 0, y: 0 })
  })
})

describe('fitRect', () => {
  it('leaves a window that fits alone', () => {
    expect(fitRect(start, bounds, min)).toEqual(start)
  })

  it('moves a window back inside', () => {
    expect(fitRect({ ...start, x: 900, y: 500 }, bounds, min)).toEqual({ ...start, x: 600, y: 300 })
  })

  it('shrinks a window bigger than the workspace, but not below the minimum', () => {
    expect(fitRect(start, { width: 300, height: 200 }, min)).toEqual({ x: 0, y: 0, width: 300, height: 200 })
    expect(fitRect(start, { width: 50, height: 50 }, min)).toMatchObject(min)
  })
})
