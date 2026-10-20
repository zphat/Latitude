# Latitude desktop roadmap

## Beta exit criteria

- Real Windows mic/interface, webcam, display/window and loopback tests on several machines, including laptop/DPI layouts and external shortcuts.
- 60–90 minute sync, memory, disk-pressure, interruption and recovery measurements. Record CPU, RAM, captured FPS and dropped frames with repeatable scenes.
- Listen to unprocessed and processed speech at matched loudness on headphones and speakers. Preserve consonants and word tails; measure gain reduction, clipping and encoded loudness. Keep enhancements optional.
- Compare identical workloads with OBS before claiming performance leadership. Profile capture/encoding separately from the worklet; retain H.264 stream copy and shared sources. If those dominate, investigate a native capture/encoding adapter rather than adding heavier UI frameworks.

## Linux preview in 0.6

The first x86-64 Flatpak shares the compositor, audio engine, recording store, and format registry with Windows. Platform capture selection, native desktop-audio control, desktop identity, and packaging are isolated. Automated tests cover audio-server routing and installed renderer audio, with explicit older-PipeWire failure handling.

The release is a **Linux preview**, not certification of a full Linux support matrix. Validate next, in order:

1. Fedora KDE on Wayland: screen/window sharing, two sources, default/specific output audio, webcam, global shortcuts, install/update/uninstall, and user-selected storage.
2. Ubuntu GNOME Wayland and Mint/X11: portal and output differences, input/output changes, disconnect recovery, and two channels of one interface.
3. Bazzite KDE and SteamOS Desktop Mode: Flatpak integration, controller/keyboard access, game capture during a desktop session, GPU load, and audio-device changes.
4. At least one long take per desktop/backend, measuring timestamps, memory, CPU, actual frame rate, disk pressure, and recovery. Check 1080p/30 before 60 fps or 4K.
5. Only after those checks, promote Linux from preview to beta and consider Flathub submission. SteamOS Gaming Mode is a separate capture/UX/performance project, not implied by Desktop Mode support.

Defer VST hosting, multi-camera recording, a streaming mod, and more codecs until both platform paths are dependable. Profile real capture and encoding before choosing a native adapter or promising lower resource use than OBS.

## Extension boundaries

Keep scene/theme packs data-only. The experimental output-provider seam is documented in MODDING.md. A streaming mod should own its network configuration, credentials, buffering and reconnect behavior; streaming failures must not stop local recording. Native audio plugins would need a separate isolated host and performance budget. Neither is included in 0.6.
