# Creative library QA · 0.9.8

Checked locally on Linux with FFmpeg 6.1.1 and the pinned Electron 44.8.0 runtime.
Native Windows/macOS packaging checks remain release gates; these local results
are not physical-device capture or GPU certification.

- **128 Node tests passed**, including actual native color filters, all 12
  transition exports with both easing modes at a nonzero segment offset, canonical
  preset round-trips, malicious/oversized preset rejection, project/history/sync
  preservation and SHA-256 verification of every added font and upstream notice.
- The actual-ASAR font gate passes a complete archive and rejects a missing license
  file. The gate is wired into Windows ZIP, installed Linux Flatpak and Mac app
  verification. Git attributes preserve upstream notice bytes on Windows.
- **7 Mac publication-guard tests passed**; existing portability, licensing,
  release-asset and checksum preservation guards remain intact.
- Native `editor-mod-ui.cjs`: local imports, linked cuts, layout, title positioning,
  exact font loading, project save/reopen, native separate-track export and unload.
- Native `editor-scrub-ui.cjs`: exact frame IDs, held scrubbing, latest seek wins,
  decoder reuse, cut boundaries and source offsets.
- Native `editor-gestures-ui.cjs`: live trim frames, joint source bounds, both-edge
  snapping, Escape rollback, wheel zoom/pan, held-edge scrolling and cleanup.
- Native `editor-creative-ui.cjs`: favorites/search, applying and undoing looks,
  retained inspector sections, clip names independent from media, real file-dialog
  pack export/import, forged review claims ignored, pack removal preserves edits,
  all 16 font choices offline, preview/native RGB parity for every included look,
  layout at 960×640, 1280×720, 125% and 150% scaling, Done reachable while scrolled,
  unchanged project/selection/playhead on resize, fonts/listeners/canvases released
  on disable, local packs retained on re-enable, and returning to Studio.
- Screenshots of the native library, title editor and Studio were visually inspected.
  At small/scaled sizes, the library scrolls; its header/Done and feedback stay
  reachable. Preset cards use generated samples, never extra video decoders.
- Studio beta assertions were additionally run in an Electron-hosted local preview
  with fake microphones: idle preview stopped, idle audio suspended, both inputs
  connected/released, live clip flash/history/reset, diagnostics and 1100/960 layout.
  The standalone system Chromium launch was blocked by this environment's socket
  policy; host-preview screenshots timed out. Those screenshots were not counted
  as passing. Screenshots from the real native app were inspected separately.

No production package dependencies were added. The editor remains lazy and off
by default. New font files/notices add 2,382,236 bytes; visual preset data is small.
Only one hovered card animates briefly, at up to 30 fps; reduced motion disables
it. Closing the library drops its card canvases; disabling the editor removes its
font faces and listeners. Sliding clips avoid per-pixel alpha processing when it
is unnecessary, and segments beyond an entrance skip the finished mask.

Remaining validation: native platform builds, physical capture/permissions, long
recordings, integrated/discrete GPU behavior, actual update installation, and
matching-loudness listening on real devices. macOS remains unsigned/unnotarized
with manual updates. This does not claim lower total CPU/RAM than OBS.
