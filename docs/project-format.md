# Project format

A project is one JSON file. Run `clipframe schema` for the exact JSON Schema, and `clipframe validate project.json` to check a file.

```jsonc
{
  "version": 1,
  "meta": {
    "name": "launch",          // also the default output file name
    "format": "16:9",          // 16:9 · 9:16 · 1:1 · 4:5 · 4:3
    "fps": 30,                 // 30 · 60
    "resolution": "1080p"      // 720p · 1080p
  },
  "theme": {
    "primary": "#7C3AED", "secondary": "#22D3EE",
    "background": "#0B0B12", "text": "#FFFFFF",
    "font": "Inter",           // Inter · Poppins · Hind Siliguri · Noto Sans Bengali (or any font you load)
    "radius": 16               // corner radius of cards and frames, in px at 1080p
  },
  "assets": [
    { "id": "shot",  "type": "image", "file": "assets/dashboard.png" },
    { "id": "clip",  "type": "video", "file": "assets/demo.mp4" },
    { "id": "song",  "type": "audio", "file": "assets/music.mp3" },
    { "id": "pop",   "type": "audio", "file": "assets/pop.wav" }
  ],
  "scenes": [
    // played one after another; `transition` blends in from the scene before
    { "id": "s1", "block": "title-reveal", "duration": 3, "props": { "title": "Hello" } },
    { "id": "s2", "block": "video", "duration": 5, "props": { "asset": "clip", "start": 2 },
      "transition": { "type": "fade", "duration": 0.5 } }   // none · fade · slide · zoom · wipe
  ],
  "overlays": [
    // drawn on top of the scenes between `start` and `end` (seconds from the start of the video)
    { "id": "o1", "block": "lower-third", "start": 1, "end": 4, "props": { "title": "Sam Rivera" } }
  ],
  "audio": {
    "music": "song",           // audio asset id
    "volume": 0.7,             // 0–1
    "fadeOut": 1.5,            // seconds at the end
    "duck": 0.3,               // music level while a video with sound or the voice plays (1 = no ducking)
    "musicStart": 0,           // start this far into the song
    "voice": "narration",      // optional voice-over, from the start
    "voiceVolume": 1
  },
  "sounds": [
    { "t": 3, "asset": "pop", "gain_db": -3 }   // one-shot sound effects
  ]
}
```

## Rules

- Each scene and overlay `id` is unique. Short ids such as `s1` and `o1` work well.
- `props` are checked against the block's schema. Missing props take the block's defaults. See [blocks.md](blocks.md).
- Overlays must use overlay blocks (`lower-third`, `captions`, `watermark`), and scenes must use the other blocks.
- Asset `file` paths are relative to the project file. They can also be absolute URLs.
- Any prop whose name is `asset` or ends in `Asset` must name an asset that exists in `assets`.
- The length of the video is the sum of the scene durations. A transition overlaps the start of its scene and does not add time.

## Editing with ops

`applyOps(project, ops, lookup)` applies a list of edits atomically. If any edit fails or the result is invalid, you get the original project back with the errors. These ops work well for an AI or an undo stack:

`add_scene` · `update_scene` · `remove_scene` · `move_scene` · `add_overlay` · `update_overlay` · `remove_overlay` · `set_theme` · `set_meta` · `set_audio` · `add_asset` · `update_asset` · `remove_asset` · `set_sounds`

```ts
applyOps(project, [
  { op: "add_scene", scene: { block: "stats-counter", props: { items: [{ value: 128, label: "Teams" }] } } },
  { op: "update_scene", id: "s1", patch: { props: { title: "New title" } } },
  { op: "set_theme", patch: { primary: "#F97316" } },
]);
```
