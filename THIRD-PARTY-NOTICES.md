# Third-party components

Latitude’s own source is licensed under MIT. Other components remain under their upstream licenses.

- **Electron 44.8.0** — MIT. https://github.com/electron/electron/tree/v44.8.0. The desktop distributions include Electron’s license and `LICENSES.chromium.html` for Chromium and its components.
- **FFmpeg static builds: Windows 6.1.1, Linux x86-64 7.0.2** — used as a separate process for encoding and audio analysis. These builds contain GPL-enabled components. The upstream tag name is not the actual Linux binary version; the Linux x86-64 binary and its notices identify 7.0.2. Upstream binary release: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1. Full build-specific license and build/source information are included in `resources/FFmpeg-LICENSE.txt` and `resources/FFmpeg-README.txt` in each desktop distribution. Windows notices are checked in under `vendor/`; Linux notices are copied from that exact downloaded Linux build during packaging.
- **ffmpeg-static 5.3.0** — GPL-3.0-or-later. https://github.com/eugeneware/ffmpeg-static. Its package is used to locate/download platform-specific binaries for source development.
- **electron-builder 26.15.3** — MIT; development packaging only. https://github.com/electron-userland/electron-builder.

FFmpeg upstream source: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz (Windows) and https://ffmpeg.org/releases/ffmpeg-7.0.2.tar.xz (Linux). Linux builder/dependency source downloads: https://johnvansickle.com/ffmpeg/release-source/. The corresponding builder repository and dependency/source details are listed by the build README. Before redistributing modified or repackaged copies, retain the upstream notices and meet the corresponding-source requirements for the specific FFmpeg binary you ship.

- **libpulse** — the small Linux audio helper dynamically links the audio client library provided by the Freedesktop runtime (LGPL-2.1-or-later). https://www.freedesktop.org/wiki/Software/PulseAudio/. It works with a PulseAudio server or PipeWire’s PulseAudio compatibility service; neither server is bundled by Latitude.
- **Flatpak / Freedesktop Platform and Electron2 BaseApp / Zypak** — Linux distribution and sandbox runtime components, under their respective upstream licenses. See https://github.com/flathub/org.electronjs.Electron2.BaseApp/tree/branch/25.08 and https://github.com/refi64/zypak. The Flatpak retains runtime and Chromium notices.

No online fonts, third-party web content, hosted analytics, or media upload services are loaded by the application UI.

- **Manrope** — Copyright 2018 The Manrope Project Authors, SIL Open Font License 1.1. Bundled locally for editor titles; license in `assets/fonts/Manrope-OFL.txt`. Source: https://github.com/google/fonts/tree/main/ofl/manrope.
- **DM Serif Display** — Copyright 2014–2019 Adobe and the DM Serif Project Authors, SIL Open Font License 1.1. Bundled locally for editor titles; license in `assets/fonts/DMSerifDisplay-OFL.txt`. Source: https://github.com/google/fonts/tree/main/ofl/dmserifdisplay.
