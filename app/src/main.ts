import { mount } from 'svelte'
import './app.css'
import AuthGate from './lib/auth/AuthGate.svelte'
import { WebAudioBackend } from './lib/audio/webAudioBackend'

const app = mount(AuthGate, {
  target: document.getElementById('app')!,
  props: { backend: new WebAudioBackend() },
})

export default app
