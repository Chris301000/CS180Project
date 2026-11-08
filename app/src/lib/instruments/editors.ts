// Which component draws each instrument's controls: its "interface". Each
// instrument owns its editor completely, so one can be a row of knobs and
// another something much stranger, like FL's Delay Lama. A WAM plugin's
// editor shows the plugin's own interface.

import type { Component } from 'svelte'
import type { AudioBackend } from '../audio/backend'
import BasicSynthEditor from './BasicSynthEditor.svelte'
import FmSynthEditor from './FmSynthEditor.svelte'
import WamEditor from './WamEditor.svelte'
import type { InstrumentOf, InstrumentType } from './definitions'

/** The parts of the audio engine an editor may use, to reach a live plugin. */
export type PluginHost = Pick<AudioBackend, 'start' | 'getPlugin' | 'onChannelsChange'>

/** What every instrument editor is given. */
export interface EditorProps<T> {
  instrument: T
  /** A live change while a control is moving (so the sound follows). Not an undo step. */
  onInput: (next: T) => void
  /** A finished change, e.g. a knob released. One undo step. */
  onChange: (next: T) => void
  /** The channel this instrument plays on. Only plugin editors need it, with `audio`. */
  channelId: string
  audio: PluginHost
  /**
   * For editors whose size isn't known in advance (a plugin's own interface):
   * report the size they need, in pixels, so the window can fit them.
   */
  onPreferredSize?: (size: { width: number; height: number }) => void
}

export const EDITORS: { [K in InstrumentType]: Component<EditorProps<InstrumentOf<K>>> } = {
  basic: BasicSynthEditor,
  fm: FmSynthEditor,
  wam: WamEditor,
}
