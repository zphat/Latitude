# Latitude 0.4.0 — beta review

## Changes reviewed

A per-user Windows installer replaces the portable ZIP as the recommended download. Desktop/Start menu shortcuts and uninstall support keep runtime files in their installation directory. Recordings and preferences remain separate and survive uninstall.

The review covered DSP hot paths, audio/video lifecycle, scene scheduling, export resources, fault recovery, ordinary controls, and beta feedback. Unused voice lanes skip processing, disabled Rich clarity sleeps, neutral EQ bands skip filters, and meter logarithms run at meter rate. Idle audio contexts suspend and static/hidden previews stop scheduling. Settings writes are debounced; text caches retain the 32 MiB cap and accommodate 40 layers.

Fixes preserve unchanged delay buffers through gain/mute edits, crossfade processing bypass, protect headphone monitoring, keep ducking responsive during bypass, serialize initialization/start/finalization, bound capture-stop waits, detect zero-byte disk writes, and finalize interrupted takes. Export cancellation preserves originals and previous exports, metadata commits atomically, progress advances within stages, and encoding cannot compete with a live take. H.264 picture streams still copy on export. Input clipping warnings hold until reset; save-and-close, shortcut fallback, compact layouts and reviewable local diagnostics were checked.

## Automated and browser verification

- **34 tests passed**: all voice presets, 44.1/48 kHz, invalid settings, sample ceilings, stereo linking, compression, mute/bypass, Rich clarity response/sleep, sync-delay continuity, unused lanes, protected monitor sum, pause/resume sample alignment, reduced hidden meters, initialization/finalization races and timeouts, crop geometry, packs/themes, WAV/RF64, recovery, actual FFmpeg exports, canceled exports and stalled writes.
- The real browser AudioWorklet → MediaRecorder → disk → FFmpeg pipeline produced **245,888 aligned audio frames (5.1227 s)** across six stems with two synthetic voices and desktop audio. Video lasted **5.141 s**, an **18.3 ms duration difference**. Pause/resume, mute including raw backup, scene changes, markers, four embedded audio streams and optional per-track video copies passed. Renderer errors: **0**.
- The synthetic exported mix measured **−16.01 LUFS / −12.53 dBTP**, with H.264 stream-copy video. These generated tones do not predict how real speech will sound.
- Drag/resize, undo, text gradients, image packs, independent crops/camera position, and two views passed. Decoded recorded frames contained **zero excluded crop pixels**. Stop-while-paused and graphic-only recording passed.
- Idle scheduling tests verified no compositor timer for a static scene and a suspended audio context after both microphones disconnect. Concurrent microphone setup, held/reset clip warnings, reviewable diagnostics, and 1100/960-pixel layouts passed with **0** renderer errors. The 1100×740 studio and diagnostics were visually reviewed; recording controls do not overlap the mixer.
- Installed-app configuration validates against the pinned electron-builder schema. No new runtime framework or DSP dependency was added.

## Video measurements

Real H.264 recording of synthetic moving content plus gradient text, with GPU acceleration disabled in Chromium 153. Encoded rate is decoded frame count / audio duration, including startup and shutdown. The final 1080p/30 check followed restoration of the reviewed source; the higher-format checks were performed during the same polish pass.

| Requested  | Frames | Audio duration | Encoded fps | Compositor fps |
| ---------- | -----: | -------------: | ----------: | -------------: |
| 1080p / 30 |    183 |        6.072 s |       30.14 |          30.02 |
| 1080p / 60 |    348 |        6.192 s |       56.20 |          58.92 |
| 2160p / 60 |     83 |        7.707 s |       10.77 |          15.35 |

Explicit frame requests after completed draws fixed a capture-pacing issue observed at 1080p/30. This CPU-only host **does not sustain 4K/60**. Those dimensions/settings are supported, but saved FPS depends on capture devices, CPU/GPU, encoder and scene complexity. The live FPS indicator measures compositing, not guaranteed encoded FPS.

## Audio processing comparison

`npm run bench:audio`: 48 kHz, 20 seconds of audio, median of five trials after warm-up, serial runs on the same host / Node 24.19.0. Baseline is commit b07ca75 (0.3.0). Raw results are in docs/qa/audio-benchmark-0.4.0.json.

| Worklet scenario                | 0.3 time | 0.4 time |                Change |
| ------------------------------- | -------: | -------: | --------------------: |
| Idle, before context suspension |   457 ms |   127 ms | 72% less worklet time |
| One natural voice               |   951 ms |   713 ms | 25% less worklet time |
| Two podcast voices + desktop    |   789 ms |   754 ms |  4% less worklet time |

These are microbenchmarks, **not whole-app CPU, memory or OBS comparisons**. Different scenarios exercise different optimized paths and cannot be compared as CPU scaling predictions. In the application an unused context subsequently suspends altogether. Capture/encoding can dominate total resource use, especially with software 4K encoding. The Electron/FFmpeg runtime size is not materially reduced by these code changes.

## Windows release gate

The release workflow builds the installer and portable ZIP on Windows, verifies package contents, pinned encoder hash and licenses, installs under a disposable account, verifies desktop/Start menu shortcut targets, launches the packaged renderer and encoder from an unrelated working directory, and uninstalls while preserving a user-data marker. Both asset checksums are verified after transfer before publication. **Publishing is gated on these checks**; a failed gate prevents the release.

## Remaining beta work

Real Windows monitor/window capture, system loopback routing, microphone/webcam drivers, external global shortcuts, long takes and real-world listening still need user hardware feedback. The pipeline's installed-app smoke test is not a physical-device test. Start with the short procedure in BETA-TESTING.md before an important episode.

The app remains unsigned. One webcam is supported; multi-webcam capture, separate camera video, VST/AU hosting, AI restoration, per-app audio capture, explicit hardware-encoder selection and a finished streaming mod are not included. Live limiters guard sample peaks; they cannot repair hardware clipping. Linux packaging and platform capture validation are the next milestone, documented in ROADMAP.md. No claim of best-in-class audio or smaller/faster-than-OBS performance is made without comparative hardware/listening evidence.
