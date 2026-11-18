// The engine for Web Audio Module plugins. Unlike the built-in synths it
// builds nothing per note: the plugin is created once, its audio node is
// connected into the channel, and notes are sent to it as timed MIDI events.
// The plugin makes the sound itself, on the audio thread.

import type { WamEvent, WamNode, WebAudioModule } from '@webaudiomodules/api'
import { isApprovedPlugin, sameState, type Instrument, type WamPlugin } from '../instruments/definitions'
import type { PluginHandle, PluginStatus } from './backend'
import type { EngineNote, InstrumentEngine } from './voices'

/** How the engine gets plugins. The real one downloads them; tests pass a fake. */
export interface WamLoader {
  /** Sets up the WAM host for this audio context (once) and returns its group id. */
  host(context: BaseAudioContext): Promise<string>
  /** Loads a plugin's module and returns its class. */
  load(url: string): Promise<{
    createInstance(groupId: string, context: BaseAudioContext, initialState?: unknown): Promise<WebAudioModule<WamNode>>
  }>
}

const hosts = new WeakMap<BaseAudioContext, Promise<string>>()

export const defaultLoader: WamLoader = {
  host(context) {
    let host = hosts.get(context)
    if (!host) {
      // The SDK is only downloaded once a plugin is actually used.
      host = import('@webaudiomodules/sdk').then(({ initializeWamHost }) => initializeWamHost(context)).then(([id]) => id)
      hosts.set(context, host)
    }
    return host
  },
  async load(url) {
    const module = await import(/* @vite-ignore */ url)
    return module.default
  },
}

const NOTE_ON = 0x90
const NOTE_OFF = 0x80
/** MIDI velocity is 1–127 (0 would mean note off). */
const midiVelocity = (velocity: number) => Math.max(1, Math.min(127, Math.round(velocity * 127)))
const midi = (time: number, bytes: [number, number, number]): WamEvent => ({ type: 'wam-midi', time, data: { bytes } })

/** A WAM engine, plus the handle editors use to show the plugin's interface. */
export type WamEngine = InstrumentEngine & { plugin: PluginHandle }

export function createWamEngine(
  context: AudioContext,
  output: AudioNode,
  initial: WamPlugin,
  loader: WamLoader = defaultLoader,
): WamEngine {
  let status: PluginStatus = 'loading'
  let error: string | null = null
  const listeners = new Set<() => void>()
  const setStatus = (next: PluginStatus, message: string | null = null) => {
    status = next
    error = message
    for (const listener of listeners) listener()
  }

  let instance: WebAudioModule<WamNode> | null = null
  let disposed = false
  /** The state the plugin is known to have, so update() doesn't push back a state it just reported. */
  let knownState: unknown = initial.state
  /** What the plugin starts with when its saved state is null, so undoing back to null can restore it. */
  let defaultState: unknown = null
  /** Pitches with a note-off still to come, and when, so stopAll can release them. */
  const held = new Map<number, number>()

  async function load() {
    try {
      const groupId = await loader.host(context)
      const WAM = await loader.load(initial.url)
      const created = await WAM.createInstance(groupId, context, initial.state ?? undefined)
      if (disposed) {
        created.audioNode.destroy()
        return
      }
      if (initial.state == null) defaultState = await created.audioNode.getState()
      // A state that arrived while loading (e.g. from undo) wins over the one it was created with.
      const latest = knownState ?? defaultState
      if (!sameState(knownState, initial.state) && latest != null) await created.audioNode.setState(latest)
      created.audioNode.connect(output)
      instance = created
      setStatus('ready')
    } catch (err) {
      if (!disposed) setStatus('failed', `Couldn't load ${initial.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (isApprovedPlugin(initial.url)) void load()
  else setStatus('blocked', `${initial.name} isn't on the approved plugin list, so it wasn't loaded.`)

  const ready = () => {
    if (!instance) throw new Error('The plugin is not loaded.')
    return instance
  }

  const plugin: PluginHandle = {
    get status() {
      return status
    },
    get error() {
      return error
    },
    onStatusChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    createGui: () => ready().createGui(),
    destroyGui: (gui) => instance?.destroyGui(gui),
    async getState() {
      const state = await ready().audioNode.getState()
      knownState = state
      return state
    },
  }

  function stopAll(time: number) {
    if (!instance) return
    instance.audioNode.clearEvents()
    const offs = [...held].filter(([, end]) => end > time).map(([pitch]) => midi(time, [NOTE_OFF, pitch, 0]))
    if (offs.length > 0) instance.audioNode.scheduleEvents(...offs)
    held.clear()
  }

  return {
    plugin,

    play(note: EngineNote) {
      // Still loading (or couldn't load): the note is skipped, like a muted channel.
      if (!instance) return
      const start = Math.max(note.time, context.currentTime)
      const end = start + note.duration
      instance.audioNode.scheduleEvents(
        midi(start, [NOTE_ON, note.pitch, midiVelocity(note.velocity)]),
        midi(end, [NOTE_OFF, note.pitch, 0]),
      )
      held.set(note.pitch, Math.max(end, held.get(note.pitch) ?? 0))
    },

    update(next: Instrument) {
      const state = (next as WamPlugin).state
      if (sameState(state, knownState)) return
      knownState = state
      // While loading, load() picks up knownState once the plugin exists.
      const target = state ?? defaultState
      if (instance && target != null) void instance.audioNode.setState(target)
    },

    stopAll,

    dispose() {
      disposed = true
      if (!instance) return
      stopAll(context.currentTime)
      const node = instance.audioNode
      instance = null
      // Let the note-offs finish their release a little before tearing down.
      setTimeout(() => {
        node.disconnect()
        node.destroy()
      }, 50)
    },
  }
}
