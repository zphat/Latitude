# Latitude

A Windows-first, local screen recorder built around clear podcast audio. Version **0.3.0 — early beta**.

[Windows beta downloads](https://github.com/zphat/Latitude/releases) · [Report a bug](https://github.com/zphat/Latitude/issues) · [Contributing](CONTRIBUTING.md) · [Modding](MODDING.md)

Record your screen, optional facecam, microphones, and desktop audio. Shape your voice in a focused audio studio, arrange sources directly in the preview, and export synchronized isolated tracks for editing. No account or streaming setup is required to record.

## Open the Windows app

1. Extract **the entire Windows ZIP** into a normal folder, such as `Documents\Latitude`.
2. Open **Latitude.exe** inside that folder. Keep the surrounding files with it.
3. You do not need Node.js, OBS, an account, or a separate FFmpeg installation for the packaged Windows build.

The application is unsigned, so Windows may identify it as an unknown publisher. It does not require administrator privileges. This is a new build: do a short hardware test before relying on it for an irreplaceable episode.

## New in Latitude 0.3

- **Click, drag, resize any source.** Corner handles preserve proportions; Shift switches aspect lock. Snap guides align edges and centers; Alt bypasses snapping. Scene layers has exact output-pixel position/size, crop, fit/fill, mirror, shape, opacity, visibility, lock, and layer order.
- **Text and graphics.** Add multiline titles with five fonts, size, bold/italic, alignment, solid or gradient colors, outline, and shadow. Add local PNG/JPEG/WebP images and gradient color panels. Up to 40 layers per scene. Editing handles are never recorded.
- **Undo, redo, duplicate, copy scene.** Each scene stores its own composition and crops. Video layers share existing screen A/B and camera streams, avoiding duplicate capture/audio. Preview editing locks during recording; explicitly unlock it for live adjustment.
- **Microphone-only onboarding.** Connect/test Voice 1 or skip. Templates are optional studio controls and replace the destination scene without changing audio processing. Saved microphones can reconnect on launch; disable this in Settings if preferred.
- **Five themes.** Signal pairs Sundial-inspired charcoal/green with prominent `#d1ff4a`. Dusk and Linen offer soft dark/light alternatives. Golden latitude pairs ocean ink with brass; Tide pairs deep teal with warm coral. Themes affect the interface, not recorded footage.
- **720p, 1080p, 1440p, or 4K at 30/60 fps.** Efficient, Balanced, and High detail bitrate choices, storage estimates, and automatic H.264 preference. H.264 capture exports by copying the picture stream; VP8 compatibility capture uses an H.264 export encode. Actual frame rate depends on devices and hardware.
- **Lower preview overhead.** Balanced/Economy previews render at up to 720p; Detailed at up to 1080p. Recording uses the selected full resolution. Static scenes redraw when changed; inactive pages stop live preview updates. Text has a bounded raster cache, unused decoded images and transition buffers are released, captures are shared, and disabled audio lanes do not send PCM copies to the writer. The compositor controls frame pacing without a second capture timer.
- **Portable compositions.** Packs include scene layers and local image assets. Images live outside preference JSON. Packs contain settings and image data, never executable code. MODDING.md documents the schema and experimental output-provider seam for source forks.

**Rich clarity** remains an optional voice enhancement: fuller body, less boxiness, and focused presence without an airy boost. Separate tracks, soundcheck, clipping warnings, voice processing, and final loudness/true-peak measurement remain central to Latitude.

## Your first recording

1. Name the session in the top bar.
2. Click **Choose a screen**, then select a monitor or window. Windows desktop capture uses playback from the **default Windows output device**. Play something and verify the Desktop meter.
3. Open **Inputs & outputs**. Choose your microphone under Voice 1, and leave Voice 2 off unless needed. Click **Connect selected devices**.
4. If you want a facecam, click **Camera**, choose your webcam, and apply it. Its microphone is not automatically added. Camera is optional.
5. Open **Check** for a 12-second soundcheck. Stay quiet for three seconds, then speak naturally. Apply the suggestion if appropriate.
6. Pick **Natural voice** or **Podcast broadcast** in Voice Studio. Open a processing module for its controls. The **Rich clarity** slider adds fuller body, less boxiness, and focused vocal presence; start around 25–35% and toggle Clarity on/off to compare. It does not add an air shelf or remove noise underneath speech.
7. Choose a scene. Click a source to move/resize it, or use **Crop this source** in Scene layers to remove tabs/taskbar. **Add source** adds titles, images, and backgrounds. Click **Start recording**. Pause, add edit markers, and switch scenes as needed.
8. Stop. The original take is saved first. Automatic export then makes an editing pack; you can disable auto-export in Settings.
9. In **Takes**, use **Play** to open the video in your media player, or **Open files** for the session/export folder.

## What is implemented

- Screen or window capture; webcam; 720p, 1080p, 1440p, or 4K; selectable 30 or 60 fps.
- Five scene layouts: screen plus facecam, full camera, two screen views, screen only, and an editable intermission/title card.
- Cut, dissolve, and slide transitions; configurable transition duration; independently positioned/cropped sources; text and image overlays.
- Two microphone lanes, each with independent gain, mute, settings, and a mono isolated track.
- Left/right selection for stereo interfaces. Assign the same interface to both lanes with different channels for two microphones.
- Windows system loopback or a selected virtual-cable/loopback audio input; stereo desktop gain/mute; optional speech-triggered ducking in the full mix.
- Monitoring output selection. Software microphone monitoring is for setup; it automatically stops when recording system audio to avoid duplicate capture. Use hardware direct monitoring when possible.
- Natural, Broadcast, Untreated room, Soft spoken, and Music/clean presets, remembered per input device.
- High-pass filter; four EQ bands; downward expander; soft-knee compressor; split-band de-esser; optional Rich clarity body/presence processing.
- Stereo-linked 5 ms lookahead sample-peak limiters on voices, desktop, and the full mix; raw clipping indicators; gain-reduction readout.
- Input delay adjustments of 0–500 ms for lip-sync correction when audio arrives early.
- Pause/resume, countdown with cancellation, scene hotkeys, markers, playback, quick mute-all, and small-window recording controls.
- Continuous disk writing, low-space stop, bounded write queue, large-file RF64 support, preserved originals, and recovery export for interrupted sessions.
- Two-pass loudness normalization of the final mix, with a report measuring the encoded MP4’s actual loudness and true peak.

## Editing in CapCut

Each **Export** folder contains:

| File | Purpose |
| --- | --- |
| `Recording.mp4` | H.264 video. The first audio stream is the full mix. Further streams hold each enabled voice and desktop source. |
| `Voice 1.wav`, `Voice 2.wav` | Processed, isolated mono voices, when enabled. 24-bit PCM. |
| `Desktop.wav` | Isolated stereo desktop sound, when enabled. 24-bit PCM. |
| `Mix.wav` | The final stereo mix, with optional loudness normalization. 24-bit PCM. |
| `Voice 1 original.wav`, `Voice 2 original.wav` | Floating-point voice backups before gain, EQ, compression, de-essing, and limiting. Source mute still applies. |
| `Audio report.json` | Measured loudness, true peak, normalization mode, track list, and timing. |
| `Markers.csv` | Edit markers with times and labels. |

CapCut versions differ in how they expose multiple audio streams embedded in one video. This app cannot add a stream selector to CapCut. The reliable editing workflow is to import the MP4 and isolated WAVs, place them at the **same timeline start**, mute the video’s mixed audio, and group/link the clips before cutting. Audio stems are captured on one sample clock and share the same duration.

For your preferred “different audio on each instance of the same clip” workflow, enable **Separate video copies for each audio track** on export. The export adds `Voice 1 only.mp4`, `Voice 2 only.mp4`, and `Desktop only.mp4` as applicable. Each uses the same encoded video and one isolated soundtrack, so you can choose the version you want for each clip. This duplicates video storage but does not re-encode the picture.

Do not play all MP4 audio streams together. They contain the full mix plus its components. Use the mix **or** the isolated sources.

## Sound and routing notes

- Input gain starts at 0 dB. Aim for raw voice peaks around −12 to −6 dBFS. If the interface/microphone already clipped, lowering a software fader cannot restore it. Lower hardware gain.
- The live limiters protect **sample peaks** at −1.5 dBFS. They are not advertised as oversampled true-peak limiters. The final mix export uses FFmpeg’s loudness/true-peak processing and measures the encoded result. If AAC overshoots the intended margin, the app flags it.
- The default final mix target is −16 LUFS. This is an adjustable starting point, not a guarantee of ideal loudness for every show. Silent material remains silent. Isolated stems are not separately normalized, preserving their relative balance for editing.
- Original voice backups cannot recover clipping that happened in hardware. Float storage preserves the captured samples; it does not turn a conventional mic/interface into a 32-bit-float recorder.
- A downward expander quiets gaps. It does not remove background sound while you speak. Optional browser noise suppression may help, but can alter the voice.
- Desktop ducking changes only the full mix. The desktop stem stays at its selected level. Muting a voice also mutes its original backup. Muting the **Full mix** alone leaves isolated tracks intact; **Mute all** mutes every source.
- Set the default Windows playback output **before** connecting the screen. If you change it, stop the take and reconnect capture. To record a specifically routed output, use a virtual cable or interface loopback input in the Desktop selector. Arbitrary WASAPI endpoint selection and per-app process capture are not implemented.
- Audio stems share one clock; camera/driver and browser capture latency can still affect A/V alignment. Make a clap test. Positive audio delay helps when audio arrives early. This build does not provide negative delay or automatic webcam latency correction.
- Device changes are made between takes. A disconnected source becomes silence or a blank picture region while other tracks continue; reconnect before the next take.
- Files can be large: Settings estimates video storage. All six audio originals together add up to roughly 6.9 GB/hour. Allow additional export space. Extra per-track video copies use additional space.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Start / stop | Ctrl + Shift + R |
| Pause / resume | Ctrl + Shift + P |
| Mute Voice 1 | Ctrl + Shift + M |
| Add edit marker | Ctrl + Shift + B; also B while the app is focused |
| Scenes 1–5 | Ctrl + Shift + 1–5 |
| Undo / redo edits | Ctrl + Z / Ctrl + Shift + Z (or Ctrl + Y) |
| Duplicate layer | Ctrl + D |
| Remove selected layer | Delete / Backspace |
| Nudge selected layer | Arrows; Shift for 10 output pixels |
| Temporarily bypass snapping | Alt while dragging |
| Toggle resize aspect behavior | Shift while dragging a corner |

Conflicts with another app are shown in Settings. Global shortcuts can be disabled there.

## Recovery

Every take lives in its own folder under your recording location, initially `Videos\Latitude`. The raw capture (`capture.mkv` for H.264, `capture.webm` for VP8), float WAVs, and `session.json` stay there after export.

If the app crashes, reopen it and look in **Takes** for an interrupted session. **Recover & export** repairs WAV sizes and attempts to process the partial capture. A partial/corrupted final video cluster may be unrecoverable, so recovery is best effort. Do not delete or rename session contents until your editing project is finished.

## What still needs real-world testing

This build has automated DSP, file-writing, export, and browser recording tests, including pause/resume, source mute, scene changes, synchronized stems, and four embedded audio streams. See `BUILD-REPORT.md` for the exact verification performed.

**Windows hardware capture, your webcam/mic drivers, output-device routing, global shortcuts in other programs, and long-session stability still need testing on your computer.** This environment could not run a Windows desktop session. The app is an early beta, not a claim of OBS-level reliability or commercial DAW mastering quality.

VST/AU hosting, AI restoration, per-application audio capture, simultaneous multiple webcams, independently recorded camera video, custom hotkey remapping, hardware video encoder selection, and automatic echo/latency correction are not included. The five scene slots are independent compositions, with up to 40 layers each. Each layer has its own crop. Templates replace the destination scene and legacy layout defaults. Applying a new template can reveal areas hidden by a previous crop, so review the preview before recording. Linux/macOS source development is possible, but this delivery targets Windows x64. Electron and bundled FFmpeg make the download substantial; no claim that Latitude is smaller or faster than OBS has been benchmarked. Higher recording settings and extra sources use more resources.

## Run or modify the source

Install Node.js 22.12 or newer. In the source folder:

```sh
npm ci
npm run setup
npm start
```

The Windows source archive also includes `Start Latitude.cmd`, which performs setup on first launch. Source setup needs internet access to download dependencies. The packaged Windows app does not.

```sh
npm test                     # DSP, storage, and FFmpeg integration tests
npm run preview              # Browser interface preview, not a recording substitute
npm run pack:win             # Builds an unpacked Windows app; needs vendor/ffmpeg.exe
```

A Git checkout does not contain the encoder executable. On Windows, run `node scripts/prepare-encoder.cjs` after `npm ci` and before packaging. Run `npm run dist:win -- --publish never` to produce a Windows ZIP. See [RELEASING.md](RELEASING.md) for the release procedure. CI checks source changes on Linux; the optional **Build Windows package** workflow creates a Windows test artifact without publishing a release.

`tests/ui.cjs` checks the recording/export pipeline; `tests/framing-ui.cjs` checks editing and actual cropped pixels; `tests/quality-ui.cjs` checks resolution, encoded frames, text, and output-provider lifecycle. Install Playwright separately and provide `TAKE_TEST_BROWSER` if its Chromium is not in the usual location. It records synthetic media, checks pause/mute behavior, and verifies actual exports with `ffprobe`. `ffprobe` must be available for the integration tests. `TAKE_FFMPEG` can override the export binary during development.

Upgrading from Take Studio retains an existing local profile and recording folder when available. The internal `take://app` origin and IPC bridge name remain stable to preserve old preferences; they are not visible branding.

Architecture: secure Electron shell and IPC bridge; browser canvas scene compositor; one AudioWorklet graph for all audio tracks; direct incremental disk writer; FFmpeg for final encoding, loudness normalization, and muxing. Recording and export do not send your media to a service.

## Technical references

- Canvas frame capture: https://www.w3.org/TR/mediacapture-fromelement/
- Electron screen capture: https://www.electronjs.org/docs/latest/api/desktop-capturer
- Electron display-media and permission handling: https://www.electronjs.org/docs/latest/api/session
- FFmpeg loudness filters: https://ffmpeg.org/ffmpeg-filters.html#loudnorm
- CapCut audio import and mixing: https://www.capcut.com/tools/audio-mixing

Application source is MIT licensed. Bundled runtime and encoder components have their own licenses; see `THIRD-PARTY-NOTICES.md`.
