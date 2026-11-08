// WAM spike: can this app host a Web Audio Module instrument?
// Open /spike/wam.html on the dev server. Throwaway code; not part of the app.

import { initializeWamHost } from '@webaudiomodules/sdk'
import type { WamNode, WebAudioModule } from '@webaudiomodules/api'

const PLUGIN_URL = 'https://www.webaudiomodules.com/community/plugins/burns-audio/synth101/index.js'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const logEl = $('log')
const results: Record<string, unknown> = {}
;(window as unknown as { spike: typeof results }).spike = results

function log(label: string, value?: unknown) {
  const text = value === undefined ? label : `${label}: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`
  logEl.textContent += text + '\n'
  console.log('[wam-spike]', label, value)
}

let context: AudioContext
let plugin: WebAudioModule<WamNode>
let analyser: AnalyserNode

/** Loudest sample the analyser saw over `ms` milliseconds, to tell whether sound came out. */
async function peakOver(ms: number) {
  const buffer = new Float32Array(analyser.fftSize)
  let peak = 0
  const end = performance.now() + ms
  while (performance.now() < end) {
    analyser.getFloatTimeDomainData(buffer)
    for (const v of buffer) peak = Math.max(peak, Math.abs(v))
    await new Promise((r) => setTimeout(r, 10))
  }
  return peak
}

$('start').onclick = async () => {
  try {
    const t0 = performance.now()
    context = new AudioContext()
    await context.resume()
    const [groupId] = await initializeWamHost(context)
    log('host ready', `${Math.round(performance.now() - t0)}ms`)

    const t1 = performance.now()
    const module = await import(/* @vite-ignore */ PLUGIN_URL)
    const WAM = module.default
    plugin = await WAM.createInstance(groupId, context)
    results.loadMs = Math.round(performance.now() - t1)
    results.descriptor = plugin.descriptor
    log('plugin loaded', `${results.loadMs}ms`)
    log('descriptor', plugin.descriptor)

    analyser = context.createAnalyser()
    analyser.fftSize = 2048
    plugin.audioNode.connect(analyser).connect(context.destination)
    results.silentPeak = await peakOver(200)
    log('peak before any note', results.silentPeak)

    const gui = await plugin.createGui()
    $('gui').appendChild(gui)
    results.gui = { tag: gui.tagName, width: (gui as HTMLElement).offsetWidth, height: (gui as HTMLElement).offsetHeight }
    log('gui', results.gui)

    const info = await plugin.audioNode.getParameterInfo()
    results.parameters = Object.values(info).map((p) => `${p.id} (${p.type}, ${p.minValue}–${p.maxValue}, default ${p.defaultValue})`)
    log('parameters', results.parameters)

    // Does the node tell us when its settings change (e.g. from its own GUI)?
    results.events = []
    for (const type of ['wam-automation', 'wam-midi', 'wam-info']) {
      plugin.audioNode.addEventListener(type, (e) => {
        ;(results.events as unknown[]).push({ type, detail: (e as CustomEvent).detail })
        log(`event ${type}`, (e as CustomEvent).detail)
      })
    }

    $('note').removeAttribute('disabled')
    $('state').removeAttribute('disabled')
    results.ready = true
  } catch (err) {
    results.error = String(err)
    log('FAILED', String(err))
    console.error(err)
  }
}

$('note').onclick = async () => {
  // Note on now, note off half a second later, both with exact audio times,
  // the way the app's scheduler would send them.
  const now = context.currentTime
  plugin.audioNode.scheduleEvents(
    { type: 'wam-midi', time: now + 0.05, data: { bytes: [0x90, 60, 100] } },
    { type: 'wam-midi', time: now + 0.55, data: { bytes: [0x80, 60, 0] } },
  )
  results.notePeak = await peakOver(600)
  log('peak while the note plays', results.notePeak)
  results.afterPeak = await peakOver(1500)
  log('peak after note off (release tail)', results.afterPeak)
}

$('state').onclick = async () => {
  const state = await plugin.audioNode.getState()
  const json = JSON.stringify(state)
  results.state = state
  results.stateJsonRoundTrips = JSON.stringify(JSON.parse(json)) === json
  results.stateBytes = json.length
  log('state', state)
  log('state survives JSON', results.stateJsonRoundTrips)

  // Restoring: change a value through setState and read it back.
  if (state && typeof state === 'object') {
    await plugin.audioNode.setState(state)
    log('setState with the same state: ok')
  }
}
