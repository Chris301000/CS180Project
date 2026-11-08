import { fireEvent, render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WamEditor from './WamEditor.svelte'
import { createWamInstrument, WAM_PLUGINS, type WamPlugin } from './definitions'
import type { PluginHandle, PluginStatus } from '../audio/backend'

/** A stand-in for the audio engine and one plugin, which the test controls. */
function fakeAudio(initialStatus: PluginStatus = 'ready') {
  const statusListeners = new Set<() => void>()
  const channelListeners = new Set<() => void>()
  const plugin = {
    status: initialStatus,
    error: null as string | null,
    state: { cutoff: 0.2 } as unknown,
    onStatusChange(listener: () => void) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    async createGui() {
      const gui = document.createElement('div')
      gui.className = 'fake-gui'
      gui.innerHTML = '<button>knob</button>'
      return gui
    },
    destroyGui: vi.fn(),
    async getState() {
      return plugin.state
    },
  }
  let started = false
  const audio = {
    start: vi.fn(async () => {
      started = true
      for (const listener of channelListeners) listener()
    }),
    getPlugin: () => (started ? (plugin as PluginHandle) : undefined),
    onChannelsChange(listener: () => void) {
      channelListeners.add(listener)
      return () => channelListeners.delete(listener)
    },
  }
  const setStatus = (status: PluginStatus, error: string | null = null) => {
    plugin.status = status
    plugin.error = error
    for (const listener of statusListeners) listener()
  }
  return { audio, plugin, setStatus, start: () => audio.start() }
}

const instrument = (state: unknown = null): WamPlugin => ({ ...createWamInstrument(WAM_PLUGINS[0]), state })

const pointer = (el: EventTarget, type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true }))
/** A click on something inside the plugin's interface: press and release there. */
const press = (el: Element) => {
  pointer(el, 'pointerdown')
  pointer(el, 'pointerup')
}

function setup(fake = fakeAudio(), state: unknown = { cutoff: 0.2 }) {
  const onChange = vi.fn<(next: WamPlugin) => void>()
  const result = render(WamEditor, {
    instrument: instrument(state),
    onInput: vi.fn(),
    onChange,
    channelId: 'p1',
    audio: fake.audio,
  })
  return { ...result, ...fake, onChange }
}

/** Lets promises (like createGui) and Svelte's updates finish. */
const flush = async () => {
  await Promise.resolve()
  await tick()
  await Promise.resolve()
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('WamEditor', () => {
  it("offers to start audio when the plugin doesn't exist yet, then shows its interface", async () => {
    const { getByText, container, audio } = setup()
    expect(getByText(/Audio isn't running yet/)).toBeTruthy()
    await fireEvent.click(getByText('Start audio'))
    expect(audio.start).toHaveBeenCalled()
    await flush()
    expect(container.querySelector('.fake-gui')).toBeTruthy()
  })

  it('shows loading, then the interface once ready', async () => {
    const fake = fakeAudio('loading')
    const { getByText, container, start, setStatus } = setup(fake)
    await start()
    await flush()
    expect(getByText(/Loading Synth-101/)).toBeTruthy()
    setStatus('ready')
    await flush()
    expect(container.querySelector('.fake-gui')).toBeTruthy()
  })

  it("explains why a plugin couldn't load", async () => {
    const fake = fakeAudio('loading')
    const { getByText, start, setStatus } = setup(fake)
    await start()
    setStatus('blocked', "Mystery isn't on the approved plugin list, so it wasn't loaded.")
    await flush()
    expect(getByText(/approved plugin list/)).toBeTruthy()
    expect(getByText(/saved settings are kept/)).toBeTruthy()
  })

  it('records settings changed in the plugin, once things settle after an interaction', async () => {
    const { container, start, plugin, onChange } = setup()
    await start()
    await flush()
    plugin.state = { cutoff: 0.8 } // Turned a knob in the plugin's own interface.
    const knob = container.querySelector('.fake-gui button')!
    press(knob)
    press(knob)
    expect(onChange).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(instrument({ cutoff: 0.8 }))
  })

  it('records a knob dragged from inside the plugin and let go outside it', async () => {
    const { container, start, plugin, onChange } = setup()
    await start()
    await flush()
    pointer(container.querySelector('.fake-gui button')!, 'pointerdown')
    plugin.state = { cutoff: 0.9 }
    pointer(document.body, 'pointerup')
    await vi.advanceTimersByTimeAsync(300)
    expect(onChange).toHaveBeenCalledWith(instrument({ cutoff: 0.9 }))
  })

  it('ignores releases that did not start inside the plugin', async () => {
    const { start, plugin, onChange } = setup()
    await start()
    await flush()
    plugin.state = { cutoff: 0.9 }
    press(document.body)
    await vi.advanceTimersByTimeAsync(300)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('records nothing when an interaction changed nothing (allowing for rounding)', async () => {
    const { container, start, plugin, onChange } = setup()
    await start()
    await flush()
    plugin.state = { cutoff: 0.20000000298023224 }
    press(container.querySelector('.fake-gui button')!)
    await vi.advanceTimersByTimeAsync(300)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("reports the plugin interface's size, plus padding, so the window can fit it", async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(486)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(216)
    const onPreferredSize = vi.fn()
    const fake = fakeAudio()
    render(WamEditor, {
      instrument: instrument(),
      onInput: vi.fn(),
      onChange: vi.fn(),
      channelId: 'p1',
      audio: fake.audio,
      onPreferredSize,
    })
    await fake.start()
    await flush()
    expect(onPreferredSize).toHaveBeenCalledOnce()
    expect(onPreferredSize).toHaveBeenCalledWith({ width: 502, height: 232 })
    vi.restoreAllMocks()
  })

  it("removes the plugin's interface when it closes", async () => {
    const { start, plugin, unmount } = setup()
    await start()
    await flush()
    unmount()
    expect(plugin.destroyGui).toHaveBeenCalled()
  })
})
