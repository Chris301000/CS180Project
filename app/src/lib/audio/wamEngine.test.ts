import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWamEngine, type WamLoader } from './wamEngine'
import { createWamInstrument, WAM_PLUGINS, type WamPlugin } from '../instruments/definitions'

// A stand-in for a loaded plugin, recording what the engine asks of it.
class FakeWamNode {
  events: { time: number; bytes: number[] }[] = []
  cleared = 0
  setStates: unknown[] = []
  connectedTo: unknown = null
  destroyed = false
  constructor(public state: unknown) {}
  scheduleEvents(...events: { time: number; data: { bytes: number[] } }[]) {
    this.events.push(...events.map((e) => ({ time: e.time, bytes: e.data.bytes })))
  }
  clearEvents() {
    this.cleared++
  }
  async getState() {
    return this.state
  }
  async setState(state: unknown) {
    this.setStates.push(state)
    this.state = state
  }
  connect(node: unknown) {
    this.connectedTo = node
  }
  disconnect() {
    this.connectedTo = null
  }
  destroy() {
    this.destroyed = true
  }
}

const DEFAULTS = { cutoff: 0.2 }

function fakeLoader(options: { fail?: boolean } = {}) {
  const nodes: FakeWamNode[] = []
  const loader: WamLoader = {
    host: async () => 'group',
    load: vi.fn(async () => {
      if (options.fail) throw new Error('network down')
      return {
        async createInstance(_group: string, _context: BaseAudioContext, initialState?: unknown) {
          const audioNode = new FakeWamNode(initialState ?? DEFAULTS)
          nodes.push(audioNode)
          return { audioNode, createGui: async () => document.createElement('div'), destroyGui() {} } as never
        },
      }
    }),
  }
  return { loader, nodes }
}

const context = { currentTime: 0 } as AudioContext
const output = { name: 'channel volume' } as unknown as AudioNode
const approved = (state: unknown = null): WamPlugin => ({ ...createWamInstrument(WAM_PLUGINS[0]), state })
const note = (time: number, pitch = 60) => ({ pitch, time, duration: 0.5, velocity: 1 })
/** Lets the engine's loading finish (it's all promises that resolve right away). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => vi.useRealTimers())

describe('loading', () => {
  it('loads an approved plugin with its saved settings and connects it to the channel', async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved({ cutoff: 0.7 }), loader)
    const changes = vi.fn()
    engine.plugin.onStatusChange(changes)
    expect(engine.plugin.status).toBe('loading')
    await settle()
    expect(engine.plugin.status).toBe('ready')
    expect(changes).toHaveBeenCalled()
    expect(nodes[0].state).toEqual({ cutoff: 0.7 })
    expect(nodes[0].connectedTo).toBe(output)
  })

  it('never loads a plugin that is not on the approved list', async () => {
    const { loader } = fakeLoader()
    const engine = createWamEngine(context, output, { ...approved(), url: 'https://example.com/evil.js' }, loader)
    await settle()
    expect(engine.plugin.status).toBe('blocked')
    expect(engine.plugin.error).toMatch(/approved/)
    expect(loader.load).not.toHaveBeenCalled()
  })

  it('reports a plugin that fails to load', async () => {
    const engine = createWamEngine(context, output, approved(), fakeLoader({ fail: true }).loader)
    await settle()
    expect(engine.plugin.status).toBe('failed')
    expect(engine.plugin.error).toMatch(/network down/)
  })
})

describe('notes', () => {
  it('skips notes while the plugin is still loading', async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved(), loader)
    engine.play(note(1))
    await settle()
    expect(nodes[0].events).toEqual([])
  })

  it('sends each note as a timed MIDI note-on and note-off', async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved(), loader)
    await settle()
    engine.play({ pitch: 64, time: 1, duration: 0.5, velocity: 0.5 })
    expect(nodes[0].events).toEqual([
      { time: 1, bytes: [0x90, 64, 64] },
      { time: 1.5, bytes: [0x80, 64, 0] },
    ])
  })

  it('stops by cancelling queued events and releasing notes still held', async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved(), loader)
    await settle()
    engine.play(note(0, 60))
    engine.play(note(2, 67))
    nodes[0].events = []
    engine.stopAll(0.25)
    expect(nodes[0].cleared).toBe(1)
    expect(nodes[0].events).toEqual([
      { time: 0.25, bytes: [0x80, 60, 0] },
      { time: 0.25, bytes: [0x80, 67, 0] },
    ])
  })
})

describe('settings', () => {
  it('pushes new settings into the plugin, ignoring float rounding', async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved({ cutoff: 0.2 }), loader)
    await settle()
    engine.update(approved({ cutoff: 0.20000000298023224 }))
    expect(nodes[0].setStates).toEqual([])
    engine.update(approved({ cutoff: 0.9 }))
    expect(nodes[0].setStates).toEqual([{ cutoff: 0.9 }])
  })

  it("doesn't push back settings the plugin itself just reported", async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved(), loader)
    await settle()
    nodes[0].state = { cutoff: 0.6 } // Changed in the plugin's own interface.
    const reported = await engine.plugin.getState()
    engine.update(approved(reported))
    expect(nodes[0].setStates).toEqual([])
  })

  it('restores the plugin defaults when settings go back to none (e.g. undo)', async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved(), loader)
    await settle()
    engine.update(approved({ cutoff: 0.9 }))
    engine.update(approved(null))
    expect(nodes[0].setStates).toEqual([{ cutoff: 0.9 }, DEFAULTS])
  })

  it('applies settings that arrive while loading once it has loaded', async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved({ cutoff: 0.2 }), loader)
    engine.update(approved({ cutoff: 0.5 }))
    await settle()
    expect(nodes[0].state).toEqual({ cutoff: 0.5 })
  })
})

describe('dispose', () => {
  it('releases notes, then disconnects and destroys the plugin', async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved(), loader)
    await settle()
    vi.useFakeTimers()
    engine.play(note(0))
    engine.dispose()
    expect(nodes[0].events.at(-1)!.bytes[0]).toBe(0x80)
    vi.advanceTimersByTime(100)
    expect(nodes[0].destroyed).toBe(true)
    expect(nodes[0].connectedTo).toBeNull()
  })

  it('destroys a plugin that finishes loading after it was disposed, without connecting it', async () => {
    const { loader, nodes } = fakeLoader()
    const engine = createWamEngine(context, output, approved(), loader)
    engine.dispose()
    await settle()
    expect(nodes[0].destroyed).toBe(true)
    expect(nodes[0].connectedTo).toBeNull()
  })
})
