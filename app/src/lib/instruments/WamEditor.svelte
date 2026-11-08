<script lang="ts">
  // The editor for a WAM plugin: the plugin's own interface, inside the
  // Instrument window.
  //
  // The plugin changes its settings itself when you use its interface, and
  // doesn't tell anyone. So after each interaction (a click, drag, key or
  // scroll inside it) this waits a moment, reads the plugin's settings, and if
  // they changed, records them on the pattern as one undo step. Undo then puts
  // older settings back through the audio engine (see wamEngine.ts).

  import type { PluginHandle, PluginStatus } from '../audio/backend'
  import { sameState, type WamPlugin } from './definitions'
  import type { EditorProps } from './editors'

  let { instrument, onChange, channelId, audio }: EditorProps<WamPlugin> = $props()

  /** How long after the last interaction to read the plugin's settings. */
  const SETTLE_MS = 300

  let plugin = $state.raw<PluginHandle | undefined>()
  /** 'stopped' means audio hasn't started, so the plugin doesn't exist yet. */
  let status = $state<PluginStatus | 'stopped'>('stopped')
  let error = $state<string | null>(null)
  let guiHost: HTMLDivElement

  // Find this channel's plugin, and look again whenever channels are rebuilt
  // (audio starting, or the plugin being swapped for another).
  $effect(() => {
    const id = channelId
    const look = () => (plugin = audio.getPlugin(id))
    look()
    return audio.onChannelsChange(look)
  })

  // Follow its loading status.
  $effect(() => {
    const p = plugin
    if (!p) {
      status = 'stopped'
      return
    }
    const read = () => {
      status = p.status
      error = p.error
    }
    read()
    return p.onStatusChange(read)
  })

  // Once it's ready, put its interface on the page; take it off again when
  // this editor closes or the plugin changes.
  $effect(() => {
    const p = plugin
    if (!p || status !== 'ready') return
    let gui: Element | null = null
    let cancelled = false
    void p.createGui().then((element) => {
      if (cancelled) return p.destroyGui(element)
      gui = element
      guiHost.appendChild(element)
    })
    return () => {
      cancelled = true
      if (gui) {
        p.destroyGui(gui)
        gui.remove()
      }
    }
  })

  let settleTimer: ReturnType<typeof setTimeout> | undefined

  function onInteraction() {
    clearTimeout(settleTimer)
    settleTimer = setTimeout(capture, SETTLE_MS)
  }

  async function capture() {
    const p = plugin
    if (!p || p.status !== 'ready') return
    const state = await p.getState()
    if (!sameState(state, instrument.state)) onChange({ ...instrument, state })
  }

  $effect(() => () => clearTimeout(settleTimer))
</script>

<div class="wam">
  {#if status === 'stopped'}
    <p>
      Audio isn't running yet.
      <button onclick={() => audio.start()}>Start audio</button>
      to load {instrument.name}.
    </p>
  {:else if status === 'loading'}
    <p>Loading {instrument.name}…</p>
  {:else if status === 'failed' || status === 'blocked'}
    <p class="error">{error}</p>
    <p>Its saved settings are kept, so saving the song won't lose them.</p>
  {/if}

  <!-- These listeners hear events bubbling up from the plugin's own controls
       inside, which are interactive; the box itself isn't. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="gui"
    role="application"
    aria-label="{instrument.name} controls"
    bind:this={guiHost}
    hidden={status !== 'ready'}
    onpointerup={onInteraction}
    onkeyup={onInteraction}
    onchange={onInteraction}
    onwheel={onInteraction}
  ></div>
</div>

<style>
  .wam {
    padding: 8px;
  }

  p {
    margin: 4px 2px;
    color: var(--text-dim);
  }

  .error {
    color: #ff7a7a;
  }

  button {
    padding: 2px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--button);
    color: var(--text);
    cursor: pointer;
  }

  .gui {
    width: max-content;
  }
</style>
