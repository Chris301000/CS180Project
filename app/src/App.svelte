<script lang="ts">
  import PianoRoll from './lib/pianoroll/PianoRoll.svelte'
  import { createDemoSong, formatPosition, type Song } from './lib/song/song'
  import { Transport } from './lib/song/transport'
  import { History } from './lib/song/history'
  import type { Viewport } from './lib/song/coords'

  const SNAP_OPTIONS = [
    { label: 'Beat', beats: 1 },
    { label: '1/2 beat', beats: 1 / 2 },
    { label: '1/3 beat', beats: 1 / 3 },
    { label: '1/4 beat', beats: 1 / 4 },
    { label: '1/6 beat', beats: 1 / 6 },
    { label: 'None', beats: 0 },
  ]

  const history = new History(createDemoSong())

  // The song is replaced as a whole on each edit (rather than mutated deeply),
  // so $state.raw avoids proxying every note object.
  let song = $state.raw(history.current)
  let canUndo = $state(false)
  let canRedo = $state(false)
  const transport = new Transport(() => song)

  let snapBeats = $state(1 / 4)
  const snap = $derived(Math.round(song.ppq * snapBeats))

  function syncHistory() {
    song = history.current
    canUndo = history.canUndo
    canRedo = history.canRedo
  }

  function edit(next: Song) {
    history.push(next)
    syncHistory()
  }

  function undo() {
    history.undo()
    syncHistory()
  }

  function redo() {
    history.redo()
    syncHistory()
  }

  let playing = $state(transport.isPlaying)
  let loop = $state(transport.loop)
  let follow = $state(true)
  let zoom = $state(0.6)
  let positionText = $state('1:1:00')

  const viewport: Viewport = $derived({ pxPerTick: zoom, rowHeight: 16 })

  $effect(() => transport.subscribe(() => (playing = transport.isPlaying)))
  $effect(() => {
    transport.loop = loop
  })

  $effect(() => {
    let raf = 0
    const frame = () => {
      positionText = formatPosition(transport.position(), song)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  })

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return
    const mod = e.metaKey || e.ctrlKey
    if (e.code === 'Space') {
      e.preventDefault()
      transport.toggle()
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      redo()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <header class="toolbar">
    <button class="play" onclick={() => transport.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
      {playing ? '❚❚' : '▶'}
    </button>
    <button onclick={() => transport.stop()} aria-label="Stop">■</button>
    <output class="position">{positionText}</output>
    <span class="bpm">{song.bpm} BPM</span>

    <button onclick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">↶</button>
    <button onclick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">↷</button>
    <label>
      Snap
      <select bind:value={snapBeats}>
        {#each SNAP_OPTIONS as option (option.label)}
          <option value={option.beats}>{option.label}</option>
        {/each}
      </select>
    </label>

    <label><input type="checkbox" bind:checked={loop} /> Loop</label>
    <label><input type="checkbox" bind:checked={follow} /> Follow</label>
    <label class="zoom">
      Zoom
      <input type="range" min="0.15" max="2" step="0.05" bind:value={zoom} />
    </label>
  </header>

  <main class="roll">
    <PianoRoll {song} {transport} {viewport} {snap} {follow} onEdit={edit} />
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--panel);
    border-bottom: 1px solid var(--line-strong);
    flex-wrap: wrap;
  }

  button {
    width: 32px;
    height: 28px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--button);
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
  }

  button:hover:not(:disabled) {
    background: var(--button-hover);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  select {
    background: var(--button);
    color: var(--text);
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    padding: 3px 4px;
  }

  .play {
    color: var(--accent);
  }

  .position {
    min-width: 72px;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--roll-bg);
    font-family: var(--mono);
    color: var(--accent);
    text-align: center;
  }

  .bpm {
    color: var(--text-dim);
    font-family: var(--mono);
  }

  label {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-dim);
  }

  .roll {
    flex: 1;
    min-height: 0;
  }
</style>
