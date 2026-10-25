# Update system QA — 0.9.1

## Local checks

- 100 shared Node tests passed, including 14 updater tests. The updater suite exercises version ordering and beta/stable channels, exact published asset selection, HTTPS redirect restrictions, checksum selection, once-per-launch behavior, skip/reset, opt-out, active-work guards, all three package types, partial-file cleanup, malformed/offline/rate-limited responses, bounded metadata, timeout, canceled downloads, tampering after download, and failed draft preservation.
- Real Electron 44.8.0 UI integration passed: deferral behind an existing dialog, metadata-only startup, skip surviving renderer reload, prompt returning after process relaunch, manual check, verified fixture download, pre-handoff editor draft saved on disk, update opt-out persisted across another relaunch, and manual checking while opted out. No renderer exceptions. Installer execution is replaced by a harmless handoff fixture in this test.
- Inspected the actual update prompt rendered at the application's 960 × 640 minimum size.

## Release gates

Release CI runs the shared tests, existing meter/streaming browser tests, native updater UI on Windows and Linux, native editor UI, bundled encoder tests, real Linux audio-server tests, and installation checks. Windows installation checks now also replace the existing installation and confirm profile retention and successful relaunch. The release publishes only after all gates succeed.

## Limits

The fixtures validate state, integrity and UI logic without executing a downloaded application. Windows CI validates real NSIS replacement separately. Software-center handoff depends on the user's Linux desktop and file handlers; the test does not silently install a Flatpak on a user's system. Windows security prompts, administrator-managed machines, every Linux software center and real-world network interruptions still need beta feedback. Checksums come from the release itself and are not an independent signature. No DSP, recording format or video encoder behavior was changed by this update feature.
