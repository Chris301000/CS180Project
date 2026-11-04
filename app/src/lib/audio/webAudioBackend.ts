import { pitchToFrequency, type AudioBackend, type ScheduledNote } from './backend'

/** Per-voice level, low enough that a few notes at once don't clip. */
const VOICE_GAIN = 0.25
/** Fade used by stopAll, in seconds, so cut-off notes don't click. */
const STOP_FADE = 0.01

interface Voice {
  oscillator: OscillatorNode
  gain: GainNode
}

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

  playNote({ pitch, time, duration, velocity, synth }: ScheduledNote) {
    const { context, master } = this
    if (!context || !master) return

    const start = Math.max(time, context.currentTime)
    const releaseAt = start + Math.max(duration, synth.attack)
    const end = releaseAt + synth.release
    const peak = VOICE_GAIN * velocity

    const oscillator = context.createOscillator()
    oscillator.type = synth.wave
    oscillator.frequency.value = pitchToFrequency(pitch)

    // Fading in and out avoids a click at each end of the note.
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peak, start + synth.attack)
    gain.gain.setValueAtTime(peak, releaseAt)
    gain.gain.linearRampToValueAtTime(0, end)

    oscillator.connect(gain).connect(master)
    oscillator.start(start)
    oscillator.stop(end)

    const voice = { oscillator, gain }
    this.voices.add(voice)
    oscillator.onended = () => {
      gain.disconnect()
      this.voices.delete(voice)
    }
  }

  stopAll() {
    if (!this.context) return
    const now = this.context.currentTime
    for (const { oscillator, gain } of this.voices) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setTargetAtTime(0, now, STOP_FADE / 3)
      oscillator.stop(now + STOP_FADE)
    }
  }

  setMasterGain(gain: number) {
    this.masterGain = gain
    if (this.master) this.master.gain.value = gain
  }
}
