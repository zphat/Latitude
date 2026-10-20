# Latitude on Linux — 0.6 preview

The first Linux build is an x86-64 Flatpak. It targets Fedora KDE/GNOME, Ubuntu and Mint with Flatpak, Bazzite, and **SteamOS Desktop Mode**. These are target environments, not claims that every distribution and device has passed hardware testing. SteamOS Gaming Mode is not supported in this preview.

## Install and launch

Download the `.flatpak` from [GitHub Releases](https://github.com/zphat/Latitude/releases). Open it with KDE Discover or another Flatpak-capable software center. Install, then launch **Latitude** from your application menu; pin it to your panel or add a desktop shortcut like any other app. You do not need the source folder, Node, or a terminal to use it.

If your software center cannot open the file, use:

```sh
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install --user ./Latitude-0.6.0-Linux-x64.flatpak
flatpak run studio.latitude.recorder
```

The first install downloads the shared Freedesktop runtime. Latitude is not listed on Flathub yet; future preview updates are installed from a new GitHub release. Flatpak itself must be installed first on distributions that do not include it. Bazzite and SteamOS do not need an unlocked or layered system image.

## First recording

1. Choose your microphone in onboarding, or skip if you only need screen/desktop sound.
2. Choose a screen or window. On Wayland your desktop opens its own permission picker. Choose Screen B separately for two sources; it never adds a second copy of desktop audio.
3. Open **Inputs & outputs**. System playback captures the default output at connection time, or choose a specific output. This records every app playing through that output. If you switch headphones/speakers, reconnect desktop sound here. Per-app capture is not included yet.
4. Make a short take with speech, music, a clap, a scene change, and pause/resume. Check synchronization and isolated tracks in your editor before a long session.

All existing presets, processing, separate mic/desktop tracks, crop and scene tools, and export formats remain available. The default MP4 export keeps separate audio streams; WAV editing files are available for editors that expose only the first embedded stream.

## How capture works

Wayland screen capture uses PipeWire through the desktop screen-sharing portal. The portal must be installed and working (KDE or GNOME normally provides it). X11 uses Electron's source picker. Screen/window selection is always explicit; no screen is captured merely by opening Latitude.

Desktop audio uses a small native control helper with libpulse. PipeWire's PulseAudio compatibility service and PulseAudio are supported. It creates one temporary monitor input for the selected output and feeds it into the existing 48 kHz audio engine, alongside the microphones. It does not copy PCM through Node, change the default microphone/output, or adjust system volumes. Disconnecting or closing the app removes its own temporary input. Your sound settings may show a `latitude_desktop_…` input while it is connected; leave your physical mic selected for other apps.

Flatpak permits audio input/output, Wayland or X11 display access, the Videos folder, and devices for webcams/GPU access. Webcam support currently needs Flatpak's broad device permission because Chromium uses V4L2; the app does not request full home-folder, network, or unrestricted D-Bus access. Files selected with a supported file portal receive scoped access. Use the default Videos/Latitude destination if an external-drive picker does not retain access.

Global shortcuts depend on your desktop's shortcut service and conflicts with existing shortcuts. Latitude reports failed bindings. In-app controls work when a global binding is unavailable.

## Preview limits and testing

The automated gates exercise both PulseAudio and PipeWire audio routing, separate stereo channels, output selection, cleanup, shared recording/export tests, and an installed Flatpak launch. Real monitor/webcam capture, Wayland permission dialogs, suspend/resume, Bluetooth changes, sustained 4K/60 recording, and GPU behavior require testing on actual machines. Start at 1080p/30. Higher settings are available but performance is not guaranteed on Steam Deck or any particular GPU.

If capture fails, check desktop sharing permission and the desktop portal; if audio fails, check PipeWire/PulseAudio. A failed desktop-audio connection leaves screen capture available and shows an error. Reconnect between takes. For reports, include distro/version, KDE or GNOME, Wayland or X11, and the steps to reproduce. Settings → diagnostics gives technical details without uploading recordings or device names.

## Build from source

On Linux, install Node 24, a C compiler, pkg-config, libpulse development headers, Flatpak and flatpak-builder. Install matching Freedesktop Platform/SDK and Electron2 BaseApp **25.08** from Flathub, then:

```sh
npm ci
npm run build:linux-audio
node scripts/prepare-encoder.cjs
npm start
# Installable desktop package:
npm run dist:linux -- --x64 --publish never
```

See `.github/workflows/linux.yml` for the exact build and test commands. Never launch the application with `--no-sandbox` as an installation workaround. The Flatpak uses Zypak to preserve the Chromium sandbox.
