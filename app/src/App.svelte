<script lang="ts">
  import PianoRoll from './lib/pianoroll/PianoRoll.svelte'
  import Window from './lib/ui/Window.svelte'
  import type { AudioBackend } from './lib/audio/backend'
  import { AudioPlayer } from './lib/audio/player'
  import Playlist from './lib/playlist/Playlist.svelte'
  import InstrumentPanel from './lib/instruments/InstrumentPanel.svelte'
  import type { Instrument } from './lib/instruments/definitions'
  import {
    createDemoSong,
    createPattern,
    createTrack,
    findPattern,
    formatPosition,
    ticksPerBar,
    type Pattern,
    type Song,
  } from './lib/song/song'
  import { addPattern, addTrack, replacePattern, setBars } from './lib/song/edits'
  import { PIANO_ROLL_ZOOM, PLAYLIST_ZOOM, type ZoomRange } from './lib/ui/zoom'
  import { Transport } from './lib/song/transport'
  import { History } from './lib/song/history'
  import type { Viewport } from './lib/song/coords'
  import { parseSong, serializeSong, SongFileError, SONG_FILE_EXTENSION } from './lib/song/songFile'

  let { backend }: { backend: AudioBackend } = $props()

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
  const transport = new Transport(() => song, () => backend.now())

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

  let fileInput: HTMLInputElement
  let fileError = $state('')

  function saveSong() {
    const blob = new Blob([serializeSong(song)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `song${SONG_FILE_EXTENSION}`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function openSong(file: File) {
    try {
      const loaded = parseSong(await file.text())
      // The old position may be past the end of the new song.
      transport.stop()
      edit(loaded)
      fileError = ''
    } catch (err) {
      fileError = err instanceof SongFileError ? err.message : 'Could not read that file.'
    }
  }

  function onFileChosen(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    // Clear it so choosing the same file again still fires a change.
    input.value = ''
    if (file) openSong(file)
  }

  let playing = $state(transport.isPlaying)
  let loop = $state(transport.loop)
  let follow = $state(true)
  // Each view has its own horizontal zoom, in pixels per tick.
  let pianoRollZoom = $state(0.6)
  let playlistZoom = $state(0.1)
  let volume = $state(0.8)
  let positionText = $state('1:1:00')

  const viewport: Viewport = $derived({ pxPerTick: pianoRollZoom, rowHeight: 16 })

  // The two windows. Their positions and sizes live here rather than in the
  // windows, so they survive closing and reopening them. The playlist starts
  // across the top and the piano roll below it, so both can be seen at once.
  let playlistOpen = $state(true)
  const playlistRect = $state({ x: 8, y: 8, width: 1000, height: 280 })
  let pianoRollOpen = $state(true)
  const pianoRollRect = $state({ x: 40, y: 300, width: 900, height: 380 })
  let instrumentOpen = $state(false)
  const instrumentRect = $state({ x: 560, y: 320, width: 420, height: 200 })

  // The selected pattern: the one the piano roll edits and that clicking in a
  // track places. Opening a file or undoing past it can leave this pointing at
  // a pattern that no longer exists, so fall back to the first one.
  let openPatternId = $state(history.current.patterns[0]?.id ?? '')
  const openPattern = $derived(findPattern(song, openPatternId) ?? song.patterns[0])

  function editPattern(next: Pattern) {
    edit(replacePattern(song, next))
  }

  // Instrument and volume changes. While a knob or slider is moving, the song
  // is swapped in directly so the sound follows, but not recorded in the undo
  // history; letting go records one step from the song as it was before.

  type PatternSound = Partial<Pick<Pattern, 'instrument' | 'volume'>>

  function withSound(base: Song, changes: PatternSound): Song {
    const pattern = openPattern && findPattern(base, openPattern.id)
    return pattern ? replacePattern(base, { ...pattern, ...changes }) : base
  }

  function previewSound(changes: PatternSound) {
    song = withSound(history.current, changes)
  }

  function changeSound(changes: PatternSound) {
    const current = openPattern && findPattern(history.current, openPattern.id)
    // Comparing as JSON compares the instrument's settings, not which object it is.
    const same = (key: keyof PatternSound) => JSON.stringify(current?.[key]) === JSON.stringify(changes[key])
    if (!current || (Object.keys(changes) as (keyof PatternSound)[]).every(same)) {
      syncHistory() // Nothing changed after all; drop any preview.
    } else {
      edit(withSound(history.current, changes))
    }
  }

  /** Opens a pattern in the piano roll, e.g. when its clip is double-clicked. */
  function openInPianoRoll(patternId: string) {
    openPatternId = patternId
    pianoRollOpen = true
  }

  function newTrack() {
    edit(addTrack(song, createTrack(`Track ${song.tracks.length + 1}`)))
  }

  /** Makes an empty pattern (4 bars, or the whole song if shorter), selects it and opens it. */
  function newPattern() {
    const pattern = createPattern(`Pattern ${song.patterns.length + 1}`, Math.min(4, song.bars) * ticksPerBar(song))
    edit(addPattern(song, pattern))
    openInPianoRoll(pattern.id)
  }

  function onBarsChange(e: Event & { currentTarget: HTMLInputElement }) {
    edit(setBars(song, Number(e.currentTarget.value)))
    // If the length was refused (too short for the clips), show the real one again.
    e.currentTarget.value = String(song.bars)
  }

  $effect(() => transport.subscribe(() => (playing = transport.isPlaying)))
  $effect(() => {
    transport.loop = loop
  })
  $effect(() => backend.setMasterGain(volume))
  $effect(() => {
    const player = new AudioPlayer(() => song, transport, backend)
    return () => player.dispose()
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

  function togglePlay() {
    // Browsers only allow audio to begin from a user gesture, and this is one.
    backend.start()
    transport.toggle()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return
    const mod = e.metaKey || e.ctrlKey
    if (e.code === 'Space') {
      e.preventDefault()
      togglePlay()
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      redo()
    } else if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      saveSong()
    } else if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault()
      fileInput.click()
    } else if (e.key === 'F5') {
      // F5 and F7 are FL's keys for these windows. F5 would otherwise reload the page.
      e.preventDefault()
      playlistOpen = !playlistOpen
    } else if (e.key === 'F7') {
      e.preventDefault()
      pianoRollOpen = !pianoRollOpen
    } else if (e.key === 'F8') {
      e.preventDefault()
      instrumentOpen = !instrumentOpen
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <header class="toolbar">
    <button class="file" onclick={() => fileInput.click()} title="Open a song file (Ctrl/Cmd+O)">Open</button>
    <button class="file" onclick={saveSong} title="Save the song to a file (Ctrl/Cmd+S)">Save</button>
    <input
      bind:this={fileInput}
      type="file"
      accept="{SONG_FILE_EXTENSION},.json,application/json"
      onchange={onFileChosen}
      hidden
      data-testid="song-file-input"
    />

    <button
      class="file"
      onclick={() => (playlistOpen = !playlistOpen)}
      aria-pressed={playlistOpen}
      title="Show or hide the playlist (F5)"
    >
      Playlist
    </button>
    <button
      class="file"
      onclick={() => (pianoRollOpen = !pianoRollOpen)}
      aria-pressed={pianoRollOpen}
      title="Show or hide the piano roll (F7)"
    >
      Piano roll
    </button>
    <button
      class="file"
      onclick={() => (instrumentOpen = !instrumentOpen)}
      aria-pressed={instrumentOpen}
      title="Show or hide the selected pattern's instrument (F8)"
    >
      Instrument
    </button>

    <button class="play" onclick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
      {playing ? '❚❚' : '▶'}
    </button>
    <button onclick={() => transport.stop()} aria-label="Stop">■</button>
    <output class="position">{positionText}</output>
    <span class="bpm">{song.bpm} BPM</span>
    <label title="Song length in bars">
      Bars
      <input class="bars" type="number" min="1" max="9999" value={song.bars} onchange={onBarsChange} />
    </label>

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
    <label>
      Volume
      <input type="range" min="0" max="1" step="0.01" bind:value={volume} />
    </label>
    {#if fileError}
      <span class="error" role="alert">
        {fileError}
        <button class="dismiss" onclick={() => (fileError = '')} aria-label="Dismiss">✕</button>
      </span>
    {/if}
  </header>

  <!-- A reusable piece of markup, like a small template. Both windows use it for their zoom slider. -->
  {#snippet zoomSlider(label: string, range: ZoomRange, value: number, set: (z: number) => void)}
    <label title="{label} (or Ctrl+mouse wheel)">
      Zoom
      <input
        type="range"
        aria-label={label}
        min={range.min}
        max={range.max}
        step="0.005"
        {value}
        oninput={(e) => set(Number(e.currentTarget.value))}
      />
    </label>
  {/snippet}

  <!-- The workspace: the area under the toolbar where windows float. -->
  <main class="workspace">
    {#if playlistOpen}
      <Window
        title="Playlist"
        bind:x={playlistRect.x}
        bind:y={playlistRect.y}
        bind:width={playlistRect.width}
        bind:height={playlistRect.height}
        minWidth={360}
        minHeight={160}
        onClose={() => (playlistOpen = false)}
      >
        <!-- A snippet named like a prop is passed as that prop: here, Window's `actions`. -->
        {#snippet actions()}
          {@render zoomSlider('Playlist zoom', PLAYLIST_ZOOM, playlistZoom, (z) => (playlistZoom = z))}
        {/snippet}
        <Playlist
          {song}
          {transport}
          pxPerTick={playlistZoom}
          {snap}
          {follow}
          selectedPatternId={openPattern?.id}
          onEdit={edit}
          onSelectPattern={(id) => (openPatternId = id)}
          onOpenPattern={openInPianoRoll}
          onNewPattern={newPattern}
          onAddTrack={newTrack}
          onZoom={(z) => (playlistZoom = z)}
        />
      </Window>
    {/if}

    {#if pianoRollOpen}
      <Window
        title={openPattern ? `Piano roll – ${openPattern.name}` : 'Piano roll'}
        bind:x={pianoRollRect.x}
        bind:y={pianoRollRect.y}
        bind:width={pianoRollRect.width}
        bind:height={pianoRollRect.height}
        minWidth={320}
        minHeight={180}
        onClose={() => (pianoRollOpen = false)}
      >
        {#snippet actions()}
          {@render zoomSlider('Piano roll zoom', PIANO_ROLL_ZOOM, pianoRollZoom, (z) => (pianoRollZoom = z))}
        {/snippet}
        {#if openPattern}
          <PianoRoll
            {song}
            pattern={openPattern}
            {transport}
            {viewport}
            {snap}
            {follow}
            onEdit={editPattern}
            onZoom={(z) => (pianoRollZoom = z)}
          />
        {:else}
          <p class="empty">This song has no patterns.</p>
        {/if}
      </Window>
    {/if}

    {#if instrumentOpen}
      <Window
        title={openPattern ? `Instrument – ${openPattern.name}` : 'Instrument'}
        bind:x={instrumentRect.x}
        bind:y={instrumentRect.y}
        bind:width={instrumentRect.width}
        bind:height={instrumentRect.height}
        minWidth={280}
        minHeight={140}
        onClose={() => (instrumentOpen = false)}
      >
        {#if openPattern}
          <InstrumentPanel
            instrument={openPattern.instrument}
            volume={openPattern.volume}
            onInput={(instrument) => previewSound({ instrument })}
            onChange={(instrument) => changeSound({ instrument })}
            onVolumeInput={(volume) => previewSound({ volume })}
            onVolumeChange={(volume) => changeSound({ volume })}
          />
        {:else}
          <p class="empty">This song has no patterns.</p>
        {/if}
      </Window>
    {/if}
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

  .file {
    width: auto;
    padding: 0 10px;
  }

  .error {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #ff7a7a;
  }

  .dismiss {
    width: 22px;
    height: 22px;
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

  .file[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--accent);
  }

  .bars {
    width: 52px;
    background: var(--button);
    color: var(--text);
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    padding: 3px 4px;
  }

  .empty {
    margin: 0;
    padding: 16px;
    color: var(--text-dim);
  }

  /* position: relative makes this the box windows are positioned in. */
  .workspace {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
