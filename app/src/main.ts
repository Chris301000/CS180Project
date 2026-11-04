import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { WebAudioBackend } from './lib/audio/webAudioBackend'

const app = mount(App, {
  target: document.getElementById('app')!,
  props: { backend: new WebAudioBackend() },
})

export default app
