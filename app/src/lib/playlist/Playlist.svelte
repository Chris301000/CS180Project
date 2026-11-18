<script lang="ts">
  import { snapTick, tickToX, xToTick } from '../song/coords'
  import { addClip, clipAt, moveClip, removeClips, trimClipEnd, trimClipStart } from '../song/clips'
  import {
    createClip,
    findPattern,
    newId,
    songLengthTicks,
    ticksPerBar,
    type Clip,
    type Pattern,
    type Song,
  } from '../song/song'
  import type { Transport } from '../song/transport'
  import { PLAYLIST_ZOOM, zoomOnCtrlWheel } from '../ui/zoom'

  interface Props {
    song: Song
    transport: Transport
    /** Horizontal zoom. */
    pxPerTick: number
    /** Snap size in ticks; 0 turns snapping off. Holding Alt also turns it off. */
    snap: number
    /** Scroll horizontally to keep the playhead in view while playing. */
    follow?: boolean
    /**
     * The pattern highlighted in the pattern list, like FL's selected pattern.
     * Clicking empty space in a track places it.
     */
    selectedPatternId?: string
    /** Called once per finished edit (e.g. on mouse up, not on every move). */
    onEdit: (next: Song) => void
    /** Called when a pattern is clicked in the pattern list. */
    onSelectPattern: (patternId: string) => void
    /** Called when a pattern or clip is double-clicked, to open it in the piano roll. */
    onOpenPattern: (patternId: string) => void
    onNewPattern: () => void
    onAddTrack: () => void
    /** Called with a new horizontal zoom (pixels per tick) when Ctrl+wheel is used. */
    onZoom?: (pxPerTick: number) => void
  }

  let {
    song,
    transport,
    pxPerTick,
    snap,
    follow = true,
    selectedPatternId,
    onEdit,
    onSelectPattern,
    onOpenPattern,
    onNewPattern,
    onAddTrack,
    onZoom,
  }: Props = $props()

  const HEADER_WIDTH = 140
  const RULER_HEIGHT = 24
  const TRACK_HEIGHT = 56
  /** Smallest grid division drawn, in quarter notes. */
  const STEP_BEATS = 1 / 4
  /** How close to a clip's left or right end, in pixels, a drag trims instead of moving. */
  const EDGE_PX = 6

  type Drag =
    | { mode: 'move'; base: Song; clip: Clip; originTick: number }
    | { mode: 'trim-start' | 'trim-end'; base: Song; clip: Clip; originTick: number }
    | { mode: 'erase' }

  // Same idea as the piano roll: while dragging, `preview` holds the edited
  // song and is drawn instead of `song`; it's handed to onEdit on mouse up,
  // so one drag is one undo step.
  let drag: Drag | null = null
  let preview = $state.raw<Song | null>(null)
  const shown = $derived(preview ?? song)

  let selectedId = $state<string | null>(null)
  let cursor = $state('crosshair')
  /** Whether the last click was in here, so Delete only deletes clips when you're working in the track list. */
  let active = false

  let scroller: HTMLDivElement
  let ruler: HTMLDivElement
  let lanes: HTMLDivElement
  let lanesPlayhead: HTMLDivElement
  let rulerPlayhead: HTMLDivElement

  const viewport = $derived({ pxPerTick, rowHeight: TRACK_HEIGHT })
  const gridWidth = $derived(tickToX(songLengthTicks(song), viewport))
  const gridHeight = $derived(Math.max(1, song.tracks.length) * TRACK_HEIGHT)
  const barPx = $derived(tickToX(ticksPerBar(song), viewport))
  const beatPx = $derived(tickToX(song.ppq, viewport))
  const stepPx = $derived(tickToX(song.ppq * STEP_BEATS, viewport))
  const barNumbers = $derived(Array.from({ length: song.bars }, (_, i) => i))
  /** Track id → row number, for placing clips. */
  const rowOf = $derived(new Map(shown.tracks.map((t, i) => [t.id, i])))

  // The playhead moves every frame, so it's positioned directly (see PianoRoll).
  $effect(() => {
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const x = tickToX(transport.position(), viewport)
      const transform = `translateX(${x}px)`
      lanesPlayhead.style.transform = transform
      rulerPlayhead.style.transform = transform
      if (follow && transport.isPlaying) keepInView(x)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  })

  function keepInView(x: number) {
    const visible = scroller.clientWidth - HEADER_WIDTH
    const left = scroller.scrollLeft
    if (x < left || x > left + visible) scroller.scrollLeft = x
  }

  // Clicking or dragging on the ruler moves the playhead.
  function seekFromPointer(e: PointerEvent) {
    const x = e.clientX - ruler.getBoundingClientRect().left
    transport.seek(xToTick(Math.max(0, x), viewport))
  }

  function onRulerDown(e: PointerEvent) {
    ruler.setPointerCapture(e.pointerId)
    seekFromPointer(e)
  }

  function onRulerMove(e: PointerEvent) {
    if (ruler.hasPointerCapture(e.pointerId)) seekFromPointer(e)
  }

  // Editing. As in the piano roll, hit-testing uses song coordinates, not DOM targets.

  function pointerInLanes(e: MouseEvent) {
    const rect = lanes.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const row = Math.max(0, Math.min(shown.tracks.length - 1, Math.floor(y / TRACK_HEIGHT)))
    return { x, tick: xToTick(x, viewport), track: shown.tracks[row] }
  }

  /** The clip under the pointer, and whether the pointer is on its left or right edge. */
  function hitTest(x: number, tick: number, trackId: string | undefined) {
    const clip = trackId === undefined ? undefined : clipAt(shown, tick, trackId)
    if (!clip) return null
    const startX = tickToX(clip.start, viewport)
    const endX = tickToX(clip.start + clip.length, viewport)
    // Short clips get smaller edges so they can still be moved.
    const edge = Math.min(EDGE_PX, (endX - startX) / 3)
    const side = x - startX <= edge ? 'start' : endX - x <= edge ? 'end' : null
    return { clip, side }
  }

  const snapFor = (e: PointerEvent) => (e.altKey ? 0 : snap)

  function onLanesDown(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 2) return
    lanes.setPointerCapture(e.pointerId)
    const { x, tick, track } = pointerInLanes(e)

    if (e.button === 2) {
      drag = { mode: 'erase' }
      eraseAt(x, tick, track?.id)
      return
    }

    const hit = hitTest(x, tick, track?.id)
    if (hit) {
      selectedId = hit.clip.id
      preview = song
      const mode = hit.side === 'start' ? 'trim-start' : hit.side === 'end' ? 'trim-end' : 'move'
      drag = { mode, base: song, clip: hit.clip, originTick: tick }
      return
    }

    // Empty space: place the selected pattern, then let the same drag move it.
    const pattern = selectedPatternId ? findPattern(song, selectedPatternId) : undefined
    if (!pattern || !track) return
    const start = snapTick(tick, snapFor(e))
    if (start >= songLengthTicks(song)) return
    const base = addClip(song, createClip(pattern, track, start))
    if (base === song) return
    const clip = base.clips[base.clips.length - 1]
    selectedId = clip.id
    preview = base
    drag = { mode: 'move', base, clip, originTick: tick }
  }

  function onLanesMove(e: PointerEvent) {
    const { x, tick, track } = pointerInLanes(e)

    if (!drag) {
      const hit = hitTest(x, tick, track?.id)
      cursor = hit ? (hit.side ? 'ew-resize' : 'grab') : 'crosshair'
      return
    }

    const step = snapFor(e)
    if (drag.mode === 'erase') {
      eraseAt(x, tick, track?.id)
    } else if (drag.mode === 'move') {
      // Snap the distance moved, not the position, so off-grid clips keep their offset.
      const dTick = snapTick(tick - drag.originTick, step, 'round')
      preview = moveClip(drag.base, drag.clip.id, drag.clip.start + dTick, track?.id)
    } else if (drag.mode === 'trim-start') {
      // Edges snap to the grid itself, so a trimmed clip lines up with the bars.
      const start = snapTick(drag.clip.start + tick - drag.originTick, step, 'round')
      preview = trimClipStart(drag.base, drag.clip.id, start)
    } else {
      const end = snapTick(drag.clip.start + drag.clip.length + tick - drag.originTick, step, 'round')
      preview = trimClipEnd(drag.base, drag.clip.id, end)
    }
  }

  function onLanesUp() {
    if (!drag) return
    if (preview && preview !== song) onEdit(preview)
    drag = null
    preview = null
  }

  function onLanesCancel() {
    drag = null
    preview = null
  }

  function eraseAt(x: number, tick: number, trackId: string | undefined) {
    const hit = hitTest(x, tick, trackId)
    if (!hit) return
    preview = removeClips(shown, [hit.clip.id])
    if (hit.clip.id === selectedId) selectedId = null
  }

  function onLanesDoubleClick(e: MouseEvent) {
    const { x, tick, track } = pointerInLanes(e)
    const hit = hitTest(x, tick, track?.id)
    if (hit) onOpenPattern(hit.clip.patternId)
  }

  // Dragging a pattern from the pattern list onto a track. Like a clip drag,
  // the dropped clip is shown as a preview while over a track and committed on
  // release. Pointer events rather than HTML drag and drop, so the clip can be
  // drawn snapped in place while dragging.

  /** How far, in pixels, the mouse must move before a press on a pattern counts as a drag. */
  const DRAG_THRESHOLD = 4

  // `clip` is made once when the drag starts and keeps its id, so the preview
  // is the same clip moving around rather than a new one each move.
  type PatternDrag = { clip: Clip; startX: number; startY: number; dragging: boolean }
  let patternDrag: PatternDrag | null = null
  let draggingPattern = $state(false)

  function onPatternDown(e: PointerEvent, pattern: Pattern) {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    onSelectPattern(pattern.id)
    // The track and start are filled in from wherever it's dropped.
    const clip: Clip = { id: newId('c'), patternId: pattern.id, trackId: '', start: 0, offset: 0, length: pattern.length }
    patternDrag = { clip, startX: e.clientX, startY: e.clientY, dragging: false }
  }

  function onPatternMove(e: PointerEvent) {
    if (!patternDrag) return
    if (!patternDrag.dragging) {
      const distance = Math.hypot(e.clientX - patternDrag.startX, e.clientY - patternDrag.startY)
      if (distance < DRAG_THRESHOLD) return
      patternDrag.dragging = draggingPattern = true
    }
    const spot = dropSpot(e)
    preview = spot ? addClip(song, { ...patternDrag.clip, trackId: spot.trackId, start: spot.start }) : null
  }

  function onPatternUp() {
    if (patternDrag && preview && preview !== song) {
      selectedId = patternDrag.clip.id
      onEdit(preview)
    }
    onPatternCancel()
  }

  function onPatternCancel() {
    patternDrag = null
    draggingPattern = false
    preview = null
  }

  /**
   * Where a pattern dragged to (clientX, clientY) would be placed: a track and
   * a snapped start, or null if the pointer isn't over the visible tracks.
   */
  function dropSpot(e: PointerEvent): { trackId: string; start: number } | null {
    const view = scroller.getBoundingClientRect()
    const area = lanes.getBoundingClientRect()
    const inside =
      e.clientX >= Math.max(area.left, view.left + HEADER_WIDTH) &&
      e.clientX < Math.min(area.right, view.right) &&
      e.clientY >= Math.max(area.top, view.top + RULER_HEIGHT) &&
      e.clientY < Math.min(area.bottom, view.bottom)
    const { tick, track } = pointerInLanes(e)
    if (!inside || !track) return null
    return { trackId: track.id, start: snapTick(tick, snapFor(e)) }
  }

  // Ctrl+wheel zooms (see zoom.ts).
  $effect(() =>
    zoomOnCtrlWheel(scroller, {
      gutter: HEADER_WIDTH,
      range: PLAYLIST_ZOOM,
      get: () => pxPerTick,
      set: (next) => onZoom?.(next),
    }),
  )

  function onKeydown(e: KeyboardEvent) {
    if (!active) return
    if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      e.preventDefault()
      onEdit(removeClips(song, [selectedId]))
      selectedId = null
    } else if (e.key === 'Escape') {
      selectedId = null
    }
  }

  /**
   * The notes a clip shows, for its small preview: only the part of the
   * pattern inside the trim, positioned relative to the clip's left edge, with
   * pitch stretched to fill the clip's height.
   */
  function previewNotes(pattern: Pattern, clip: Clip) {
    if (pattern.notes.length === 0) return []
    const pitches = pattern.notes.map((n) => n.pitch)
    const low = Math.min(...pitches)
    const rows = Math.max(...pitches) - low + 1
    const end = clip.offset + clip.length
    return pattern.notes
      .filter((n) => n.start >= clip.offset && n.start < end)
      .map((n) => ({
        id: n.id,
        left: tickToX(n.start - clip.offset, viewport),
        width: Math.max(1, tickToX(Math.min(n.duration, end - n.start), viewport)),
        top: ((low + rows - 1 - n.pitch) / rows) * 100,
        height: 100 / rows,
      }))
  }
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={(e) => (active = scroller.contains(e.target as Node))} />

