# Linux port paused — October 20, 2026

User requested pausing Linux to prioritize latitude.pictures beta landing page and conserve credits. Do not publish 0.6.0 yet. Main still ships 0.5.0 Windows beta.

Checkpoint: Linux portal handling, libpulse bridge, Flatpak configuration, UI, documentation, and release workflow are on linux/port. Shared 51 tests, Linux UI mock-media test, real PulseAudio and PipeWire 1.0.5 routing, and old-PipeWire rejection passed. Browser recording test produced 4 isolated streams with approximately 5 ms duration difference. No physical Fedora/Wayland/SteamOS testing has occurred.

Last CI run 39430610167 failed at Flatpak packaging: bwrap could not execute appstream-compose in the 25.08 SDK. The prior system-install lookup errors are followed by successful user-install lookup; they are not the fatal error. Investigate the flatpak-builder / SDK compose-tool compatibility without disabling the sandbox. No Linux package has passed the installed-app audio smoke test yet.

This checkpoint preserves pending output-removal/signal cleanup changes and their native integration test. Those final native changes still need compilation and real-server tests. UI stream-ended cleanup was also updated. When resumed, finish packaging and installed audio checks, review limitations, then publish only after release gates pass. Do not advertise the Linux download on the landing page until an asset is actually published.
