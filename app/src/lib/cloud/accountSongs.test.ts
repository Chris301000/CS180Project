import { fireEvent, render, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.svelte'
import { RecordingBackend } from '../audio/recordingBackend'
import { createDemoSong, type Song } from '../song/song'
import type { SongStore, SongSummary } from './songStore'

/** An in-memory stand-in for the Supabase `songs` table. */
function memoryStore(initial: { name: string; song: Song }[] = []) {
  const rows = new Map<string, { summary: SongSummary; song: Song }>()
  let next = 1
  const put = (song: Song, name: string, id = `song-${next++}`) => {
    const summary = { id, name, updatedAt: new Date(2026, 0, next).toISOString() }
    rows.set(id, { summary, song })
    return summary
  }
  for (const { name, song } of initial) put(song, name)

  const store: SongStore = {
    list: vi.fn(async () => [...rows.values()].map((r) => r.summary).reverse()),
    load: vi.fn(async (id: string) => rows.get(id) ?? Promise.reject(new Error('not found'))),
    save: vi.fn(async (song: Song, name: string, id?: string) => put(song, name, id)),
    remove: vi.fn(async (id: string) => void rows.delete(id)),
  }
  return { store, rows }
}

function setup(store: SongStore) {
  const view = render(App, {
    backend: new RecordingBackend(),
    account: { username: 'chris', onLogOut: vi.fn(), songs: store },
  })
  const status = () => view.container.querySelector('.save-status')?.textContent
  const changeBars = (bars: number) =>
    fireEvent.change(view.container.querySelector('input.bars')!, { target: { value: String(bars) } })
  return { ...view, status, changeBars }
}

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn()
})

// Put back window.confirm and window.prompt after tests that fake them.
afterEach(() => {
  vi.restoreAllMocks()
})

describe('saving to the account', () => {
  it('creates the song on the first save and overwrites it after that', async () => {
    const { store, rows } = memoryStore()
    const { getByRole, getByLabelText, status, changeBars } = setup(store)
    expect(status()).toBe('Not saved yet')

    await fireEvent.input(getByLabelText('Song name'), { target: { value: 'My beat' } })
    await fireEvent.click(getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(status()).toBe('Saved'))
    expect(store.save).toHaveBeenLastCalledWith(expect.anything(), 'My beat', undefined)

    await changeBars(12)
    expect(status()).toBe('Unsaved changes')

    await fireEvent.click(getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(status()).toBe('Saved'))
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ bars: 12 }), 'My beat', 'song-1')
    expect(rows.size).toBe(1)
  })

  it('saves with Ctrl/Cmd+S', async () => {
    const { store } = memoryStore()
    const { status } = setup(store)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }))
    await waitFor(() => expect(status()).toBe('Saved'))
    expect(store.save).toHaveBeenCalledOnce()
  })

  it('shows an error when saving fails', async () => {
    const { store } = memoryStore()
    vi.mocked(store.save).mockRejectedValue(new Error('network down'))
    const { getByRole, findByRole, status } = setup(store)
    await fireEvent.click(getByRole('button', { name: 'Save' }))
    expect((await findByRole('alert')).textContent).toMatch(/Couldn't save: network down/)
    expect(status()).toBe('Not saved yet')
  })
})

describe('My songs', () => {
  const slowSong = { ...createDemoSong(), bpm: 90 }

  it('lists saved songs and opens one into the editor', async () => {
    const { store } = memoryStore([{ name: 'Slow jam', song: slowSong }])
    const { getByRole, findByRole, getByLabelText, getByText, queryByRole, status } = setup(store)

    await fireEvent.click(getByRole('button', { name: 'My songs' }))
    const dialog = await findByRole('dialog', { name: 'My songs' })
    await fireEvent.click(await within(dialog).findByTitle('Open Slow jam'))

    await waitFor(() => expect(queryByRole('dialog')).toBeNull())
    expect(getByText('90 BPM')).toBeTruthy()
    expect((getByLabelText('Song name') as HTMLInputElement).value).toBe('Slow jam')
    expect(status()).toBe('Saved')
  })

  it('says so when there are no saved songs', async () => {
    const { store } = memoryStore()
    const { getByRole, findByText } = setup(store)
    await fireEvent.click(getByRole('button', { name: 'My songs' }))
    expect(await findByText(/No saved songs yet/)).toBeTruthy()
  })

  it('deletes a song after confirming', async () => {
    const { store, rows } = memoryStore([{ name: 'Old idea', song: slowSong }])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { getByRole, findByLabelText, findByText } = setup(store)
    await fireEvent.click(getByRole('button', { name: 'My songs' }))
    await fireEvent.click(await findByLabelText('Delete Old idea'))
    expect(await findByText(/No saved songs yet/)).toBeTruthy()
    expect(rows.size).toBe(0)
  })

  it('keeps the song when the delete is cancelled', async () => {
    const { store, rows } = memoryStore([{ name: 'Keeper', song: slowSong }])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { getByRole, findByLabelText } = setup(store)
    await fireEvent.click(getByRole('button', { name: 'My songs' }))
    await fireEvent.click(await findByLabelText('Delete Keeper'))
    expect(store.remove).not.toHaveBeenCalled()
    expect(rows.size).toBe(1)
  })
})

