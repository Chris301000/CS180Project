import { render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.svelte'

const key = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent('keydown', init))

function setup() {
  const { container, getByLabelText } = render(App)
  const grid = container.querySelector('.grid')!
  const notes = () => container.querySelectorAll('.note').length
  // Top row of the grid, where the demo song has no notes.
  const addNote = async () => {
    for (const type of ['pointerdown', 'pointerup']) {
      grid.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 5 }))
    }
    await tick()
  }
  return { getByLabelText, notes, addNote }
}

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn()
})

describe('undo and redo', () => {
  it('starts with both buttons disabled', () => {
    const { getByLabelText } = setup()
    expect(getByLabelText('Undo')).toHaveProperty('disabled', true)
    expect(getByLabelText('Redo')).toHaveProperty('disabled', true)
  })

  it('undoes and redoes with the keyboard', async () => {
    const { notes, addNote, getByLabelText } = setup()
    const start = notes()
    await addNote()
    expect(notes()).toBe(start + 1)

    key({ key: 'z', metaKey: true })
    await tick()
    expect(notes()).toBe(start)
    expect(getByLabelText('Redo')).toHaveProperty('disabled', false)

    key({ key: 'z', metaKey: true, shiftKey: true })
    await tick()
    expect(notes()).toBe(start + 1)
  })

  it('also accepts Ctrl+Z and Ctrl+Y', async () => {
    const { notes, addNote } = setup()
    const start = notes()
    await addNote()
    key({ key: 'z', ctrlKey: true })
    await tick()
    expect(notes()).toBe(start)
    key({ key: 'y', ctrlKey: true })
    await tick()
    expect(notes()).toBe(start + 1)
  })

  it('undoes with the toolbar button', async () => {
    const { notes, addNote, getByLabelText } = setup()
    const start = notes()
    await addNote()
    ;(getByLabelText('Undo') as HTMLButtonElement).click()
    await tick()
    expect(notes()).toBe(start)
  })
})

describe('transport controls', () => {
  it('toggles play and pause with the spacebar', async () => {
    const { getByLabelText } = setup()
    key({ code: 'Space' })
    await tick()
    expect(getByLabelText('Pause')).toBeTruthy()
    key({ code: 'Space' })
    await tick()
    expect(getByLabelText('Play')).toBeTruthy()
  })

  it('returns to Play when stopped', async () => {
    const { getByLabelText } = setup()
    ;(getByLabelText('Play') as HTMLButtonElement).click()
    await tick()
    ;(getByLabelText('Stop') as HTMLButtonElement).click()
    await tick()
    expect(getByLabelText('Play')).toBeTruthy()
  })
})
