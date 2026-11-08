<script lang="ts">
  // The inside of the Instrument window: a header with a picker to swap the
  // pattern's instrument for another type and the pattern's volume, and that
  // instrument's own editor below.

  import type { Component } from 'svelte'
  import { createInstrument, INSTRUMENT_TYPES, INSTRUMENTS, type Instrument, type InstrumentType } from './definitions'
  import { EDITORS, type EditorProps } from './editors'

  interface Props {
    instrument: Instrument
    /** The pattern's volume slider, 0–1. It belongs to the pattern, so swapping synths keeps it. */
    volume: number
    onInput: (next: Instrument) => void
    onChange: (next: Instrument) => void
    /** Live while the slider moves. Not an undo step. */
    onVolumeInput: (volume: number) => void
    /** When the slider is let go (or moved with the keyboard). One undo step. */
    onVolumeChange: (volume: number) => void
  }

  let { instrument, volume, onInput, onChange, onVolumeInput, onVolumeChange }: Props = $props()

  // Components are ordinary values in Svelte 5, so the editor can be picked
  // at runtime and used as a tag below. It changes when the type changes.
  const Editor = $derived(EDITORS[instrument.type] as Component<EditorProps<Instrument>>)

  function swap(type: InstrumentType) {
    // A new instrument starts from its own defaults, like loading a fresh plugin.
    if (type !== instrument.type) onChange(createInstrument(type))
  }
</script>

<div class="panel">
  <header>
    <label>
      Synth
      <select value={instrument.type} onchange={(e) => swap(e.currentTarget.value as InstrumentType)}>
        {#each INSTRUMENT_TYPES as type (type)}
          <option value={type}>{INSTRUMENTS[type].name}</option>
        {/each}
      </select>
    </label>
    <!-- A range input fires "input" while it moves and "change" once when let go. -->
    <label class="volume">
      Volume
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        oninput={(e) => onVolumeInput(Number(e.currentTarget.value))}
        onchange={(e) => onVolumeChange(Number(e.currentTarget.value))}
      />
      <output>{Math.round(volume * 100)}%</output>
    </label>
  </header>

  <div class="editor">
    <Editor {instrument} {onInput} {onChange} />
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--roll-bg);
  }

  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 10px;
    background: var(--panel);
    border-bottom: 1px solid var(--line-strong);
  }

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-dim);
  }

  .volume output {
    min-width: 34px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text);
  }

  select {
    background: var(--button);
    color: var(--text);
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    padding: 3px 4px;
  }

  .editor {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
</style>
