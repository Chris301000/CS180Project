<script lang="ts">
  import { onMount } from 'svelte'
  import type { SongStore, SongSummary } from './songStore'

  let {
    store,
    currentId,
    onOpen,
    onImport,
    onClose,
  }: {
    store: SongStore
    /** The song open in the editor, highlighted in the list. */
    currentId: string | null
    onOpen: (id: string) => void
    /** Opens a song file from the computer instead. */
    onImport: () => void
    onClose: () => void
  } = $props()

  let songs = $state<SongSummary[] | null>(null)
  let error = $state('')

  async function refresh() {
    try {
      songs = await store.list()
      error = ''
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load your songs.'
    }
  }

  onMount(refresh)

  async function remove(song: SongSummary) {
    if (!confirm(`Delete "${song.name}"? This can't be undone.`)) return
    try {
      await store.remove(song.id)
      await refresh()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not delete that song.'
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Clicking the dimmed background closes the dialog; Escape does too. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="My songs">
    <header>
      <h2>My songs</h2>
      <button class="close" onclick={onClose} aria-label="Close">✕</button>
    </header>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if songs === null && !error}
      <p class="empty">Loading…</p>
    {:else if songs?.length === 0}
      <p class="empty">No saved songs yet. Use <strong>Save</strong> to keep the current song in your account.</p>
    {:else if songs}
      <ul>
        {#each songs as song (song.id)}
          <li class:current={song.id === currentId}>
            <button class="open" onclick={() => onOpen(song.id)} title="Open {song.name}">
              <span class="name">{song.name}</span>
              <span class="date">{formatDate(song.updatedAt)}</span>
            </button>
            <button class="delete" onclick={() => remove(song)} aria-label="Delete {song.name}">🗑</button>
          </li>
        {/each}
      </ul>
    {/if}

    <footer>
      <button class="import" onclick={onImport}>Open a file from this computer…</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: #0008;
  }

  .dialog {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(440px, calc(100vw - 32px));
    max-height: min(560px, calc(100vh - 32px));
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    box-shadow: 0 10px 40px #0008;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 16px;
  }

  button {
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--button);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }

  button:hover {
    background: var(--button-hover);
  }

  .close,
  .delete {
    width: 28px;
    height: 28px;
    flex: none;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  li {
    display: flex;
    gap: 4px;
  }

  .open {
    display: flex;
    flex: 1;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 10px;
    text-align: left;
  }

  .current .open {
    border-color: var(--accent);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date {
    flex: none;
    color: var(--text-dim);
  }

  .empty {
    margin: 8px 0;
    color: var(--text-dim);
  }

  .error {
    margin: 0;
    padding: 8px 10px;
    border-radius: 4px;
    color: #ff7a7a;
    background: #ff7a7a1a;
  }

  footer {
    padding-top: 6px;
    border-top: 1px solid var(--line-strong);
  }

  .import {
    padding: 6px 10px;
  }
</style>
