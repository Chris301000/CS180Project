import { fireEvent, render, waitFor, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
