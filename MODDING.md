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

## Mods page and reviewed source modules

**Mods** in the sidebar manages the installed settings pack. Enable/disable persists across restarts. Disabling hides its theme/template choices and falls back to a built-in theme when necessary; existing compositions and local media remain intact. Removing a pack does not delete recordings. This beta supports one settings pack at a time.

The executable module catalog is explicit and source-reviewed: `src/mods/catalog.js` includes the optional, off-by-default Latitude Streaming module. There is no arbitrary JavaScript installer or online marketplace. A trusted source build can register a lazy entry:

```js
{
  manifest: {
    id: "my-output", name: "My output", version: "0.1.0",
    author: "Contributor", description: "An optional output tool.",
    apiVersion: 1, capabilities: ["studio-output"],
  },
  load: () => import("./my-output/index.js"),
}
```

The module exports `async activate({ apiVersion, services })` and `async deactivate()`. Activation receives only its declared services; unsupported API versions/services are rejected before code loads. Disabled modules remain unloaded. Changes are blocked during recording, streaming, countdown, export, or another module's transition. Failed activation calls cleanup, including after partial initialization; cleanup must be idempotent and release every timer, listener, stream, and resource owned by the module. Failed deactivation remains visibly enabled so the user can retry.

This is a lifecycle contract for trusted source, **not a security sandbox**. Imported settings packs cannot register executable modules. Do not weaken Electron isolation, CSP, or Linux permissions to install a mod. Enabling a module should expose its controls, not immediately transmit media, start capture, or read unrelated files; starting those operations needs an explicit user action.

Version 0.8 supplies three narrow services for the official Streaming module:

| Service | Contract |
| --- | --- |
| `live-output` | `format()` reads the Studio format. `acquire({onFrame,onAudio,onFault})` returns a lease with `sampleRate`, `started`, idempotent `release()`. Video timestamps are microseconds relative to acquisition; PCM messages carry absolute AudioContext frames. `activity()` locks incompatible operations through reconnects. `setStop()` registers application shutdown. |
| `stream-transport` | `start({server,key,audioKbps})`, serial `write(id,bytes)`, `stop(id)`, `onState(callback)`. RTMP/RTMPS only; no arbitrary shell arguments or output paths. |
| `workspace-panel` | Mount/remove a sidebar page and preview status; show a page/toast; read/write non-secret module preferences. Reviewed source HTML only. Never store credentials in preferences. |

The module encodes AVC using WebCodecs, preferring hardware with software fallback. Only while live, the worklet sends the existing limited stereo mix in 2,048-frame float PCM messages. A small Matroska writer carries timestamped AVC/PCM. Bundled FFmpeg copies video and encodes AAC once. A one-client Node relay verifies RTMPS certificates/hostnames. The key stays in memory but is passed to the child process: other processes running as the same OS user may inspect its arguments or memory. Keys never enter status events, diagnostics, logs, settings, or packs.

Bounds: at most two waiting video frames before skipping; 24 initial PCM chunks awaiting AVC configuration; 4 MiB transport queue/packet cap; 4-second native write deadline; 20-second first-media deadline; 15-second socket inactivity deadline; 1.5-second forced-stop fallback. Three retries (2/4/8 seconds) create fresh codec headers, clock origin and keyframe. Recording pause/stop and live-output stop are independent. Simultaneous recording adds its own encode but shares composition and DSP. Exports are blocked while broadcasting.

The older `studio-output` service remains compatible with recording-bound cloned-MediaStream providers. Standalone streaming uses the new live-output lease. Linux 0.8 adds network permission; simply enabling a mod opens no listener or connection.

A downloadable executable-mod catalog is a later milestone. Signed/reviewed packages, compatibility, permissions, rollback and isolation need design first. This beta bundles a small lazy first-party module. Do not turn arbitrary URLs or settings packs into script loaders.

Latitude 0.9 includes the optional `latitude-editor` reference module. Its manifest requests `workspace-panel` and `editor-project`; the recorder imports no editor implementation while it is disabled. The editor lazily registers its page, styles, fonts and media resources, and tears them down on disable.

`editor-project` provides `available`, `call(operation, data)`, `onProgress(callback)` (returns an unsubscribe function), `takes()`, `isBusy()` and `activity(boolean)`. Native operations are restricted to `import`, `take`, `open`, `save`, `draft`, `draft-info`, `restore`, `relink`, `preview`, `waveform`, `export`, `cancel`, `reveal` and `dispose`. Open/save/import/relink/export destinations use native dialogs. Renderer requests carry registered media IDs; they cannot request arbitrary paths through the media protocol. Byte-range responses keep scrubbing bounded. Native exports refuse to run alongside live capture or streaming.

`src/mods/editor/model.js` owns version-1 `.latitude-edit` timeline validation and pure editing operations. `render-plan.js` compiles bounded intervals; `electron/editor.cjs` resolves files, builds cancelable jobs, then processes dialogue continuously and measures the delivered mix. The project JSON has `schema: "latitude-edit"`, `version: 1`, `project`, and `media` references relative to the project location. It contains no executable code. Keep original sources intact. See [the editor guide](docs/EDITOR.md) for limits.

Future editor modules can extend the reviewed source catalog and version the project schema. Do not silently change existing version-1 meaning. Automatic captions/filler-word detection remain future work: local model downloads, CPU/memory, accuracy and reviewable proposed cuts need explicit design. Do not load transcription while idle. Manrope and DM Serif Display are bundled under SIL OFL 1.1 with their notices; settings packs cannot install executable code or fonts.

## Source map

- `src/design.js`: pure layout normalization, geometry, registries, and pack validation.
- `src/scene-model.js`: source schema, migration, hit testing, snapping, transforms, bitrate.
- `src/scene-editor.js`: direct editing, layer inspector, undo/redo, source actions.
- `src/assets-store.js`: local images and portable pack assets.
- `src/extensions.js`: experimental output-provider lifecycle.
- `src/mods/`: installed-add-on UI and lazy trusted-module lifecycle.
- `src/video-quality.js`: native capture constraints, deadline pacing, and output-pixel geometry.
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

This older provider API still requires local recording. Use the new live-output lease for standalone broadcast ownership; the Streaming module is an implementation example. Settings packs cannot execute code or register providers. Keep networking opt-in; native plugins require a separately isolated host and crash handling.

## Export formats

`src/export-formats.js` is a platform-independent registry shared by the interface and the Node export worker. It defines each format's codecs, guidance, supported flags and safe option normalization. `src/export-ui.js` builds the settings/dialog controls from that registry. `electron/export-media.cjs` owns file creation, while the recording store owns cancellation, loudness measurement and atomic manifest commits.

A new format needs a registry entry, compatible encoder/container flags, plain size/compatibility notes, and real encode/decode coverage in `tests/formats.test.cjs`. Verify both separate-source and mix-only modes, duration, playback, raw-original retention and the exact bundled Windows and Linux encoders. Do not accept arbitrary command-line flags from imported packs. Keep slow export conversion outside the live capture/output-provider path. Adding a format does not require a new UI framework or DSP dependency.

## Linux platform boundary

`electron/capture-platform.cjs` selects the Wayland portal vs. thumbnail picker. `electron/linux-audio.cjs` owns a single helper process; `native/linux-audio.c` owns a single temporary audio-server module. The renderer connects that source through the same Web Audio input used by desktop loopback on Windows. Do not duplicate capture, change the user's system defaults, or load native plugins through settings packs. The Linux input bridge still uses a temporary audio-server source instead of PCM IPC. Version 0.8 adds network permission and bounded PCM messages for the finished live-output mix only. Disabled streaming sends no packets.