<div class="playlist" class:dragging-pattern={draggingPattern}>
<!-- The pattern list, like FL's picker panel: click to select, double-click to open, drag onto a track to place. -->
<aside class="patterns">
  <button class="new-pattern" onclick={onNewPattern} title="Make a new empty pattern and open it">+ Pattern</button>
  <ul aria-label="Patterns">
    {#each song.patterns as pattern (pattern.id)}
      <li>
        <button
          class="pattern"
          class:selected={pattern.id === selectedPatternId}
          title="Drag onto a track to place it. Double-click to edit."
          onpointerdown={(e) => onPatternDown(e, pattern)}
          onpointermove={onPatternMove}
          onpointerup={onPatternUp}
          onpointercancel={onPatternCancel}
          ondblclick={() => onOpenPattern(pattern.id)}
        >
          {pattern.name}
        </button>
      </li>
    {/each}
  </ul>
</aside>

<div class="scroller" bind:this={scroller}>
  <div
    class="content"
    style:grid-template-columns="{HEADER_WIDTH}px {gridWidth}px"
    style:grid-template-rows="{RULER_HEIGHT}px {gridHeight}px"
  >
    <div class="corner">
      <button onclick={onAddTrack} title="Add a track">+ Track</button>
    </div>

    <div
      class="ruler"
      bind:this={ruler}
      role="slider"
      tabindex="-1"
      aria-label="Song position"
      aria-valuenow={0}
      onpointerdown={onRulerDown}
      onpointermove={onRulerMove}
    >
      {#each barNumbers as bar (bar)}
        <span class="bar-number" style:left="{bar * barPx}px">{bar + 1}</span>
      {/each}
      <div class="ruler-playhead" bind:this={rulerPlayhead}></div>
    </div>

    <div class="headers">
      {#each shown.tracks as track (track.id)}
        <div class="header" style:height="{TRACK_HEIGHT}px">{track.name}</div>
      {/each}
    </div>

    <div
      class="lanes"
      bind:this={lanes}
      role="application"
      aria-label="Track list"
      style:cursor={cursor}
      onpointerdown={onLanesDown}
      onpointermove={onLanesMove}
      onpointerup={onLanesUp}
      onpointercancel={onLanesCancel}
      ondblclick={onLanesDoubleClick}
      oncontextmenu={(e) => e.preventDefault()}
    >
      {#each shown.tracks as track (track.id)}
        <div class="lane" style:height="{TRACK_HEIGHT}px"></div>
      {/each}

      <div class="lines" style:background-size="{barPx}px 100%, {beatPx}px 100%, {stepPx}px 100%"></div>

      {#each shown.clips as clip (clip.id)}
        {@const pattern = findPattern(shown, clip.patternId)}
        {@const row = rowOf.get(clip.trackId)}
        {#if pattern && row !== undefined}
          <div
            class="clip"
            class:selected={clip.id === selectedId}
            data-clip={clip.id}
            style:left="{tickToX(clip.start, viewport)}px"
            style:top="{row * TRACK_HEIGHT}px"
            style:width="{tickToX(clip.length, viewport)}px"
            style:height="{TRACK_HEIGHT}px"
          >
            <span class="clip-name">{pattern.name}</span>
            <div class="clip-notes">
              {#each previewNotes(pattern, clip) as note (note.id)}
                <div
                  class="mini-note"
                  style:left="{note.left}px"
                  style:width="{note.width}px"
                  style:top="{note.top}%"
                  style:height="{note.height}%"
                ></div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}

      <div class="playhead" bind:this={lanesPlayhead}></div>
    </div>
  </div>
</div>
</div>

<style>
  .playlist {
    display: flex;
    height: 100%;
  }

  .dragging-pattern,
  .dragging-pattern * {
    cursor: copy !important;
  }

  .patterns {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 130px;
    flex-shrink: 0;
    padding: 6px;
    box-sizing: border-box;
    overflow-y: auto;
    background: var(--panel);
    border-right: 1px solid var(--line-strong);
  }

  .patterns ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .new-pattern,
  .pattern {
    width: 100%;
    padding: 4px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    background: var(--button);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .pattern {
    cursor: grab;
    touch-action: none;
    user-select: none;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .new-pattern:hover,
  .pattern:hover {
    background: var(--button-hover);
  }

  .pattern.selected {
    border-color: var(--note-border);
    background: color-mix(in srgb, var(--note) 25%, var(--button));
    color: var(--text);
  }

  .scroller {
    flex: 1;
    min-width: 0;
    overflow: auto;
    height: 100%;
    background: var(--roll-bg);
    overscroll-behavior: contain;
  }

  .content {
    display: grid;
    width: max-content;
  }

  .corner,
  .ruler,
  .headers {
    position: sticky;
    background: var(--panel);
  }

  .corner {
    top: 0;
    left: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    padding: 0 4px;
    border-right: 1px solid var(--line-strong);
    border-bottom: 1px solid var(--line-strong);
  }

  .corner button {
    height: 18px;
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    background: var(--button);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
  }

  .corner button:hover {
    background: var(--button-hover);
  }

  .ruler {
    top: 0;
    z-index: 3;
    border-bottom: 1px solid var(--line-strong);
    cursor: ew-resize;
    touch-action: none;
    user-select: none;
  }

  .bar-number {
    position: absolute;
    top: 0;
    bottom: 0;
    padding-left: 4px;
    border-left: 1px solid var(--line-strong);
    font-size: 11px;
    line-height: 24px;
    color: var(--text-dim);
  }

  .headers {
    left: 0;
    z-index: 2;
    border-right: 1px solid var(--line-strong);
  }

  .header {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-bottom: 1px solid var(--line-strong);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .lanes {
    position: relative;
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  .lane {
    box-sizing: border-box;
    background: var(--row-white);
    border-bottom: 1px solid var(--line-strong);
  }

  .lane:nth-child(even) {
    background: var(--row-black);
  }

  .lines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(to right, var(--line-bar) 1px, transparent 1px),
      linear-gradient(to right, var(--line-beat) 1px, transparent 1px),
      linear-gradient(to right, var(--line-faint) 1px, transparent 1px);
  }

  .clip {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: color-mix(in srgb, var(--note) 30%, var(--roll-bg));
    border: 1px solid var(--note-border);
    border-radius: 3px;
    pointer-events: none;
  }

  .clip.selected {
    border-color: var(--note-selected);
    box-shadow: inset 0 0 0 1px var(--note-selected);
  }

  .clip-name {
    flex-shrink: 0;
    padding: 1px 4px;
    background: var(--note-border);
    color: var(--note-text);
    font-size: 10px;
    line-height: 14px;
    white-space: nowrap;
    overflow: hidden;
  }

  .clip-notes {
    position: relative;
    flex: 1;
    margin: 3px 0;
  }

  .mini-note {
    position: absolute;
    min-height: 1px;
    background: var(--note);
  }

  .playhead,
  .ruler-playhead {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    will-change: transform;
  }

  .playhead {
    bottom: 0;
    width: 1px;
    background: var(--playhead);
    box-shadow: 0 0 4px var(--playhead);
  }

  .ruler-playhead {
    width: 0;
    height: 0;
    margin-left: -6px;
    margin-top: 12px;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 12px solid var(--playhead);
  }
</style>
