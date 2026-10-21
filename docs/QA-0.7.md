# Latitude 0.7 verification

Pre-release checks on 2026-10-21. Browser measurements use software-only headless Chromium on a shared Linux runner, generated screen/audio sources, and the real AudioWorklet, MediaRecorder, disk writer, and FFmpeg. They are regression checks, not claims about every GPU, microphone, or distro.

| Check | Result |
| --- | --- |
| Shared automated suite | 59 tests passed, including actual encode/decode for all eight export formats, separate-source and mix-only exports, original retention, DSP, pause clocks, storage recovery, Linux boundaries, and mod lifecycle failures |
| Balanced 1080p30 moving scene + gradient text | H.264, 182 decoded frames / 6.075 seconds = 29.96 fps; average draw sample 8.4 ms in this run; no browser errors |
| Recording controls and pause/resume | Preview start/stop/pause, frozen paused clock, unchanged 1920 × 1080 recording canvas, and valid decoded take |
| Idle preview | Zero canvas paints over 650 ms with a connected, unchanged screen source; hidden paused preview timer stopped |
| Editor regression | Drag/resize/undo, text/gradients/images, independent crops, output pixel sampling, stop while paused, graphic-only recording; zero crop-leak pixels |
| Small-window layout | Fixed mixer overlap; at 1100 × 740 the mixer ends at y=627, recording bar begins at y=638, record button ends at y=692 |
| Mods | Pack import, disable, persistence after restart, re-enable and remove; existing scene compositions retained; changes blocked while recording |
| Countdown | Cancel then immediately restart; older countdown cannot clear the new one |
| Idle audio and warnings | Audio context suspends after disconnect; clip warning stays until reset; diagnostics are reviewable; no horizontal overflow at 1100 and 960 px widths |

Reproduction: `npm test` with a supported FFmpeg installed. UI scripts need Playwright and `TAKE_TEST_BROWSER` pointing to Chromium; set `TAKE_FFMPEG` to the test encoder. Run `tests/refinement-ui.cjs`, `tests/framing-ui.cjs`, `tests/beta-ui.cjs`, and `tests/quality-ui.cjs`. Quality selection accepts `LATITUDE_TEST_HEIGHT`, `LATITUDE_TEST_FPS`, and `LATITUDE_TEST_QUALITY`. The refinement script creates actual app screenshots with sample content; no real private recording is used.

Release CI independently tests the bundled Windows encoder, installs/launches/uninstalls the Windows package, tests real PulseAudio/PipeWire servers, and builds/validates the installed Linux Flatpak. Publication requires all release jobs to pass. Consult the matching GitHub Actions run for final package outcomes.

Real Windows/Fedora/Bazzite/SteamOS Desktop Mode device and GPU tests remain necessary. In particular, 60 fps and 4K options depend on hardware and source cadence. Native screen capture can use more source bandwidth even when idle composition costs fall. No comparative CPU/RAM claim against OBS has been established.
