# Extending Latitude

Latitude's application source is MIT licensed. Start with settings packs for UI themes and layouts; edit source for new DSP, capture behavior, or scene types. Packs do **not** load JavaScript, CSS, URLs, native code, or VST plugins.

## Settings packs

In Settings, **Export my layout** saves the selected theme, scene composition, source transforms, independent crops, and embedded local images. **Import pack** validates a JSON file and displays what will be added before applying it. One community pack is installed at a time; built-ins remain available. Packs never carry device IDs or credentials. A maximum of eight themes and eight templates fits in 12 MB, including image assets.

The format is `{"version":1,"name":"My pack","themes":[],"templates":[]}`. At least one theme or template is required. See `examples/field-notes.json` for a complete example.

Themes have `name`, `note`, `scheme` (`dark` or `light`), and `colors`. Required colors are `bg`, `panel`, `panel2`, `line`, `text`, `muted`, `faint`, `accent`, `highlight`, `ink`, `green`, `red`, and `amber`. Every color must be a six-digit hex value. `ink` is foreground text on accent/highlight buttons. Keep readable contrast for text on surfaces and ink on accent buttons. Theme changes affect the app UI, not captured footage.

Templates have `name`, `note`, `scene`, `preset`, and `layout`. Scenes are `present`, `camera`, `split`, `screen`, or `break`; presets are `natural`, `broadcast`, `room`, `soft`, or `clean`. The legacy `preset` field remains accepted for format compatibility. Applying a template replaces its destination composition and layout defaults without changing microphone processing or audio gain.

`layout` supports:

| Key            | Values                                                             |
| -------------- | ------------------------------------------------------------------ |
| `secondary`    | `same` (reuse A) or `independent` (a separately connected B)       |
| `axis`         | `horizontal` or `vertical`                                         |
| `split`        | 0.2 to 0.8, fraction reserved for A                                |
| `gap`          | 0 to 80 pixels in the 1920 × 1080 composition                      |
| `fit`          | `contain` or `cover` (can trim edges)                              |
| `overlay`      | Boolean; optional facecam over Two views                           |
| `cameraAspect` | `wide`, `classic`, `square`, or `circle`                           |
| `crops`        | `a`, `b`, `camera`; each is normalized `{x,y,w,h}` within 0–1      |
| `facecams`     | `present` and `split`; normalized `{x,y,w}`; height follows aspect |

Coordinates are relative to the source for crops and the composition for facecams. Import clamps invalid geometry to safe bounds. IDs are assigned internally. Unknown data is ignored, never executed. Input devices must still be explicitly connected. Use an exported pack as a base; do not use packs to hide a screen without checking the actual preview.

## Source map

- `src/design.js`: pure layout normalization, geometry, registries, and pack validation.
- `src/scene-model.js`: source schema, migration, hit testing, snapping, transforms, bitrate.
- `src/scene-editor.js`: direct editing, layer inspector, undo/redo, source actions.
- `src/assets-store.js`: local images and portable pack assets.
- `src/extensions.js`: experimental output-provider lifecycle.
- `src/compositor.js`: source-to-canvas rendering; separate from all editor overlays.
- `src/studio-tools.js`: onboarding, themes, crop editor, layout controls, and packs.
- `src/engine.js`: device streams, shared audio graph, MediaRecorder, and write queue.
- `audio/dsp.js`: deterministic audio primitives and voice presets.
- `audio/studio-worklet.js`: one sample clock for all isolated stems and mix.
- `electron/recording.cjs`: incremental WAV and video storage, recovery, and FFmpeg export.
- `electron/main.cjs` / `preload.cjs`: trusted-origin permissions and narrow IPC bridge.

Keep user media local by default. Never add synchronous IO or unbounded allocations to the per-sample audio loop. Adding latency to DSP requires matching the processed, original, and desktop stem delays. Avoid adding a third-party plugin loader to the sandboxed renderer; native audio plugins require a separately isolated host and crash handling, which are not implemented here.

## Layer schema

A template can include `composition`, an ordered array of up to 40 layers. Last item appears on top. Without it, the legacy `layout` generates the composition. Layers support:

