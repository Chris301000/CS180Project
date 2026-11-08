import type { AudioBackend, ScheduledNote } from './backend'
import { startVoice, type Voice } from './voices'

export class WebAudioBackend implements AudioBackend {
  // Created on first start(), because browsers object to one made without a user gesture.
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private masterGain = 1
  private voices = new Set<Voice>()

  now() {
    return this.context?.currentTime ?? 0
  }

  async start() {
    if (!this.context) {
      this.context = new AudioContext()
      this.master = this.context.createGain()
      this.master.gain.value = this.masterGain
      this.master.connect(this.context.destination)
    }
    await this.context.resume()
  }

  /** Each instrument type builds its own sound (see voices.ts). */
  playNote(note: ScheduledNote) {
    const { context, master } = this
    if (!context || !master) return
    const voice = startVoice(context, master, note)
    this.voices.add(voice)
    voice.onEnded = () => this.voices.delete(voice)
  }

  stopAll() {
    if (!this.context) return
    const now = this.context.currentTime
    for (const voice of this.voices) voice.stop(now)
  }

  setMasterGain(gain: number) {
    this.masterGain = gain
    if (this.master) this.master.gain.value = gain
  }
}
