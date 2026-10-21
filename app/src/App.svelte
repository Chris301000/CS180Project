<script lang="ts">
  import PianoRoll from './lib/pianoroll/PianoRoll.svelte'
  import { createDemoSong, formatPosition } from './lib/song/song'
  import { Transport } from './lib/song/transport'
  import type { Viewport } from './lib/song/coords'

  // The song is replaced as a whole on each edit (rather than mutated deeply),
  // so $state.raw avoids proxying every note object.
  let song = $state.raw(createDemoSong())
  const transport = new Transport(() => song)

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
    if (e.code !== 'Space' || e.target instanceof HTMLInputElement) return
    e.preventDefault()
    transport.toggle()
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

    <label><input type="checkbox" bind:checked={loop} /> Loop</label>
    <label><input type="checkbox" bind:checked={follow} /> Follow</label>
    <label class="zoom">
      Zoom
      <input type="range" min="0.15" max="2" step="0.05" bind:value={zoom} />
    </label>
  </header>

  <main class="roll">
    <PianoRoll {song} {transport} {viewport} {follow} />
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

  button:hover {
    background: var(--button-hover);
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
