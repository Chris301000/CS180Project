// Pure math for floating windows: where a window ends up after a drag, a
// resize, or the workspace changing size. Kept out of the component so it can
// be tested without a browser layout.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** Which sides a resize handle moves. A corner handle moves two. */
export interface Edges {
  left?: boolean
  right?: boolean
  top?: boolean
  bottom?: boolean
}

export const TITLE_BAR_HEIGHT = 28
/** How much of a window must stay inside the workspace sideways, so it can always be grabbed again. */
export const KEEP_VISIBLE_PX = 80

/** Limits `value` to [lo, hi]. If the range is empty, `lo` wins. */
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

/**
 * Moves a window by (dx, dy). It may hang off the left or right side, but
 * enough stays visible to grab, and the title bar never leaves the top or bottom.
 */
export function moveRect(start: Rect, dx: number, dy: number, bounds: Size): Rect {
  return {
    ...start,
    x: clamp(start.x + dx, KEEP_VISIBLE_PX - start.width, bounds.width - KEEP_VISIBLE_PX),
    y: clamp(start.y + dy, 0, bounds.height - TITLE_BAR_HEIGHT),
  }
}

/**
 * Resizes a window by dragging the given edges by (dx, dy). The opposite edges
 * stay put, the window never gets smaller than `min`, and the dragged edges
 * stop at the workspace's sides.
 */
export function resizeRect(start: Rect, edges: Edges, dx: number, dy: number, bounds: Size, min: Size): Rect {
  let { x, y, width, height } = start
  const right = start.x + start.width
  const bottom = start.y + start.height

  if (edges.right) {
    // A window already past the edge (dragged there) doesn't jump back.
    const maxRight = Math.max(bounds.width, right)
    width = clamp(start.width + dx, min.width, maxRight - start.x)
  } else if (edges.left) {
    x = Math.min(right - min.width, Math.max(Math.min(0, start.x), start.x + dx))
    width = right - x
  }

  if (edges.bottom) {
    const maxBottom = Math.max(bounds.height, bottom)
    height = clamp(start.height + dy, min.height, maxBottom - start.y)
  } else if (edges.top) {
    y = Math.min(bottom - min.height, Math.max(0, start.y + dy))
    height = bottom - y
  }

  return { x, y, width, height }
}

/**
 * Pulls a window fully inside the workspace, shrinking it if it's too big
 * (but not below `min`). Used when the workspace itself changes size.
 */
export function fitRect(rect: Rect, bounds: Size, min: Size): Rect {
  const width = clamp(rect.width, min.width, bounds.width)
  const height = clamp(rect.height, min.height, bounds.height)
  return {
    width,
    height,
    x: clamp(rect.x, 0, bounds.width - width),
    y: clamp(rect.y, 0, bounds.height - height),
  }
}
