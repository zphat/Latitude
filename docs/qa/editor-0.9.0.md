# Editor 0.9.0 QA

Local validation on 2026-10-23 uses the actual Electron desktop IPC and real FFmpeg output, not a static editor mockup. Release automation adds native Windows encoder/package checks and Linux build/install checks; see the matching GitHub Actions run for its outcome.

## Local results

- **86/86** shared and editor automated tests passed with the system encoder.
- **14/14** editor tests passed with the exact bundled Linux encoder.
- The real Electron editor flow passed with the bundled encoder, including its exported MP4 and aligned stems.
- Existing audio-meter and streaming browser flows passed, including protected output, RTMP reception/reconnect and independent local recording.

## Exercised behavior

- Timeline schema validation; linked splits and ripple synchronization; markers; insert-space with source offsets retained; detaching audio; copy/paste group IDs; locked layers; overlap limits; undo budget.
- Native media byte ranges, suffix/open-ended requests, HEAD, invalid ranges and missing files. The Electron test confirms the picture changes from the opening blue segment to the later red segment after scrubbing.
- Real import → audio preview → split/undo → range removal/undo → ad insertion/undo → linked audio separation/copy/paste → layer mixer → lock controls → gradient title drag → portrait/landscape → project save → MP4 with separate audio → mod unload.
- Native export validates picture pixels, selected source audio frequency, multiple embedded streams, aligned WAV stems, range duration, fades, wipe/slide transitions and measured delivered true peak. Original media bytes remain unchanged.
- More-than-30-second audio rendering, two-pass loudness normalization, and continuous dialogue compression across render boundaries. RMS before/after an internal boundary stays within 0.1 dB for the fixed-tone fixture. This checks continuity, not perceived speech quality.
- Save/draft/open, missing-media relink, wrong-kind relink rejection, empty disabled recording input omission, bounded waveform generation, selected-source audio previews, cancellation and incomplete-output cleanup.
- Full shared audio/scene/storage/streaming/export regression suite and existing browser tests are release gates. Editor integration adds no changes to recording DSP.

## Resource decisions

No production dependency was added. Media reads use 256 KiB range streams, waveforms use 4,096 peak bins, timeline drawing is viewport-limited, paused previews stop scheduling, hidden editor pages release media, preview titles are rasterized at preview size, and upcoming decoder warm-up is capped. History keeps at most 60 states with a roughly 16 MiB serialized-size-derived budget; this is not a whole-process RAM guarantee. Export uses bounded active-source sections and two encoder/filter threads. Dialogue's stateful processing is applied continuously afterward when enabled. There is no claim of universal low CPU/RAM or benchmark superiority.

## Still requires beta feedback

Actual long podcasts, speech listening and subjective mix quality; unusual codecs and variable-frame-rate media; low-end GPU/CPU behavior; Windows input devices and display scaling; Linux portal grant persistence; SteamOS/Bazzite on physical hardware. Synthetic fixtures and automated installs do not certify every platform or device. Preview color/audio effects are lightweight approximations; verify the finished export for release-critical work.

Run `npm test`, then `node tests/editor-mod-ui.cjs` with Playwright installed for the desktop flow. `TAKE_FFMPEG` and `TAKE_TEST_ELECTRON` may select explicit binaries. The UI test isolates its user profile and leaves generated fixtures/screenshots in its printed temporary folder. It never uses your recordings or stream key.
