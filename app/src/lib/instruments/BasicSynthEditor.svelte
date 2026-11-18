<script lang="ts">
  import Knob from '../ui/Knob.svelte'
  import { INSTRUMENTS, WAVES, type BasicSynth, type Wave } from './definitions'
  import type { EditorProps } from './editors'

  let { instrument, onInput, onChange }: EditorProps<BasicSynth> = $props()

  const { params, defaults } = INSTRUMENTS.basic

  // Small drawings of one cycle of each wave, for the wave buttons.
  const WAVE_PATHS: Record<Wave, string> = {
    sine: 'M2 10 C 6 0, 10 0, 14 10 S 22 20, 26 10',
    square: 'M2 10 V3 H14 V17 H26 V10',
    sawtooth: 'M2 17 L14 3 V17 L26 3',
    triangle: 'M2 10 L8 3 L20 17 L26 10',
  }

  /** A copy of the synth with one setting changed. */
  const withSetting = <K extends keyof BasicSynth>(key: K, value: BasicSynth[K]) => ({ ...instrument, [key]: value })
</script>

<div class="editor">
  <div class="waves" role="radiogroup" aria-label={params.wave.label}>
    {#each WAVES as wave (wave)}
      <button
        role="radio"
        aria-checked={instrument.wave === wave}
        aria-label={wave}
        title={wave}
        class:on={instrument.wave === wave}
        onclick={() => instrument.wave !== wave && onChange(withSetting('wave', wave))}
      >
        <svg viewBox="0 0 28 20" width="28" height="20" aria-hidden="true"><path d={WAVE_PATHS[wave]} /></svg>
      </button>
    {/each}
  </div>

  <div class="knobs">
    {#each ['attack', 'release'] as const as key (key)}
      <Knob
        label={params[key].label}
        min={params[key].min}
        max={params[key].max}
        curve={params[key].curve}
        unit={params[key].unit}
        value={instrument[key]}
        defaultValue={defaults[key]}
        onInput={(v) => onInput(withSetting(key, v))}
        onChange={(v) => onChange(withSetting(key, v))}
      />
    {/each}
  </div>
</div>

<style>
  .editor {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 12px;
  }

  .waves {
    display: grid;
    grid-template-columns: repeat(2, auto);
    gap: 4px;
  }

  button {
    padding: 4px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--button);
    cursor: pointer;
  }

  button:hover {
    background: var(--button-hover);
  }

  button.on {
    border-color: var(--accent);
  }

  path {
    fill: none;
    stroke: var(--text-dim);
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .on path {
    stroke: var(--accent);
  }

  .knobs {
    display: flex;
    gap: 8px;
  }
</style>
