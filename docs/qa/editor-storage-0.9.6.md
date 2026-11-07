# Editor and storage verification — 0.9.6

Local checks use Electron 44.8.0, Node 24 and Linux FFmpeg 7.1.5. Release workflows repeat native tests using the encoder each platform actually ships. Local success does not stand in for those jobs or physical capture-device testing.

## Observed defects and fixes

- The preview range input called pause before reading its new value; pause reset that value. Read the requested position first.
- Ruler clicks had no pointer-drag continuation, and the playhead ignored pointer input. Captured drag gestures now scrub continuously; clip scrubbing has a separate explicit tool.
- Canvas drawing ran before asynchronous media seeks completed. Keep one seek in flight per player, coalesce pointer moves, discard outdated requests, and draw the requested composition after its visible videos are ready.
- Raw MediaRecorder containers can lack seek indexes. Build a temporary, compressed-packet copy with an index. Preserve picture timestamps when audio encoder priming starts before zero. Export still reads the original.
- Direct export seeking to a fractional source frame discarded the frame containing that instant. Decode at most one second of lead-in and use explicit frame conversion/trim phases, matching the paused preview.
- Short windows could squeeze the preview to a strip. The editor has a smaller header, usable minimum preview/timeline heights, persistent navigation controls, independently scrollable panels, and existing layout persistence/reset. Very small effective windows scroll rather than hide controls.

## Checks

- `npm test`: 118 tests across DSP, limiter/meter behavior, recording/recovery, scene model, editor model, actual native exports, formats, updater and platform guards.
- `tests/editor-scrub-ui.cjs`: actual Electron pointer gestures and decoded binary frame IDs, not just labels. Slider, ruler drag while held, playhead dragging on a scrolled/zoomed timeline, rapid forward/backward requests, decoder reuse, unchanged project/history, Scrub over clips, typed timecode, arrows, Home/End, splits and source offsets. Checks 960×640, 1280×720 and larger windows at 100/125/150% zoom; screenshots are generated for visual inspection.
- The same test opens an unindexed H.264/Opus recording, checks several exact source frames, confirms original bytes are unchanged, and compares a rendered frame. It also compares actual exported frames after cutting 60 fps footage on a 24 fps timeline. Disabling the mod releases players and pending work.
- `tests/editor-mod-ui.cjs`: actual local media/IPC, audio preview, linked/ripple cuts, insertion, audio detachment, title movement, project save, real separate-track export, small-window layouts, scaling, keyboard navigation and mod teardown.
- `tests/formats-ui.cjs`: Studio/Settings quality synchronization, persisted audio storage/raw-backup choices, separate-track preservation by the space-saving preset, bitrate and FLAC choices, lossless-format disabling, export overrides and small-window access. Locally exercised in Electron's Chromium via a browser fixture because the standalone browser could not launch in the sandbox; the release validator uses Chromium.
- `tests/session-names-ui.cjs`: naming/rename persistence, recording and native export still work. Existing source paths and saved options survive rename/layout changes.
- `tests/storage-quality.test.cjs`: 24-bit samples within one least-significant bit, byte-exact float raw backups including samples above full scale, 44.1/48 kHz, correct RF64 sample counts, partial-frame recovery, real compressed exports with three audio streams, sample-identical decoded FLAC stems and unchanged originals.
- Mac publication guard tests remain separate and unchanged. Native Windows, Linux and both Mac release jobs must pass before their assets are published.

## Size measurement and limits

A deliberately high-bitrate, three-second 640×360 `testsrc2` H.264 fixture produced a 1,198,312-byte copied MP4 and a 491,785-byte Balanced-compression MP4: about 59% smaller. Full-frame SSIM against its source was 0.972. This is one synthetic regression fixture, **not** a prediction for gameplay/podcast footage or a perceptual-quality guarantee. Already-compressed footage can grow; compare a short representative export before selecting a stronger preset.

Processed 24-bit PCM uses exactly 25% fewer sample bytes than float32. Raw safety copies remain float32. This does not mean the whole take is 25% smaller: video, active sources, safety copies and duplicate exports all contribute. Compression keeps separate audio when requested; fewer copies save space without combining source tracks.

Live voice DSP, protection and streaming settings are unchanged. No new production dependency or continuously running worker was added. Paused navigation reuses the current clip's decoder; active overlapping layers still need their own players. Indexed raw previews temporarily duplicate compressed media; lighter proxies also need disk space. Both are removed when the editor mod is disabled. High-resolution/long-GOP decoding remains hardware dependent. SDR preview effects/audio are approximations; VFR, unusual timestamps/codecs and damaged media need additional real-world coverage. OS capture/driver latency, GPU behavior, long takes and Mac signing/notarization are not certified by these checks.