| Fields                                            | Meaning                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `id`, `name`, `type`                              | Identifier, label, and `video`, `text`, `image`, or `color`                            |
| `x`, `y`, `w`, `h`                                | Normalized composition rectangle, clamped to canvas bounds                             |
| `visible`, `locked`, `opacity`, `aspectLock`      | Layer and editing preferences                                                          |
| `source`, `crop`, `fit`, `mirror`, `shape`        | Video a/b/camera; normalized crop; contain/cover; reflection; rectangle/rounded/circle |
| `text`, `font`, `size`, `bold`, `italic`, `align` | Text style; size uses a 1920 × 1080 reference canvas                                   |
| `color`, `color2`, `gradient`, `angle`            | Six-digit colors and gradient controls                                                 |
| `outline`, `outlineColor`, `shadow`               | Text edges/shadow                                                                      |
| `asset`                                           | ID of a locally stored or embedded image                                               |

Optional pack `assets` maps IDs to PNG/JPEG/WebP base64 data URLs. Imports decode and validate images, storing them in IndexedDB instead of preference JSON. Local image imports are capped at 12 MB and 32 megapixels; longest edge is reduced to 3840 pixels. Pack images are limited to 4 million data-URL characters each. IDs, colors, fonts, and geometry are sanitized. No image URL or executable payload is loaded. Export a layout as a working example.

The compositor owns frame pacing; canvas capture uses captureStream(0) and requests a frame after each completed draw, without a second frame-rate timer. Keep this single timing policy when modifying outputs. Text caches have a 32 MiB budget; images unused by the current transition are released. Do not add synchronous IO, unbounded allocations, or per-frame network requests.

## Experimental output providers

`engine.outputs` is a small source-level seam, not a finished streaming plugin system. Trusted source forks can register an ID with async `start` and `stop` functions. During an active recording, `start(id, options)` passes a cloned composed-video/full-mix MediaStream, API version 1, sample rate, width, height, requested fps, and options.

```js
engine.outputs.register({
  id: "my-output",
  async start({ stream, width, height, fps, sampleRate, options }) {
    // Connect an explicitly configured output in your source fork.
  },
  async stop() {
    // Release resources owned by the provider.
  },
});
await engine.outputs.start("my-output", {});
await engine.outputs.stop("my-output");
```

Stopping a provider ends its cloned tracks while the recorder's original streams remain live. Recorder shutdown stops all providers with a bounded wait. Providers must clean up resources they allocate, including failed starts.

Standalone streaming, network/credential UI, protocols, permissions, backpressure, pause semantics, and independent output start/stop need additional work. Version 1 requires local recording and is not a completed RTMP/WebRTC implementation. Settings packs cannot execute code or register providers. Keep networking opt-in; native plugins require a separately isolated host and crash handling.

## Export formats

`src/export-formats.js` is a platform-independent registry shared by the interface and the Node export worker. It defines each format's codecs, guidance, supported flags and safe option normalization. `src/export-ui.js` builds the settings/dialog controls from that registry. `electron/export-media.cjs` owns file creation, while the recording store owns cancellation, loudness measurement and atomic manifest commits.

A new format needs a registry entry, compatible encoder/container flags, plain size/compatibility notes, and real encode/decode coverage in `tests/formats.test.cjs`. Verify both separate-source and mix-only modes, duration, playback, raw-original retention and the exact bundled Windows and Linux encoders. Do not accept arbitrary command-line flags from imported packs. Keep slow export conversion outside the live capture/output-provider path. Adding a format does not require a new UI framework or DSP dependency.

## Linux platform boundary

`electron/capture-platform.cjs` selects the Wayland portal vs. thumbnail picker. `electron/linux-audio.cjs` owns a single helper process; `native/linux-audio.c` owns a single temporary audio-server module. The renderer connects that source through the same Web Audio input used by desktop loopback on Windows. Do not add raw PCM IPC, change the user's system defaults, or load arbitrary native plugins through scene packs. The Flatpak intentionally has no network permission; a future streaming distribution would need an explicit permission change and a separate output-provider implementation.
