import { fireEvent, render, waitFor } from '@testing-library/svelte'
import { tick } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.svelte'
import { RecordingBackend } from './lib/audio/recordingBackend'
import { serializeSong } from './lib/song/songFile'
import { createDemoSong, songFromNotes } from './lib/song/song'

const key = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent('keydown', init))

function setup() {
  const { container, getByLabelText, getByTestId, getByText, queryByRole } = render(App, {
    backend: new RecordingBackend(),
  })
  const grid = container.querySelector('.grid')!
  const notes = () => container.querySelectorAll('.note').length
  // Top row of the grid, where the demo song has no notes.
  const addNote = async () => {
    for (const type of ['pointerdown', 'pointerup']) {
      grid.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 5 }))
    }
    await tick()
  }
  const openFile = async (text: string) => {
    const input = getByTestId('song-file-input') as HTMLInputElement
    await fireEvent.change(input, { target: { files: [new File([text], 'song.litedaw.json')] } })
  }
  const title = () => container.querySelector('section[aria-label^="Piano roll"]')?.getAttribute('aria-label')
  return { container, getByLabelText, getByText, notes, addNote, openFile, queryByRole, title }
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

describe('track list and piano roll', () => {
  it("opens a clip's pattern in the piano roll on double-click", async () => {
    const { container, title } = setup()
    expect(title()).toBe('Piano roll – Chords')
    // The demo song's melody clip is on the second track (56px rows), from tick 0.
    container.querySelector('.lanes')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 10, clientY: 76 }))
    await tick()
    expect(title()).toBe('Piano roll – Melody')
  })

  it('makes a new empty pattern and opens it', async () => {
    const { getByText, notes, title } = setup()
    getByText('+ Pattern').click()
    await tick()
    expect(title()).toBe('Piano roll – Pattern 3')
    expect(notes()).toBe(0)
  })

  it('deletes a selected note only while working in the piano roll', async () => {
    const { container, notes, addNote } = setup()
    const start = notes()
    await addNote() // Adds and selects a note.
    container.querySelector('.lanes')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 1 }))
    key({ key: 'Delete' })
    await tick()
    expect(notes()).toBe(start + 1)
  })
})

describe('instrument window', () => {
  async function openInstrument() {
    const result = setup()
    result.getByText('Instrument', { selector: 'button' }).click()
    await tick()
    const panel = result.container.querySelector('section[aria-label^="Instrument"]')!
    return { ...result, panel }
  }

  it("shows the selected pattern's instrument", async () => {
    const { panel } = await openInstrument()
    expect(panel.getAttribute('aria-label')).toBe('Instrument – Chords')
    expect(panel.querySelector('select')!.value).toBe('basic')
  })

  it('swaps the synth, and undo swaps it back', async () => {
    const { panel, getByLabelText } = await openInstrument()
    await fireEvent.change(panel.querySelector('select')!, { target: { value: 'fm' } })
    expect(panel.querySelector('select')!.value).toBe('fm')
    expect(getByLabelText('Ratio')).toBeTruthy()
    ;(getByLabelText('Undo') as HTMLButtonElement).click()
    await tick()
    expect(panel.querySelector('select')!.value).toBe('basic')
  })

  it('records a whole volume slide as one undo step, and keeps the volume when swapping synths', async () => {
    const { panel, getByLabelText } = await openInstrument()
    const slider = panel.querySelector<HTMLInputElement>('.volume input')!
    for (const value of ['0.9', '0.7', '0.5']) await fireEvent.input(slider, { target: { value } })
    expect(getByLabelText('Undo')).toHaveProperty('disabled', true)
    await fireEvent.change(slider, { target: { value: '0.5' } })
    expect(getByLabelText('Undo')).toHaveProperty('disabled', false)

    await fireEvent.change(panel.querySelector('select')!, { target: { value: 'fm' } })
    expect(slider.value).toBe('0.5')

    const undo = getByLabelText('Undo') as HTMLButtonElement
    undo.click()
    undo.click()
    await tick()
    expect(slider.value).toBe('1')
    expect(undo.disabled).toBe(true)
  })

  it('records a whole knob turn as one undo step', async () => {
    const { getByLabelText } = await openInstrument()
    const release = getByLabelText('Release')
    const turn = (type: string, y: number) =>
      release.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientY: y }))
    turn('pointerdown', 200)
    turn('pointermove', 180)
    turn('pointermove', 150)
    await tick()
    expect(getByLabelText('Undo')).toHaveProperty('disabled', true)
    turn('pointerup', 150)
    await tick()
    const turned = release.getAttribute('aria-valuenow')
    expect(Number(turned)).toBeGreaterThan(0.05)
    ;(getByLabelText('Undo') as HTMLButtonElement).click()
    await tick()
    expect(release.getAttribute('aria-valuenow')).toBe('0.05')
    expect(getByLabelText('Undo')).toHaveProperty('disabled', true)
  })
})

describe('opening song files', () => {
  it('replaces the song, and undo brings the old one back', async () => {
    const { notes, openFile, getByLabelText } = setup()
    const start = notes()
    const song = createDemoSong()
    await openFile(serializeSong(songFromNotes(song, song.patterns[0].notes.slice(0, 2))))
    await waitFor(() => expect(notes()).toBe(2))
    ;(getByLabelText('Undo') as HTMLButtonElement).click()
    await tick()
    expect(notes()).toBe(start)
  })

  it('shows an error and keeps the song for a bad file', async () => {
    const { notes, openFile, queryByRole } = setup()
    const start = notes()
    await openFile('not a song')
    await waitFor(() => expect(queryByRole('alert')).toBeTruthy())
    expect(notes()).toBe(start)
  })
})
