<script lang="ts">
  // A rotary knob, like on a hardware synth. Drag up or down to turn it (hold
  // Shift for fine control), use the arrow keys, or double-click to reset.
  // While dragging it calls onInput with each new value so the sound can
  // follow, and onChange once on release, so a whole turn is one undo step.

  interface Props {
    label: string
    value: number
    min: number
    max: number
    /** Value restored by double-clicking. */
    defaultValue?: number
    /** 'squared' gives finer control near the minimum, for times. */
    curve?: 'linear' | 'squared'
    unit?: 's'
    onInput: (value: number) => void
    onChange: (value: number) => void
  }

  let { label, value, min, max, defaultValue, curve = 'linear', unit, onInput, onChange }: Props = $props()

  /** Pixels of drag for the full range. */
  const DRAG_RANGE_PX = 160
  /** The knob turns through 270°, leaving a gap at the bottom like a real one. */
  const SWEEP = 0.75
  const RADIUS = 15
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS

  // The knob's position, 0–1, is separate from its value so the curve can
  // spread values unevenly along it.
  const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
  const toPosition = (v: number) => {
    const t = clamp01((v - min) / (max - min))
    return curve === 'squared' ? Math.sqrt(t) : t
  }
  const fromPosition = (t: number) => min + (max - min) * (curve === 'squared' ? t * t : t)

  const position = $derived(toPosition(value))

  let drag: { startY: number; startPosition: number; startValue: number; latest: number } | null = null

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag = { startY: e.clientY, startPosition: position, startValue: value, latest: value }
    e.preventDefault()
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return
    const scale = e.shiftKey ? 0.2 : 1
    const t = clamp01(drag.startPosition + ((drag.startY - e.clientY) / DRAG_RANGE_PX) * scale)
    drag.latest = fromPosition(t)
    onInput(drag.latest)
  }

  function onPointerUp() {
    // A click without turning isn't an edit.
    if (drag && drag.latest !== drag.startValue) onChange(drag.latest)
    drag = null
  }

  function onKeydown(e: KeyboardEvent) {
    const step = e.shiftKey ? 0.01 : 0.05
    const delta = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? step : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -step : 0
    if (delta === 0) return
    e.preventDefault()
    onChange(fromPosition(clamp01(position + delta)))
  }

  function format(v: number) {
    if (unit === 's') return v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`
    return v < 10 ? v.toFixed(2) : v.toFixed(1)
  }
</script>

<div
  class="knob"
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  aria-valuetext={format(value)}
  title="Drag up or down (Shift for fine). Double-click to reset."
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={() => (drag = null)}
  ondblclick={() => defaultValue !== undefined && onChange(defaultValue)}
  onkeydown={onKeydown}
>
  <svg viewBox="0 0 40 40" width="44" height="44" aria-hidden="true">
    <!-- Both arcs are a circle with only part of its outline drawn, rotated so the gap is at the bottom. -->
    <g transform="rotate(135 20 20)">
      <circle class="track" cx="20" cy="20" r={RADIUS} stroke-dasharray="{CIRCUMFERENCE * SWEEP} {CIRCUMFERENCE}" />
      <circle
        class="fill"
        cx="20"
        cy="20"
        r={RADIUS}
        stroke-dasharray="{CIRCUMFERENCE * SWEEP * position} {CIRCUMFERENCE}"
      />
    </g>
    <line class="pointer" x1="20" y1="20" x2="20" y2="8" transform="rotate({-135 + 270 * position} 20 20)" />
  </svg>
  <span class="label">{label}</span>
  <span class="value">{format(value)}</span>
</div>

<style>
  .knob {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    width: 64px;
    padding: 4px 0;
    border-radius: 4px;
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
    outline: none;
  }

  .knob:focus-visible {
    box-shadow: 0 0 0 1px var(--accent);
  }

  circle {
    fill: none;
    stroke-width: 4;
    stroke-linecap: round;
  }

  .track {
    stroke: var(--line-strong);
  }

  .fill {
    stroke: var(--knob, var(--accent));
  }

  .pointer {
    stroke: var(--text);
    stroke-width: 2;
    stroke-linecap: round;
  }

  .label {
    font-size: 11px;
    color: var(--text-dim);
  }

  .value {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text);
  }
</style>
