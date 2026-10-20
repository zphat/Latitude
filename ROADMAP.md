# Latitude after the Windows beta

## Beta exit criteria

- Real Windows mic/interface, webcam, display/window and loopback tests on several machines, including laptop/DPI layouts and external shortcuts.
- 60–90 minute sync, memory, disk-pressure, interruption and recovery measurements. Record CPU, RAM, captured FPS and dropped frames with repeatable scenes.
- Listen to unprocessed and processed speech at matched loudness on headphones and speakers. Preserve consonants and word tails; measure gain reduction, clipping and encoded loudness. Keep enhancements optional.
- Compare identical workloads with OBS before claiming performance leadership. Profile capture/encoding separately from the worklet; retain H.264 stream copy and shared sources. If those dominate, investigate a native capture/encoding adapter rather than adding heavier UI frameworks.

## Start Linux after the format milestone

Begin the Linux platform work after 0.5's export regression and Windows packaging checks pass. Do not wait for every optional feature or for Windows to leave beta. Keep the shared scene, audio, recording and export contracts steady while real Windows users provide long-session feedback. Fix data-loss, sync, capture and export blockers before distributing either platform.

The 0.5 format registry has no platform dependencies, and the exporter already runs in Linux CI. That does not make desktop capture or system audio Linux-ready. The first Linux deliverable is a working capture/audio vertical slice on real Fedora KDE/Wayland and Ubuntu desktops, then packaging; not an untested installer around the Windows routing code.

Defer VST hosting, multi-camera recording, a streaming mod, and additional legacy codecs until the two platform paths are dependable. New features remain separate from the capture adapter and output-provider contracts.

## Linux milestone

1. Isolate platform capture selection, desktop-audio routing, shortcuts and packaging from the shared compositor/DSP/storage contracts.
2. Validate screen/window selection, PipeWire/Wayland portals and monitor-audio routing on Fedora KDE and Ubuntu, plus an X11 test. Provide clear feedback for unavailable system audio and shortcut registration.
3. Verify input/output selection, disconnect recovery, two inputs on one interface, pause and timestamp alignment on those systems.
4. Add Linux packaging/CI, desktop-file icons, install/uninstall checks and codec/license verification. Choose the distribution formats after testing the platform adapter.
5. Reuse the audio, storage, scene and browser tests; publish a separate Linux beta only after real desktop capture checks.

## Extension boundaries

Keep scene/theme packs data-only. The experimental output-provider seam is documented in MODDING.md. A streaming mod should own its network configuration, credentials, buffering and reconnect behavior; streaming failures must not stop local recording. Native audio plugins would need a separate isolated host and performance budget. Neither is included in 0.5.
