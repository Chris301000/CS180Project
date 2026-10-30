# Architecture

The song data is the single source of truth. User controls change it through
`History`, the piano roll draws it, and the audio side reads it to make sound.
`Transport` owns playback position, so the playhead and the audio stay in sync.

Green boxes exist in the code today, and grey dashed boxes are planned. Arrows
show the direction data or commands flow. `SongData` appears in all three
diagrams, and it is the same object each time.

## Editing

Every change to the song goes through `History`, and the piano roll redraws from
the result.

```mermaid
flowchart LR
  Roll["PianoRoll"] -- "note edits" --> History["History"]
  UndoRedo["Undo / Redo"] -- "undo, redo" --> History
  Instruments["Instrument panel"] -- "add synth, change settings" --> History
  Tempo["Tempo control"] -- "tempo change" --> History
  Importer["Importer"] -- "validated song" --> History
  History -- "current song" --> Song["SongData<br/>notes, tracks, tempo, synth settings"]
  Song -- "redraw" --> Roll
  View["Zoom / Snap"] --> ViewState["View state<br/>zoom, snap, selection"]
  ViewState -- "layout" --> Roll

  classDef built fill:#d9f2c4,stroke:#5d9a36,color:#1c2b12
  classDef planned fill:#f3f3f3,stroke:#888,color:#222,stroke-dasharray:5 3
  class Roll,UndoRedo,View,History,Song,ViewState built
  class Instruments,Tempo,Importer planned
```

## Playback

`Transport` owns the position. The playhead and the audio both follow it.

```mermaid
flowchart LR
  Play["Play / Pause / Stop / Seek"] -- "commands" --> Transport["Transport<br/>position and clock"]
  Transport -- "playhead position" --> Roll["PianoRoll"]
  Transport -- "position, play state" --> Player["AudioPlayer<br/>schedules notes"]
  Song["SongData"] -- "notes, tempo" --> Player
  Song -- "synth settings" --> Synth["SynthRuntime<br/>voices and nodes"]
  Player -- "note events" --> Synth
  Synth -- "audio" --> Renderer["AudioRenderer<br/>mixes tracks"]
  Volume["Volume"] -- "master gain" --> Renderer
  Renderer -- "samples" --> Output["Audio output"]

  classDef built fill:#d9f2c4,stroke:#5d9a36,color:#1c2b12
  classDef planned fill:#f3f3f3,stroke:#888,color:#222,stroke-dasharray:5 3
  class Play,Transport,Roll,Song built
  class Player,Synth,Renderer,Volume,Output planned
```

## Files

```mermaid
flowchart LR
  Files["Save / Import / Export"] -- "save" --> Saver["Saver"]
  Song["SongData"] -- "serialized song" --> Saver
  Files -- "open file" --> Importer["Importer"]
  Importer -- "validated song" --> History["History"]
  Files -- "export" --> Wav["WAV export"]
  Song -- "song to render" --> Wav
  Wav -- "offline render" --> Renderer["AudioRenderer"]

  classDef built fill:#d9f2c4,stroke:#5d9a36,color:#1c2b12
  classDef planned fill:#f3f3f3,stroke:#888,color:#222,stroke-dasharray:5 3
  class Song,History built
  class Files,Saver,Importer,Wav,Renderer planned
```

## Rules

- **All song changes go through `History`.** That includes note edits, tempo,
  synth settings and imports, so undo always works and nothing bypasses it.
- **`SongData` stays plain and JSON-serializable.** It holds synth *settings*.
  Live voices and audio nodes belong to `SynthRuntime`, which is rebuilt from
  those settings.
- **`Transport` is the only owner of playback position.** It will use
  `AudioContext.currentTime` as its clock once audio exists.
- **View state is not song state.** Zoom, snap and selection are not saved with
  the song or tracked by undo.
- **`AudioRenderer` must not depend on real-time playback,** so WAV export can
  reuse it through `OfflineAudioContext`.
- **Imported songs are validated first,** and their note IDs must not collide
  with IDs created afterwards.

## Where it lives in the code

| Diagram box | Code |
| --- | --- |
| `PianoRoll` | `app/src/lib/pianoroll/PianoRoll.svelte` |
| `History` | `app/src/lib/song/history.ts` |
| `SongData` | `app/src/lib/song/song.ts`, changed through `edits.ts` |
| `Transport` | `app/src/lib/song/transport.ts` |
| Toolbar controls, wiring | `app/src/App.svelte` |

Selection currently lives inside `PianoRoll.svelte`, and zoom and snap in
`App.svelte`. There is no separate view-state module yet.
