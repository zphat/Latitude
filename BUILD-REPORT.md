# Latitude 0.5.0 — format and export review

## Scope

This pass adds explicit source separation, eight output formats, persistent output defaults, per-take overrides, format guidance and format-aware playback. MP4 remains the default. The underlying recording writes recoverable video and float audio first; export conversion happens after recording. All existing Windows installation behavior is retained.

The shared format registry has no platform or renderer dependencies. The exporter is split into media creation and recording-store lifecycle/normalization. No runtime dependency, UI framework, always-running timer, DSP stage or background service was added. The bundled Electron/FFmpeg versions are unchanged. New format controls update only on interaction.

## Automated verification

**46 tests pass** (34 prior tests plus 12 format tests/subtests). The existing DSP, meter, delay, mute, lifecycle, crop, storage/RF64, recovery, cancellation and disk-write tests remain green.

The new tests use the actual encoder to create and decode files, rather than inspecting command arguments alone:

- MP4/H.264/AAC, MKV/H.264/FLAC, MOV/H.264/PCM, WebM/VP9/Opus, WAV, FLAC, MP3 and M4A.
- Separate-source and mix-only variants of all eight formats. Distinct test tones verify actual Full mix / Voice 1 / Voice 2 / Desktop routing, not merely track counts.
- Four audio streams embedded in video, or separate source files for audio-only export. Full mix is first. Playback opens the correct latest output.
- WAV, FLAC, MKV/FLAC and MOV/PCM decode to identical 24-bit source samples. 44.1 kHz originals also export correctly through the 48 kHz Opus path.
- Non-MP4 editor copies contain one correct source; normalized output loudness and true peak are measured from the delivered file.
- Audio-only export succeeds without a video capture file. Unknown formats fail before creating an export folder. Legacy MP4 playback works; out-of-take paths are rejected.
- Compact exports write no hidden editing WAVs; original PCM files remain unchanged; progress never regresses; completed folders have no incomplete marker.

A fresh `npm ci --ignore-scripts` validates the unchanged dependency versions and updated application version. The Windows release gate runs the format suite using the exact bundled encoder as well as Linux CI's encoder.

## Browser regression and visual review

The real AudioWorklet → MediaRecorder → disk → FFmpeg test produced **245,760 aligned audio frames (5.120 s)** across six stems. Recorded video lasted **5.129 s**, a **9 ms duration difference**. Pause/resume, voice mute including raw backup, scenes, markers, four embedded MP4 audio streams and per-source video copies passed with zero renderer errors. The generated mix measured **−16.02 LUFS / −9.48 dBTP**. These synthetic signals are routing evidence, not a real-speech listening assessment.

Scene-editor checks passed drag/resize, undo, text gradients, images/packs, independent cropping, camera placement, two screen views, stop while paused and graphic-only recording. Decoded video had **zero excluded crop pixels**. At 1100×740 the mixer bottom was 619 px, the recording bar began at 630 px and the button ended at 684 px.

Idle checks confirmed the compositor timer stops for a static scene and audio suspends after microphones disconnect. Concurrent input setup, sticky clip reset and reviewable diagnostics passed. These preserve the previous optimization pass; no new DSP speed claim is made.

The format UI test covers all eight descriptions and three suggested formats, hidden/disabled incompatible controls, persistence after reload, one-off overrides, remembered defaults, unchanged recording quality/loudness defaults, and reachable actions at 1100/960-pixel widths. The export dialog was visually reviewed at 1400×1000. Renderer errors across these checks: **0**.

## Optimization measurement

`TAKE_FFMPEG=/usr/bin/ffmpeg node scripts/benchmark-export.cjs` compares the same 30-second 320×180 synthetic H.264 take, two mono mics and stereo desktop. Both variants retain four embedded audio tracks and use H.264 stream copy, with no extra video copies. Three trials per mode alternate order. Results are in [docs/qa/export-benchmark-0.5.0.json](docs/qa/export-benchmark-0.5.0.json).

| Export choice                               |  Delivered media | Median wall time |
| ------------------------------------------- | ---------------: | ---------------: |
| With WAV editing copies and raw mic backups | 40,512,003 bytes |        11,816 ms |
| Without duplicate editing files             |  3,071,759 bytes |        11,665 ms |

This example saves about **92% of export-folder media space**, without removing embedded sources. Export time is similar; the small timing difference is not a demonstrated CPU improvement. Retained originals are excluded from both sizes. Real video dominates larger/high-motion recordings, so the percentage is not a universal forecast.

Other efficiency safeguards remain: only one encoder process at a time, four-thread cap on video conversion, no encode/export overlap with recording, bounded logs and queues, and stream copy for compatible H.264 video and per-source clips. WebM's optional VP9 conversion costs more time/CPU and is labeled accordingly.

## Windows release gate and limits

Publication requires Linux tests, all format tests with the bundled Windows encoder, archive/encoder/license verification, a real installation, desktop/Start menu shortcut validation, packaged renderer + registry + encoder launch from an unrelated directory, uninstall retaining user data, and transferred checksum verification. Failed gates prevent publication.

Real Windows screen/window capture, loopback devices, microphone/webcam drivers, external global shortcuts, long-session drift/disk pressure and listening still need hardware feedback. Neither the synthetic tests nor installed-app smoke checks replace that. Live limiters protect sample peaks and cannot repair clipped hardware input. CapCut may not expose alternate embedded tracks; MP4/WAV editing files or per-source video copies are the fallback.

This release does not claim 4K/60 on every machine, best-in-class audio, or lower whole-app resource use than OBS. Prior high-resolution and DSP microbenchmark results remain in the [0.4 build review](https://github.com/zphat/Latitude/blob/v0.4.0/BUILD-REPORT.md). Linux capture/audio integration is the next milestone, followed by a separately validated Linux beta; optional feature expansion need not block that work.