describe('several songs in one session', () => {
  const noteCount = (container: HTMLElement) => container.querySelectorAll('.note').length

  it('New starts a blank, unsaved song with nothing to undo', async () => {
    const { store } = memoryStore()
    const { container, getByRole, getByLabelText, status } = setup(store)
    expect(noteCount(container)).toBeGreaterThan(0)

    await fireEvent.click(getByRole('button', { name: 'New' }))

    expect(noteCount(container)).toBe(0)
    expect((getByLabelText('Song name') as HTMLInputElement).value).toBe('Untitled')
    expect(status()).toBe('Not saved yet')
    expect(getByLabelText('Undo')).toHaveProperty('disabled', true)
  })

  it('saving after New adds a second song instead of overwriting the first', async () => {
    const { store, rows } = memoryStore()
    const { getByRole, getByLabelText, status } = setup(store)
    await fireEvent.input(getByLabelText('Song name'), { target: { value: 'First' } })
    await fireEvent.click(getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(status()).toBe('Saved'))

    await fireEvent.click(getByRole('button', { name: 'New' }))
    await fireEvent.input(getByLabelText('Song name'), { target: { value: 'Second' } })
    await fireEvent.click(getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(status()).toBe('Saved'))

    expect([...rows.values()].map((r) => r.summary.name)).toEqual(['First', 'Second'])
  })

  it('asks before New throws away unsaved changes, and keeps them if cancelled', async () => {
    const { store } = memoryStore()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container, getByRole, changeBars } = setup(store)
    await changeBars(12)

    await fireEvent.click(getByRole('button', { name: 'New' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(noteCount(container)).toBeGreaterThan(0)

    confirm.mockReturnValue(true)
    await fireEvent.click(getByRole('button', { name: 'New' }))
    expect(noteCount(container)).toBe(0)
  })

  it("doesn't ask when there's nothing unsaved", async () => {
    const { store } = memoryStore()
    const confirm = vi.spyOn(window, 'confirm')
    const { getByRole } = setup(store)
    await fireEvent.click(getByRole('button', { name: 'New' }))
    await fireEvent.click(getByRole('button', { name: 'New' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('Save as new makes a separate copy and leaves the original alone', async () => {
    const { store, rows } = memoryStore()
    const { getByRole, getByLabelText, status, changeBars } = setup(store)
    await fireEvent.input(getByLabelText('Song name'), { target: { value: 'Original' } })
    await fireEvent.click(getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(status()).toBe('Saved'))

    await changeBars(12)
    vi.spyOn(window, 'prompt').mockReturnValue('Remix')
    await fireEvent.click(getByRole('button', { name: 'Save as new' }))
    await waitFor(() => expect((getByLabelText('Song name') as HTMLInputElement).value).toBe('Remix'))

    const saved = [...rows.values()]
    expect(saved.map((r) => [r.summary.name, r.song.bars])).toEqual([
      ['Original', 16],
      ['Remix', 12],
    ])
    // Later saves go to the copy.
    await changeBars(8)
    await fireEvent.click(getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(status()).toBe('Saved'))
    expect(rows.get('song-1')!.song.bars).toBe(16)
    expect(rows.get('song-2')!.song.bars).toBe(8)
  })

  it('does nothing when the Save as new name is cancelled', async () => {
    const { store } = memoryStore()
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    const { getByRole } = setup(store)
    await fireEvent.click(getByRole('button', { name: 'Save as new' }))
    expect(store.save).not.toHaveBeenCalled()
  })

  it("can't undo back into the previous song after opening another", async () => {
    const { store, rows } = memoryStore([{ name: 'Slow jam', song: { ...createDemoSong(), bpm: 90 } }])
    const { getByRole, getByLabelText, findByRole } = setup(store)
    await fireEvent.click(getByRole('button', { name: 'My songs' }))
    await fireEvent.click(await within(await findByRole('dialog')).findByTitle('Open Slow jam'))
    await waitFor(() => expect((getByLabelText('Song name') as HTMLInputElement).value).toBe('Slow jam'))

    // Undo is empty, so Save can't write the old song over this one.
    expect(getByLabelText('Undo')).toHaveProperty('disabled', true)
    await fireEvent.click(getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(store.save).toHaveBeenCalled())
    expect(rows.get('song-1')!.song.bpm).toBe(90)
  })
})
