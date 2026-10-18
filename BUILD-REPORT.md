# Latitude 0.3.0 — build and review report

Direct source editing, independent crops, text/gradient/image/color sources, undo/redo, microphone-only onboarding, five themes, 1440p/4K settings, quality controls, and an experimental output-provider seam are implemented. Podcast audio and separate synchronized tracks remain the main workflow.

## Verification

- **21 automated tests passed.** Tests cover DSP limiter ceilings, stereo linking, mute/bypass, compression, Rich clarity response, exact crop bounds, geometry migration, aspect-preserving resize, snapping, selection order, safe pack validation, readable theme contrast, bitrate scaling, WAV/RF64 writing, interrupted recovery, silence, real FFmpeg exports, and cleanup after failed final metadata writes.
- The browser AudioWorklet → MediaRecorder → disk writer → FFmpeg test recorded **242,944 aligned audio frames (5.0613 seconds)** with two synthetic microphones and desktop audio. Video duration was **5.0510 seconds**; A/V duration difference was **10.3 ms**.
- Pause/resume, scene changes, markers, voice presets, microphone setup, mute including original backup, four embedded audio streams, and per-source video copies passed with **zero renderer errors**.
- The exported synthetic mix measured **-16.03 LUFS / -10.28 dBTP**. These test signals do not predict levels for real speech. The video export used **H.264 stream copy**.
- Direct editing checks passed: drag/resize, undo, gradient text, font changes, duplicate, visibility, lock, image import, embedded-image pack export/import, independent camera position, circle bounds, two captures, five themes, and output-resolution selection.
- A requested desktop sound; B requested picture only. An actual decoded frame contained **zero excluded browser/taskbar pixels** after cropping A/B to separate red/blue regions. Stop while paused passed, and disabled mic lanes wrote only empty WAV headers.
- Graphic-only recording passed both without capture devices and with a connected but unused camera. The intentional graphics scene remained selected.
- At **1100 × 740**, the mixer ended at y=619, recording controls began at y=630, and the record button ended at y=684: no overlap. The studio and editor screens were visually inspected.
- Output-provider checks confirmed cloned video/audio tracks; stopping the provider ended its clones while the recorder's original video track stayed live.
- `npm ci --dry-run --ignore-scripts` passes. The packaged application has no production JavaScript framework dependency. FFmpeg lookup and packaging dependencies are development-only; the Windows app contains the encoder resource.

## Recorded video measurements

Synthetic moving 1080p content plus gradient text was captured with the real H.264 encoder. GPU acceleration was disabled in the test browser. Encoded rate below is decoded frames divided by audio duration, including startup/stop. These short checks are not comparative hardware benchmarks.

| Requested output | Decoded frames | Audio duration | Encoded frames / second | Compositor rate |
| --- | ---: | ---: | ---: | ---: |
| 1080p / 30 fps | 184 | 6.083 s | 30.25 fps | 30.16 fps |
| 1080p / 60 fps | 365 | 6.075 s | 60.09 fps | 59.93 fps |
| 2160p / 60 fps | 131 | 6.696 s | 19.56 fps | 20.12 fps |

The compositor owns frame pacing; removing a redundant capture-rate timer fixed dropped frames at 1080p. Requested 4K dimensions and gradient text were verified, but **this host did not sustain 4K/60**. Encoder, GPU, CPU, source format, and scene complexity determine real performance. The live indicator measures compositing, not guaranteed saved FPS.

## Resource and usability review

Balanced/Economy previews use up to 720p; Detailed preview uses up to 1080p. Recording uses the selected full resolution. Static scenes redraw on changes; inactive pages stop live preview updates. Text raster caches are capped at 32 MiB; images unused by current scenes/transitions are released. Image imports are bounded, layers share captures, transition buffers are temporary, and disabled audio lanes do not send PCM copies. Gain conversions are cached outside the per-sample loop. H.264 export copies video instead of encoding it again.

Final fixes cover imported source IDs, refreshing cached images after pack import, keeping image bytes out of preferences, voice/source inspector navigation, auto-lock during recording, late source-connection races, 2 MiB video IPC chunks, recording cleanup after final write failure, and unwanted camera-driven scene switching. Source is formatted for contributors. MODDING.md documents settings packs and the experimental code-level output seam.

## Windows package verification

The Windows x64 build completed successfully. **23 packaged files** match the working source byte-for-byte. Executable product name is **Latitude**, version **0.3.0.0**, with **6 icon resolutions**. Embedded ASAR header integrity matches its SHA-256. The packaged encoder matches the supplied binary; README and third-party notices match their sources. ZIP integrity and packaged EXE/ASAR bytes are checked before delivery.

## Remaining hardware checks and limits

The packaged app could not be run in a Windows desktop session here. Actual monitor/window capture, system loopback endpoints, webcam/mic drivers, monitoring output selection, global shortcuts in other programs, and long-session stability still need a Windows hardware test. Generated signals and mocked capture selection do not verify those OS paths.

One webcam and two screen/window capture sources are supported. Multiple physical webcams, separate camera-video recording, VST/AU hosting, AI restoration, per-app audio isolation, custom global-hotkey remapping, and explicit hardware-encoder selection are not implemented. The output API requires local recording and is not a finished streaming mod. Rich clarity cannot repair hardware clipping or remove noise underneath speech.

This is an unsigned beta. Electron and FFmpeg make the download substantial; no claim that Latitude is smaller or faster than OBS has been benchmarked. Application code is MIT licensed, with separate runtime/encoder licenses. This report records verification before GitHub publication; repository and release setup are separate from the application build.
