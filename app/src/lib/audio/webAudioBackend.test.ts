import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebAudioBackend } from './webAudioBackend'
import { volumeToGain, type ChannelSetup } from './backend'
import { createInstrument } from '../instruments/definitions'

// jsdom has no Web Audio, so this is a small stand-in for an AudioContext
// that records what gets built and connected. Enough to check the channel
// bookkeeping; what it sounds like is checked by ear.

class FakeParam {
  value = 0
  targets: number[] = []
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  cancelScheduledValues() {}
  setTargetAtTime(value: number) {
    this.targets.push(value)
  }
}

class FakeNode {
  outputs: FakeNode[] = []
  connect(node: FakeNode) {
    this.outputs.push(node)
    return node
  }
  disconnect() {
    this.outputs = []
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam()
}

class FakeOscillator extends FakeNode {
  type = 'sine'
  frequency = new FakeParam()
  stops: number[] = []
  onended: (() => void) | null = null
  start() {}
  stop(time: number) {
    this.stops.push(time)
  }
}

class FakeContext {
  currentTime = 0
  destination = new FakeNode()
  gains: FakeGain[] = []
  oscillators: FakeOscillator[] = []
  createGain() {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
  createOscillator() {
    const o = new FakeOscillator()
    this.oscillators.push(o)
    return o
  }
  async resume() {}
}

let context: FakeContext

beforeEach(() => {
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      context = new FakeContext()
      return context
    }),
  )
  vi.useFakeTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const basic = createInstrument('basic')
const channel = (id: string, changes: Partial<ChannelSetup> = {}): ChannelSetup => ({ id, instrument: basic, volume: 1, ...changes })
const note = (channelId: string) => ({ channelId, pitch: 60, time: 0, duration: 0.5, velocity: 1 })

async function started() {
  const backend = new WebAudioBackend()
  await backend.start()
  const master = context.gains[0]
  /** The volume nodes of the channels, in the order they were made. */
  const channelGains = () => context.gains.filter((g) => g.outputs.includes(master))
  return { backend, master, channelGains }
}

describe('WebAudioBackend channels', () => {
  it('gives each channel its own volume node into the master', async () => {
    const { backend, channelGains } = await started()
    backend.setChannels([channel('a', { volume: 0.5 }), channel('b')])
    expect(channelGains().map((g) => g.gain.value)).toEqual([volumeToGain(0.5), 1])
  })

  it('builds channels set up before audio started, once it starts', async () => {
    const backend = new WebAudioBackend()
    backend.setChannels([channel('a')])
    await backend.start()
    expect(context.gains.filter((g) => g.outputs.includes(context.gains[0]))).toHaveLength(1)
  })

  it('plays a note on its own channel', async () => {
    const { backend, channelGains } = await started()
    backend.setChannels([channel('a'), channel('b')])
    backend.playNote(note('b'))
    // The note's envelope is the newest gain node; it feeds channel b's volume.
    expect(context.gains.at(-1)!.outputs).toEqual([channelGains()[1]])
  })

  it('ignores notes for a channel that does not exist', async () => {
    const { backend } = await started()
    backend.setChannels([channel('a')])
    const before = context.oscillators.length
    backend.playNote(note('missing'))
    expect(context.oscillators).toHaveLength(before)
  })

  it('changes the volume of a channel in place, so sounding notes follow it', async () => {
    const { backend, channelGains } = await started()
    backend.setChannels([channel('a')])
    const gain = channelGains()[0]
    backend.setChannels([channel('a', { volume: 0.5 })])
    expect(channelGains()).toEqual([gain])
    expect(gain.gain.targets).toEqual([volumeToGain(0.5)])
  })

  it('keeps a channel and its sounding notes when only its settings change', async () => {
    const { backend } = await started()
    backend.setChannels([channel('a')])
    backend.playNote(note('a'))
    const osc = context.oscillators.at(-1)!
    backend.setChannels([channel('a', { instrument: { ...basic, wave: 'square' } })])
    expect(osc.stops).toHaveLength(1) // Only its own scheduled end, not a cut.
    backend.playNote(note('a'))
    expect(context.oscillators.at(-1)!.type).toBe('square')
  })

  it('swaps in a new engine when the instrument type changes, silencing the old one', async () => {
    const { backend } = await started()
    backend.setChannels([channel('a')])
    backend.playNote(note('a'))
    const old = context.oscillators.at(-1)!
    backend.setChannels([channel('a', { instrument: createInstrument('fm') })])
    expect(old.stops.length).toBe(2) // Its scheduled end, then the cut.
    backend.playNote(note('a'))
    // FM voices are two oscillators: a carrier and a modulator.
    expect(context.oscillators.length).toBe(3)
  })

  it('removes channels that are gone, silencing and then disconnecting them', async () => {
    const { backend, channelGains } = await started()
    backend.setChannels([channel('a'), channel('b')])
    backend.playNote(note('a'))
    const osc = context.oscillators.at(-1)!
    const gain = channelGains()[0]
    backend.setChannels([channel('b')])
    expect(osc.stops.length).toBe(2)
    vi.advanceTimersByTime(100)
    expect(gain.outputs).toEqual([])
    backend.playNote(note('a'))
    expect(context.oscillators.at(-1)).toBe(osc)
  })

  it('stops every channel on stopAll', async () => {
    const { backend } = await started()
    backend.setChannels([channel('a'), channel('b')])
    backend.playNote(note('a'))
    backend.playNote(note('b'))
    backend.stopAll()
    expect(context.oscillators.map((o) => o.stops.length)).toEqual([2, 2])
  })
})
