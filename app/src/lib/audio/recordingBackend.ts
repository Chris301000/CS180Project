import type { AudioBackend, ChannelSetup, ScheduledNote } from './backend'

/** An AudioBackend that makes no sound and records what it was asked to do, for tests. */
export class RecordingBackend implements AudioBackend {
  time = 0
  gain = 1
  starts = 0
  stops = 0
  notes: ScheduledNote[] = []
  /** The channels from the latest setChannels, and how many times it was called. */
  channels: ChannelSetup[] = []
  channelSyncs = 0

  now() {
    return this.time
  }

  async start() {
    this.starts++
  }

  setChannels(channels: ChannelSetup[]) {
    this.channels = channels
    this.channelSyncs++
  }

  playNote(note: ScheduledNote) {
    this.notes.push(note)
  }

  stopAll() {
    this.stops++
  }

  setMasterGain(gain: number) {
    this.gain = gain
  }
}
