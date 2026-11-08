<script lang="ts" module>
  // Shared by every Window (like a C# static field): the highest z-index handed
  // out so far, so the window clicked last is drawn on top.
  let topZ = 0
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import { fitRect, moveRect, resizeRect, type Edges, type Rect } from './windowGeometry'

  interface Props {
    title: string
    /** Position and size in pixels, relative to the workspace (the parent element). Bindable, so the parent can remember them. */
    x?: number
    y?: number
    width?: number
    height?: number
    minWidth?: number
    minHeight?: number
    /** Shows a close button when given. The parent decides what closing means. */
    onClose?: () => void
    /** Extra controls shown in the title bar, before the window buttons (e.g. a zoom slider). */
    actions?: Snippet
    children: Snippet
  }

  let {
    title,
    x = $bindable(24),
    y = $bindable(24),
    width = $bindable(640),
    height = $bindable(400),
    minWidth = 240,
    minHeight = 140,
    onClose,
    actions,
    children,
  }: Props = $props()

  const HANDLES: { name: string; edges: Edges }[] = [
    { name: 'n', edges: { top: true } },
    { name: 's', edges: { bottom: true } },
    { name: 'e', edges: { right: true } },
    { name: 'w', edges: { left: true } },
    { name: 'ne', edges: { top: true, right: true } },
    { name: 'nw', edges: { top: true, left: true } },
    { name: 'se', edges: { bottom: true, right: true } },
    { name: 'sw', edges: { bottom: true, left: true } },
  ]

  let el: HTMLElement
  let z = $state(++topZ)
  /** Fills the workspace while true; x/y/width/height are kept for restoring. */
  let maximized = $state(false)

  // A drag in progress: moving (edges = null) or resizing. Remembers where it
  // started, so each pointer move is computed from the start, not the last move.
  type Gesture = { edges: Edges | null; startX: number; startY: number; rect: Rect }
  let gesture: Gesture | null = null

  const min = $derived({ width: minWidth, height: minHeight })

  function workspaceSize() {
    const parent = el.parentElement!
    return { width: parent.clientWidth, height: parent.clientHeight }
  }

  function apply(rect: Rect) {
    ;({ x, y, width, height } = rect)
  }

  function bringToFront() {
    if (z !== topZ) z = ++topZ
  }

  function begin(e: PointerEvent, edges: Edges | null) {
    if (e.button !== 0) return
    // Keeps getting pointer moves even when the mouse leaves the element.
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    gesture = { edges, startX: e.clientX, startY: e.clientY, rect: { x, y, width, height } }
    e.preventDefault() // Don't select text while dragging.
  }

  /** Controls in the title bar (buttons, sliders) work as usual instead of dragging the window. */
  const isControl = (target: EventTarget | null) => !!(target as HTMLElement).closest('button, input, select, label')

  function onTitleDown(e: PointerEvent) {
    if (maximized || isControl(e.target)) return
    begin(e, null)
  }

  function onGestureMove(e: PointerEvent) {
    if (!gesture) return
    const dx = e.clientX - gesture.startX
    const dy = e.clientY - gesture.startY
    const bounds = workspaceSize()
    apply(
      gesture.edges
        ? resizeRect(gesture.rect, gesture.edges, dx, dy, bounds, min)
        : moveRect(gesture.rect, dx, dy, bounds),
    )
  }

  function endGesture() {
    gesture = null
  }

  function toggleMaximized() {
    maximized = !maximized
  }

  // When the workspace changes size (e.g. the browser window shrinks), pull
  // the window back inside. Also runs once on mount. jsdom has no ResizeObserver.
  $effect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => apply(fitRect({ x, y, width, height }, workspaceSize(), min)))
    observer.observe(el.parentElement!)
    return () => observer.disconnect()
  })
</script>

<section
  class="window"
  class:maximized
  bind:this={el}
  aria-label={title}
  style:z-index={z}
  style:left={maximized ? '0' : `${x}px`}
  style:top={maximized ? '0' : `${y}px`}
  style:width={maximized ? '100%' : `${width}px`}
  style:height={maximized ? '100%' : `${height}px`}
  onpointerdowncapture={bringToFront}
>
  <header
    class="titlebar"
    role="toolbar"
    aria-label="{title} title bar"
    tabindex="-1"
    onpointerdown={onTitleDown}
    onpointermove={onGestureMove}
    onpointerup={endGesture}
    onpointercancel={endGesture}
    ondblclick={(e) => !isControl(e.target) && toggleMaximized()}
  >
    <span class="title">{title}</span>
    {#if actions}
      <div class="actions">{@render actions()}</div>
    {/if}
    <button onclick={toggleMaximized} aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'}>
      {maximized ? '❐' : '□'}
    </button>
    {#if onClose}
      <button onclick={onClose} aria-label="Close" title="Close">✕</button>
    {/if}
  </header>

  <div class="body">
    {@render children()}
  </div>

  {#if !maximized}
    {#each HANDLES as handle (handle.name)}
      <div
        class="handle {handle.name}"
        data-handle={handle.name}
        aria-hidden="true"
        onpointerdown={(e) => begin(e, handle.edges)}
        onpointermove={onGestureMove}
        onpointerup={endGesture}
        onpointercancel={endGesture}
      ></div>
    {/each}
  {/if}
</section>

<style>
  .window {
    position: absolute;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.45);
  }

  .window.maximized {
    border-radius: 0;
    box-shadow: none;
  }

  .titlebar {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    flex-shrink: 0;
    padding: 0 4px 0 10px;
    border-bottom: 1px solid var(--line-strong);
    cursor: move;
    user-select: none;
    touch-action: none;
  }

  .maximized .titlebar {
    cursor: default;
  }

  .title {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-dim);
    font-size: 12px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 6px;
    color: var(--text-dim);
    font-size: 11px;
  }

  button {
    width: 22px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 12px;
  }

  button:hover {
    background: var(--button-hover);
    color: var(--text);
  }

  /* min-height: 0 lets the body shrink so its content scrolls instead of overflowing. */
  .body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border-radius: 0 0 6px 6px;
  }

  .maximized .body {
    border-radius: 0;
  }

  /* Invisible strips along the edges and corners that start a resize. */
  .handle {
    position: absolute;
    touch-action: none;
  }

  .n,
  .s {
    left: 8px;
    right: 8px;
    height: 6px;
    cursor: ns-resize;
  }

  .e,
  .w {
    top: 8px;
    bottom: 8px;
    width: 6px;
    cursor: ew-resize;
  }

  .n { top: -3px; }
  .s { bottom: -3px; }
  .e { right: -3px; }
  .w { left: -3px; }

  .ne,
  .nw,
  .se,
  .sw {
    width: 12px;
    height: 12px;
    z-index: 1;
  }

  .ne { top: -4px; right: -4px; cursor: nesw-resize; }
  .sw { bottom: -4px; left: -4px; cursor: nesw-resize; }
  .nw { top: -4px; left: -4px; cursor: nwse-resize; }
  .se { bottom: -4px; right: -4px; cursor: nwse-resize; }
</style>
