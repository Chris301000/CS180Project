import { fireEvent, render } from '@testing-library/svelte'
import { createRawSnippet, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Window from './Window.svelte'

// jsdom has no layout, so give every element a fixed size; the window only
// reads it from its parent (the workspace).
const WORKSPACE = { width: 1000, height: 600 }

const content = createRawSnippet(() => ({ render: () => '<p class="content">Hello</p>' }))

function setup(props: Record<string, unknown> = {}) {
  const { container, getByLabelText, queryByLabelText } = render(Window, {
    title: 'Test window',
    x: 100,
    y: 100,
    width: 400,
    height: 300,
    minWidth: 200,
    minHeight: 100,
    children: content,
    ...props,
  })
  const win = container.querySelector<HTMLElement>('.window')!
  const pointer = (el: Element, type: string, x: number, y: number) =>
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }))
  const drag = async (el: Element, from: [number, number], to: [number, number]) => {
    pointer(el, 'pointerdown', ...from)
    pointer(el, 'pointermove', ...to)
    pointer(el, 'pointerup', ...to)
    await tick()
  }
  const rect = () => ({
    x: parseFloat(win.style.left),
    y: parseFloat(win.style.top),
    width: parseFloat(win.style.width),
    height: parseFloat(win.style.height),
  })
  const handle = (name: string) => container.querySelector(`[data-handle="${name}"]`)!
  return { container, win, drag, rect, handle, getByLabelText, queryByLabelText }
}

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WORKSPACE.width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(WORKSPACE.height)
})

afterEach(() => vi.restoreAllMocks())

describe('Window', () => {
  it('shows its title and content', () => {
    const { container, getByLabelText } = setup()
    expect(getByLabelText('Test window')).toBeTruthy()
    expect(container.querySelector('.content')?.textContent).toBe('Hello')
  })

  it('moves when the title bar is dragged', async () => {
    const { win, drag, rect } = setup()
    await drag(win.querySelector('.titlebar')!, [150, 110], [250, 160])
    expect(rect()).toEqual({ x: 200, y: 150, width: 400, height: 300 })
  })

  it('keeps the title bar inside the workspace', async () => {
    const { win, drag, rect } = setup()
    await drag(win.querySelector('.titlebar')!, [150, 110], [150, -500])
    expect(rect().y).toBe(0)
  })

  it('resizes from the corner, down to the minimum size', async () => {
    const { drag, rect, handle } = setup()
    await drag(handle('se'), [500, 400], [550, 450])
    expect(rect()).toEqual({ x: 100, y: 100, width: 450, height: 350 })

    await drag(handle('se'), [550, 450], [0, 0])
    expect(rect()).toMatchObject({ width: 200, height: 100 })
  })

  it('ignores pointer moves after the drag ends', async () => {
    const { win, drag, rect } = setup()
    const titlebar = win.querySelector('.titlebar')!
    await drag(titlebar, [150, 110], [160, 110])
    titlebar.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 400, clientY: 400 }))
    await tick()
    expect(rect().x).toBe(110)
  })

  it('maximizes and restores, keeping the old size', async () => {
    const { win, getByLabelText, handle, container } = setup()
    await fireEvent.click(getByLabelText('Maximize'))
    expect(win.style.width).toBe('100%')
    expect(win.classList.contains('maximized')).toBe(true)
    expect(container.querySelector('[data-handle]')).toBeNull()

    await fireEvent.click(getByLabelText('Restore'))
    expect(win.style.width).toBe('400px')
    expect(handle('se')).toBeTruthy()
  })

  it('only has a close button when onClose is given', async () => {
    expect(setup().queryByLabelText('Close')).toBeNull()

    const onClose = vi.fn()
    const { getByLabelText } = setup({ onClose })
    await fireEvent.click(getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('comes to the front when clicked', async () => {
    const a = setup()
    const b = setup()
    expect(Number(b.win.style.zIndex)).toBeGreaterThan(Number(a.win.style.zIndex))

    a.win.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await tick()
    expect(Number(a.win.style.zIndex)).toBeGreaterThan(Number(b.win.style.zIndex))
  })
})
