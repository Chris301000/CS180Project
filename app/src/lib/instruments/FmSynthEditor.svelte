<script lang="ts">
  import Knob from '../ui/Knob.svelte'
  import { INSTRUMENTS, type FmSynth } from './definitions'
  import type { EditorProps } from './editors'

  let { instrument, onInput, onChange }: EditorProps<FmSynth> = $props()

  const { params, defaults } = INSTRUMENTS.fm
  const KEYS = ['ratio', 'depth', 'attack', 'release'] as const

  const withSetting = (key: (typeof KEYS)[number], value: number): FmSynth => ({ ...instrument, [key]: value })
</script>

<!-- Its own look, to show each instrument draws its own interface. -->
<div class="editor">
  <div class="badge">FM</div>
  <div class="knobs">
    {#each KEYS as key (key)}
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
    --knob: #7fb8ff;
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 10px;
    padding: 8px 12px;
    border: 1px solid #2c4a6e;
    border-radius: 6px;
    background: linear-gradient(180deg, #1d2a38, #162029);
  }

  .badge {
    padding: 4px 8px;
    border-radius: 4px;
    background: #2c4a6e;
    color: #cfe3ff;
    font-family: var(--mono);
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .knobs {
    display: flex;
    gap: 4px;
  }
</style>
