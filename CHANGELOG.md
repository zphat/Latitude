# Changelog

## 0.9.3 — 2026-10-26

Focused de-essing and restrained voice presets; live de-esser reduction, Reapply preset, encoded streaming FPS, on-demand performance diagnostics, long audio-clock QA and updated setup/contributor guidance. [Full notes](docs/releases/0.9.3.md).

Recent releases: [0.9.2 branding](docs/releases/0.9.2.md), [0.9.1 updater](docs/releases/0.9.1.md), [0.9.0 editor](docs/releases/0.9.0.md), [0.8.0 streaming](docs/releases/0.8.0.md).

## 0.4.0 — desktop beta

- Windows installer, desktop/Start menu shortcuts, and uninstall support; recordings and preferences retained.
- Suspend unused audio contexts, stop static/hidden preview timers, bypass unused DSP/filter work, and debounce preferences.
- Preserve sync-delay buffers, crossfade processing bypass, and protect headphone monitoring peaks.
- Serialize initialization/start/finalization, bound capture-stop waits, and detect stalled writes.
- Cancelable exports, live progress, atomic metadata, bounded video encoding threads, and no export/record overlap.
- Explicit frame requests after drawing, held clip warnings, Save and close, shortcut fallback, smaller windows, and local diagnostics.
- Audio/worklet/lifecycle regression tests, browser QA, installer CI, beta feedback templates, and Linux roadmap.

## 0.3.0 — early beta

- Direct source dragging and resizing, snap guides, layer ordering and locking, and independent crops.
- Text with solid or gradient colors, local images, color panels, and composition undo/redo.
- Microphone-only onboarding, optional scene templates, and five interface themes.
- Two independently processed voice lanes, desktop audio, sample-aligned stems, and optional original voice backups.
- Optional Rich clarity processing, soundcheck guidance, clipping warnings, and measured export loudness.
- Pause, markers, scene transitions and hotkeys, recovery export, and CapCut-friendly per-track video copies.
- Resolution and bitrate choices through 4K/60, shared capture streams, lower-resolution idle previews, and H.264 stream-copy export when available.
- MIT application source, portable scene packs, and an experimental output-provider interface for source forks.

The build is unsigned. Windows hardware and long-session testing remain outstanding. 4K/60 is a selectable setting, not a verified performance guarantee. See BUILD-REPORT.md for measured results and limitations.
