// Which component draws each instrument's controls: its "interface". Each
// instrument owns its editor completely, so one can be a row of knobs and
// another something much stranger, like FL's Delay Lama.

import type { Component } from 'svelte'
import BasicSynthEditor from './BasicSynthEditor.svelte'
import FmSynthEditor from './FmSynthEditor.svelte'
import type { InstrumentOf, InstrumentType } from './definitions'

/** What every instrument editor is given. */
export interface EditorProps<T> {
  instrument: T
  /** A live change while a control is moving (so the sound follows). Not an undo step. */
  onInput: (next: T) => void
  /** A finished change, e.g. a knob released. One undo step. */
  onChange: (next: T) => void
}

export const EDITORS: { [K in InstrumentType]: Component<EditorProps<InstrumentOf<K>>> } = {
  basic: BasicSynthEditor,
  fm: FmSynthEditor,
}
