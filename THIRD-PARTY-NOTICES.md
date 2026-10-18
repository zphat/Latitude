# Third-party components

Latitude’s own source is licensed under MIT. Other components remain under their upstream licenses.

- **Electron 44.8.0** — MIT. https://github.com/electron/electron/tree/v44.8.0. The Windows distribution includes Electron’s license and `LICENSES.chromium.html` for Chromium and its components.
- **FFmpeg 6.1.1 static build** — used as a separate process for encoding and audio analysis. This build contains GPL-enabled components. Upstream binary release: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1. Full build-specific license and build/source information are included in `resources/FFmpeg-LICENSE.txt` and `resources/FFmpeg-README.txt` in the Windows distribution, and `vendor/` in the source package.
- **ffmpeg-static 5.3.0** — GPL-3.0-or-later. https://github.com/eugeneware/ffmpeg-static. Its package is used to locate/download platform-specific binaries for source development.
- **electron-builder 26.15.3** — MIT; development packaging only. https://github.com/electron-userland/electron-builder.

FFmpeg upstream source: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz. The corresponding builder repository and dependency/source details are listed by the build README. Before redistributing modified or repackaged copies, retain the upstream notices and meet the corresponding-source requirements for the specific FFmpeg binary you ship.

No online fonts, third-party web content, hosted analytics, or media upload services are loaded by the application UI.
