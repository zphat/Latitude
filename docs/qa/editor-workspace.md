# Editor workspace verification

The comfortable-workspace change leaves the project schema, render plan, media cache and native exporter unchanged. The only persisted additions are device-local layout preferences in the existing mod settings store. Pointer movement updates CSS; it does not render the project, allocate decoders or save preferences every frame. An AbortController removes the layout listeners on mod deactivation.

## Automated checks

- `TAKE_FFMPEG=/usr/bin/ffmpeg npm test`: 107 tests passed with Linux FFmpeg 6.1.1.
- `TAKE_FFMPEG=/usr/bin/ffmpeg node tests/editor-mod-ui.cjs`: passed in real Linux Electron 44.8.0 with Playwright. Playwright is a development test prerequisite, not an app dependency.
- The UI test imports local video/audio and an image, seeks decoded frames, plays audio, splits/undoes, inserts, detaches, copies/pastes, moves a title across layers, edits typography, changes aspect ratio, saves a project and performs a real separate-track export with a peak report.
- Layout checks cover 960×640, 1280×720 and 1480×1000; Chromium zoom factors 1.25 and 1.5; long source/project names; layered clips; pointer and keyboard divider movement (including actual preview height); canceled drag rollback without persisting a partial move; keyboard playback/undo; panel reopening; saved preferences across mod deactivation/reactivation; reset; and listener removal.
- Project contents, selected clip, playhead and undo history are compared before/after layout changes on an unsaved project. Existing media element identity is checked to reject replacement decoders. Save/export/play/undo and panel toggles are checked within the unscaled viewport; scaled layouts check that scrolling reaches the timeline.
- Screenshots at all three sizes and both zoom factors were visually inspected. The script writes screenshots and export artifacts to a temporary folder printed at completion. `git diff --check` and JavaScript syntax checks pass.

The 0.9.4 release preparation adds this native editor test to the Windows release job as well as the existing Linux job. It must pass there before publication; local Linux success is not a Windows hardware test.

## Limits and follow-up

At high scaling on a 960×640 physical window, not every area fits simultaneously. Side panels become drawers over the picture and the workspace scrolls vertically. Panel buttons reopen them; closing them gives the picture more room. Long toolbars scroll horizontally. These are deliberate fallbacks, not removed controls.

Chromium zoom is an approximation of display scaling. This validation does not replace real Windows/macOS/Linux desktop DPI, GPU, accessibility or long-session user testing. No comparative CPU/RAM benchmark was performed; the change adds no framework, package dependency, animation loop, resize polling or media player.

## Mac prerequisite

[Run 40610366381](https://github.com/zphat/Latitude/actions/runs/40610366381), commit `8b906d4cc7e1737d60874c0e477aaed053700d84`, passed the prepared encoder test suite and DMG/ZIP packaging on both macOS ARM64 and Intel runners. Artifact metadata confirms both unexpired unsigned-preview bundles and the matching commit:

- ARM64: artifact `12783680149`, 296164832 bytes; SHA-256 `f844f6679a02e105ac7ab2c1618da3b7c0695d4564b5bc29964840f58aacba56`.
- Intel: artifact `12783046129`, 315749177 bytes; SHA-256 `13dde65400045e445a4111e7db9dfd1d45b5bc0d7257ae9bdaedc49e87320655`.

These are server-reported artifact metadata/digests, not a local download audit. They verify unsigned development-preview packaging and native runner encoder tests, not real-Mac screen/audio capture, device permissions, signing/notarization or a public release. Those remain separate gates. The editor PR does not claim a new packaged release.
