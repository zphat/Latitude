# Session naming and export timing — 0.9.5

## Behavior

Session titles are metadata. Renaming uses atomic writes and a serialized metadata queue shared with export completion; active recordings also retain the existing marker/scene write queue. Names do not move media, recording directories or saved editor paths. Export completion rereads current metadata so a concurrent rename is not overwritten by an old snapshot.

The default automatic editing pack still performs two-pass mix normalization. Movie audio and the editing WAV now share that processing pass, and processed source WAVs are written by the same encoder process. Raw WAV backups remain independent files (copy-on-write if supported, normal copies otherwise). Video stream-copy/encoding settings, live DSP and output-track selection are unchanged.

Final verification still scans the delivered encoded audio and its true peaks. EBU R128 measurement replaces a second normalizing filter used only as a meter; a custom encoder without that scanner falls back to the previous measurement. Report precision is now 0.1 LU/dB. Scanner tests compare both methods on encoded silence, below-gate audio, speech-shaped tones and an intersample-peak signal at 44.1/48 kHz, within 0.3 LU/dB. This is measurement precision, not an audio gain change.

## Local checks

- All **115** existing and added Node tests pass with Linux FFmpeg 6.1.1, including native export, cancellation, recovery, separate tracks and source retention.
- New sample checks cover normalized stereo at 44.1/48 kHz, duration and pitch, exact 24-bit source-stem samples, source backups independent of originals, and final delivered loudness/true peaks.
- Native Electron 44.8.0 naming/IPC checks pass: legacy blank migration, persisted next-take name, automatic date/time naming, Enter/blur commits, Escape cancellation, invalid whitespace, Unicode/HTML-like names, renaming while recording, export-dialog settings retained, and real generated-media recording/export.
- The naming UI is checked at 960×640, 1280×720 and 1480×1000, with 125%/150% Chromium zoom. Screenshots of the Studio fields, long take names and scaled rename dialog were visually inspected. Zoom approximates display scaling; it does not replace real desktop DPI/accessibility testing.
- Existing native editor UI tests pass: decoded preview, linked edits, save, actual separate-track export, smaller windows, scaling, retained layout/project state and mod cleanup.
- Seven Mac-publication tests pass using fake assets/API responses. A combined release can publish Mac assets only to an existing prerelease whose tag matches the exact tested commit. Both architecture jobs, licensing, portability, package launch and checksum gates remain mandatory. Existing release assets cannot be replaced.
- JavaScript syntax and `git diff --check` pass. No new runtime dependencies, timer loops or media decoders.

Native Windows/Mac validation belongs to the release workflows, not these local Linux results. Physical capture devices, permissions, 70-minute takes, signed installation and actual user-hardware performance are outside this local test.

The first 0.9.5 pipeline passed both native Mac packages and Linux, but Windows exposed a test-fixture startup race: the app had already saved initial preferences, so the test skipped seeding its setup-complete fixture and typed behind onboarding. This was reproduced locally with a slower test attachment. The test now waits for initial startup, seeds its fixture exactly once and verifies onboarding is closed; reload persistence and all naming/export assertions remain. Windows also checks each native test's exit code individually. Release publication remains blocked until the corrected run passes.

## Export comparison

Same Linux host and FFmpeg 6.1.1; 0.9.4 commit `81f82f0` versus this change. Six sequential exports alternate baseline/current order on the same generated 30-second H.264 320×180 take with two voices, desktop, full mix and original voice backups. Both modes normalize, preserve four embedded tracks and write editing WAVs; optional per-source video copies are off. No other media tests or benchmarks ran during the comparison.

| Build | Runs (seconds) | Median |
| --- | --- | --- |
| 0.9.4 baseline | 14.989, 14.619, 14.862 | 14.862 s |
| Updated exporter | 13.257, 12.335, 14.733 | 13.257 s |

That is **10.8% less median export wall time** in this synthetic case. Both copied the H.264 picture stream. The resulting editing pack sizes were 40,512,003 and 40,512,471 bytes; the tiny AAC difference is expected because the movie now consumes the float normalized mix directly instead of rereading a quantized 24-bit intermediate. Lossless isolated stems remain sample-exact.

This is not a general speed guarantee, a live CPU/RAM measurement or a long-session benchmark. Disk speed, CPU, video conversion, file copying and content all affect time. **Save originals · export later** skips automatic export work; it does not make a later export unnecessary. Original-take finalization still safely drains pending writes and completes recording headers before reporting success.

Reproduce with an older checkout and the same encoder:

```sh
LATITUDE_BENCH_BASELINE=/path/to/0.9.4 TAKE_FFMPEG=/usr/bin/ffmpeg node scripts/benchmark-export.cjs
```

Native UI commands require Playwright as a development tool, not an application dependency:

```sh
TAKE_FFMPEG=/usr/bin/ffmpeg npm test
TAKE_FFMPEG=/usr/bin/ffmpeg node tests/session-names-ui.cjs
TAKE_FFMPEG=/usr/bin/ffmpeg node tests/editor-mod-ui.cjs
python3 tests/mac-release.test.py
```
