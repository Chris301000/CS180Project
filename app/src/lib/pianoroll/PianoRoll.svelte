<script lang="ts">
  import { onMount } from 'svelte'
  import {
    PITCH_COUNT,
    MAX_PITCH,
    isBlackKey,
    pitchName,
    pitchToY,
    tickToX,
    xToTick,
    type Viewport,
  } from '../song/coords'
  import { songLengthTicks, ticksPerBar, type Song } from '../song/song'
  import type { Transport } from '../song/transport'

  interface Props {
    song: Song
    transport: Transport
    viewport: Viewport
    /** Scroll horizontally to keep the playhead in view while playing. */
    follow?: boolean
  }

  let { song, transport, viewport, follow = true }: Props = $props()

  const KEYS_WIDTH = 64
  const RULER_HEIGHT = 24
  /** Smallest grid division drawn, in quarter notes (1/4 = sixteenth notes). */
  const STEP_BEATS = 1 / 4

  // Rows top to bottom, highest pitch first.
  const pitches = Array.from({ length: PITCH_COUNT }, (_, i) => MAX_PITCH - i)

  let scroller: HTMLDivElement
  let ruler: HTMLDivElement
  let gridPlayhead: HTMLDivElement
  let rulerPlayhead: HTMLDivElement

  const gridWidth = $derived(tickToX(songLengthTicks(song), viewport))
  const gridHeight = $derived(PITCH_COUNT * viewport.rowHeight)
  const barPx = $derived(tickToX(ticksPerBar(song), viewport))
  const beatPx = $derived(tickToX(song.ppq, viewport))
  const stepPx = $derived(tickToX(song.ppq * STEP_BEATS, viewport))
  const barNumbers = $derived(Array.from({ length: song.bars }, (_, i) => i))

  onMount(() => {
    // Start scrolled to around C6 so the middle of the keyboard is visible.
    scroller.scrollTop = pitchToY(84, viewport)
  })

  // The playhead moves every frame, so it's positioned directly instead of
  // through reactive state; otherwise every frame would make Svelte re-check the whole roll.
  $effect(() => {
    let raf = 0
    const frame = () => {
      const x = tickToX(transport.position(), viewport)
      const transform = `translateX(${x}px)`
      gridPlayhead.style.transform = transform
      rulerPlayhead.style.transform = transform
      if (follow && transport.isPlaying) keepInView(x)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  })

  /** Turns the page when the playhead leaves the visible area, like FL. */
  function keepInView(x: number) {
    const visible = scroller.clientWidth - KEYS_WIDTH
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
</script>

<div class="scroller" bind:this={scroller}>
  <div
    class="content"
    style:grid-template-columns="{KEYS_WIDTH}px {gridWidth}px"
    style:grid-template-rows="{RULER_HEIGHT}px {gridHeight}px"
  >
    <div class="corner"></div>

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

    <div class="keys">
      {#each pitches as pitch (pitch)}
        <div
          class="key"
          class:black={isBlackKey(pitch)}
          class:c={pitch % 12 === 0}
          style:height="{viewport.rowHeight}px"
        >
          {#if pitch % 12 === 0}{pitchName(pitch)}{/if}
        </div>
      {/each}
    </div>

    <div class="grid">
      {#each pitches as pitch (pitch)}
        <div
          class="row"
          class:black={isBlackKey(pitch)}
          class:c={pitch % 12 === 0}
          style:height="{viewport.rowHeight}px"
        ></div>
      {/each}

      <div
        class="lines"
        style:background-size="{barPx}px 100%, {beatPx}px 100%, {stepPx}px 100%"
      ></div>

      {#each song.notes as note (note.id)}
        <div
          class="note"
          style:left="{tickToX(note.start, viewport)}px"
          style:top="{pitchToY(note.pitch, viewport)}px"
          style:width="{tickToX(note.duration, viewport)}px"
          style:height="{viewport.rowHeight}px"
          style:opacity={0.45 + note.velocity * 0.55}
          title="{pitchName(note.pitch)}"
        >
          {#if tickToX(note.duration, viewport) > 28}{pitchName(note.pitch)}{/if}
        </div>
      {/each}

      <div class="playhead" bind:this={gridPlayhead}></div>
    </div>
  </div>
</div>

<style>
  .scroller {
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
  .keys {
    position: sticky;
    background: var(--panel);
  }

  .corner {
    top: 0;
    left: 0;
    z-index: 4;
    border-right: 1px solid var(--line-strong);
    border-bottom: 1px solid var(--line-strong);
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

  .keys {
    left: 0;
    z-index: 2;
    border-right: 1px solid var(--line-strong);
  }

  .key {
    box-sizing: border-box;
    padding-right: 4px;
    background: var(--key-white);
    border-bottom: 1px solid var(--key-gap);
    font-size: 10px;
    line-height: 1;
    color: var(--key-label);
    text-align: right;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .key.black {
    background: var(--key-black);
    margin-right: 22px;
    border-bottom-color: var(--key-black);
  }

  .key.c {
    border-bottom: 1px solid var(--line-strong);
  }

  .grid {
    position: relative;
    overflow: hidden;
  }

  .row {
    box-sizing: border-box;
    background: var(--row-white);
    border-bottom: 1px solid var(--line-faint);
  }

  .row.black {
    background: var(--row-black);
  }

  .row.c {
    border-bottom-color: var(--line-strong);
  }

  /* Vertical lines: bars, beats, then sixteenth steps, from strongest to faintest. */
  .lines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(to right, var(--line-bar) 1px, transparent 1px),
      linear-gradient(to right, var(--line-beat) 1px, transparent 1px),
      linear-gradient(to right, var(--line-faint) 1px, transparent 1px);
  }

  .note {
    position: absolute;
    box-sizing: border-box;
    padding-left: 3px;
    overflow: hidden;
    background: var(--note);
    border: 1px solid var(--note-border);
    border-radius: 2px;
    font-size: 9px;
    line-height: 1;
    color: var(--note-text);
    display: flex;
    align-items: center;
    white-space: nowrap;
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
