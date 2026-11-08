<script lang="ts">
  // The inside of the Instrument window: a header with a picker to swap the
  // pattern's instrument for another type and the pattern's volume, and that
  // instrument's own editor below.

  import type { Component } from 'svelte'
  import {
    BUILTIN_TYPES,
    createInstrument,
    createWamInstrument,
    INSTRUMENTS,
    isApprovedPlugin,
    WAM_PLUGINS,
    type BuiltinType,
    type Instrument,
  } from './definitions'
  import { EDITORS, type EditorProps, type PluginHost } from './editors'

  interface Props {
    instrument: Instrument
    /** The channel it plays on, and the audio engine, for plugin editors. */
    channelId: string
    audio: PluginHost
    /** The pattern's volume slider, 0–1. It belongs to the pattern, so swapping synths keeps it. */
    volume: number
    onInput: (next: Instrument) => void
    onChange: (next: Instrument) => void
    /** Live while the slider moves. Not an undo step. */
    onVolumeInput: (volume: number) => void
    /** When the slider is let go (or moved with the keyboard). One undo step. */
    onVolumeChange: (volume: number) => void
    /** The size the whole panel needs to show the editor without scrolling, when the editor reports one. */
    onPreferredSize?: (size: { width: number; height: number }) => void
  }

  let {
    instrument,
    channelId,
    audio,
    volume,
    onInput,
    onChange,
    onVolumeInput,
    onVolumeChange,
    onPreferredSize,
  }: Props = $props()

  let header: HTMLElement

  /** The editor's size plus the header above it, and at least as wide as the header. */
  function onEditorSize(size: { width: number; height: number }) {
    onPreferredSize?.({
      width: Math.max(size.width, header.scrollWidth),
      height: size.height + header.offsetHeight,
    })
  }

  // Components are ordinary values in Svelte 5, so the editor can be picked
  // at runtime and used as a tag below. It changes when the type changes.
  const Editor = $derived(EDITORS[instrument.type] as Component<EditorProps<Instrument>>)

  // The picker's options are the built-in synths by type, then the approved
  // plugins by URL. A "wam:" prefix tells them apart.
  const choiceOf = (i: Instrument) => (i.type === 'wam' ? `wam:${i.url}` : i.type)
  /** A plugin the song uses that isn't on the approved list, shown so the picker can display it. */
  const unlisted = $derived(instrument.type === 'wam' && !isApprovedPlugin(instrument.url) ? instrument : null)

  function swap(choice: string) {
    if (choice === choiceOf(instrument)) return
    // A new instrument starts from its own defaults, like loading a fresh plugin.
    const plugin = WAM_PLUGINS.find((p) => `wam:${p.url}` === choice)
    onChange(plugin ? createWamInstrument(plugin) : createInstrument(choice as BuiltinType))
  }
</script>

<div class="panel">
  <header bind:this={header}>
    <label>
      Synth
      <select value={choiceOf(instrument)} onchange={(e) => swap(e.currentTarget.value)}>
        <optgroup label="Built in">
          {#each BUILTIN_TYPES as type (type)}
            <option value={type}>{INSTRUMENTS[type].name}</option>
          {/each}
        </optgroup>
        <optgroup label="Plugins (WAM)">
          {#each WAM_PLUGINS as plugin (plugin.url)}
            <option value="wam:{plugin.url}">{plugin.name}</option>
          {/each}
          {#if unlisted}
            <option value={choiceOf(unlisted)} disabled>{unlisted.name} (not approved)</option>
          {/if}
        </optgroup>
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
    <Editor {instrument} {onInput} {onChange} {channelId} {audio} onPreferredSize={onEditorSize} />
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
