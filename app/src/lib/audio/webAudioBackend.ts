import { volumeToGain, type AudioBackend, type ChannelSetup, type ScheduledNote } from './backend'
import { createEngine, type InstrumentEngine } from './voices'

/** How long a volume change takes to settle, in seconds. Short, but long enough not to click. */
const VOLUME_SMOOTHING = 0.01

/** A channel's live parts: its instrument's engine, feeding its own volume node into the master. */
interface Channel {
  setup: ChannelSetup
  gain: GainNode
  engine: InstrumentEngine
}

export class WebAudioBackend implements AudioBackend {
  // Created on first start(), because browsers object to one made without a user gesture.
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private masterGain = 1
  private channels = new Map<string, Channel>()
  /** The latest setChannels, kept so channels can be built once the context exists. */
  private wanted: ChannelSetup[] = []

  now() {
    return this.context?.currentTime ?? 0
  }

  async start() {
    if (!this.context) {
      this.context = new AudioContext()
      this.master = this.context.createGain()
      this.master.gain.value = this.masterGain
      this.master.connect(this.context.destination)
      this.setChannels(this.wanted)
    }
    await this.context.resume()
  }

  setChannels(channels: ChannelSetup[]) {
    this.wanted = channels
    const { context, master } = this
    if (!context || !master) return

    const ids = new Set(channels.map((c) => c.id))
    for (const [id, channel] of this.channels) {
      if (!ids.has(id)) this.removeChannel(id, channel)
    }

    for (const setup of channels) {
      const channel = this.channels.get(setup.id)
      if (!channel) {
        const gain = context.createGain()
        gain.gain.value = volumeToGain(setup.volume)
        gain.connect(master)
        this.channels.set(setup.id, { setup, gain, engine: createEngine(context, gain, setup.instrument) })
        continue
      }
      if (setup.volume !== channel.setup.volume) {
        // Volume is on the channel, so it changes notes already sounding too.
        channel.gain.gain.setTargetAtTime(volumeToGain(setup.volume), context.currentTime, VOLUME_SMOOTHING / 3)
      }
      // Instruments are replaced, never changed in place, so a new object means new settings.
      if (setup.instrument !== channel.setup.instrument) {
        if (setup.instrument.type === channel.setup.instrument.type) {
          channel.engine.update(setup.instrument)
        } else {
          // A different kind of instrument: swap in a new engine, like loading another plugin.
          channel.engine.dispose()
          channel.engine = createEngine(context, channel.gain, setup.instrument)
        }
      }
      channel.setup = setup
    }
  }

  playNote({ channelId, ...note }: ScheduledNote) {
    this.channels.get(channelId)?.engine.play(note)
  }

  stopAll() {
    if (!this.context) return
    const now = this.context.currentTime
    for (const channel of this.channels.values()) channel.engine.stopAll(now)
  }

  setMasterGain(gain: number) {
    this.masterGain = gain
    if (this.master) this.master.gain.value = gain
  }

  private removeChannel(id: string, channel: Channel) {
    channel.engine.dispose()
    // Disconnect after the stop fade, so a ringing note doesn't click off.
    const { gain } = channel
    setTimeout(() => gain.disconnect(), 50)
    this.channels.delete(id)
  }
}
