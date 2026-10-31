# Latitude 0.9.5 for Mac — development preview

The Mac preview includes the same recording, voice-processing and optional
Streaming/Editor tools as 0.9.5 for Windows and Linux, including the adjustable
editor workspace. It targets **macOS 14.2 or newer**.

## Choose and install

Use **Apple menu → About This Mac** to identify your computer:

| Your Mac | Download from the [0.9.5 release](https://github.com/zphat/Latitude/releases/tag/v0.9.5) |
| --- | --- |
| Chip: Apple M-series | `Latitude-0.9.5-macOS-arm64.dmg` |
| Processor: Intel | `Latitude-0.9.5-macOS-x64.dmg` |

Open the DMG, drag **Latitude** onto **Applications**, eject the disk image,
then open Latitude from Applications. No Node.js, source folder or separate
encoder is needed. The ZIP is an alternative containing the complete app bundle.

**This preview is not Developer ID signed or Apple notarized.** macOS may block
the first launch. See [Apple's explanation of app security alerts](https://support.apple.com/en-us/102445).
Do not disable Gatekeeper or remove quarantine attributes. If you cannot open
the app through Apple's normal per-app approval flow, report the exact message;
do not bypass a damage or malware warning.

Mac updates are **manual** for now. Save your project, quit Latitude, then replace
the old app in Applications using the new matching DMG. Keep your recording and
project folders. Mac launch update checks and automatic installation are not
implemented; Settings → App updates does not update this preview.

## First take and permissions

1. Launch the installed app directly from Applications. Select your mic in setup.
2. Add a screen or window. Allow the relevant screen/system-audio privacy prompt.
3. Allow microphone access; camera permission is needed only if you add a camera.
4. If an input is unavailable, check **System Settings → Privacy & Security** for
   Latitude's microphone, camera and screen/system-audio permissions. Quit and
   reopen Latitude after changing permissions. Names vary by macOS version.
5. Use headphones, run Soundcheck and record a short take with speech, movement
   on screen and desktop sound. Check voice and desktop tracks separately.
6. Enable **Mods → Latitude Editor**, import the take, resize the window and try
   the preview/timeline divider. Export with separate audio tracks and WAV stems.

The desktop-audio implementation uses Electron's native CoreAudio loopback path;
it does not require an extra virtual audio driver. Device routing and permissions
still require real-Mac testing. Reference: [Electron desktop capture](https://www.electronjs.org/docs/latest/api/desktop-capturer).

## What has to pass before upload

The Mac workflow runs independently on Apple Silicon and Intel. It builds the
encoder from pinned sources, rejects nonfree configurations and non-system dynamic
libraries, runs the audio/editor/export tests against that encoder, and exercises
the native editor's resize, keyboard, save and separate-track export behavior.
It verifies packaged architecture/version, license files, ZIP integrity, DMG/ZIP
contents and launches the packaged app from an unrelated folder. Both jobs must
pass before publishing downloads. This checks installation contents and startup;
it does **not** record physical devices or exercise macOS privacy prompts.

The earlier `ffmpeg-static` Apple Silicon encoder was built with `--enable-nonfree`.
Those older Actions artifacts must not be redistributed. Public Mac preview
packaging uses the source-built replacement and includes Electron/Chromium notices.
`SHA256SUMS-macOS.txt` verifies Mac downloads; `SHA256SUMS.txt` remains the unchanged
Windows/Linux manifest. Checksums establish integrity, not a publisher signature.

## Remaining gates for a signed Mac beta

- Real Apple Silicon and Intel screen/window, microphone, webcam and system-audio
  capture; denied, granted and revoked permissions; device changes and sleep/wake.
- Long recording sync, playback and separate-track exports on actual Macs, including
  a 70-minute podcast, gameplay and the minimum supported macOS version.
- Developer ID signing, Apple notarization and a tested Mac update-install flow.

Do not use an untested Mac preview as the only recording of an important session.
Report your macOS version, chip, device setup, preview version and reproduction
steps through [Discord](https://discord.gg/EnPRdDutAn) or [GitHub](https://github.com/zphat/Latitude/issues).
Private recordings are not required.

## Build or fork

On the matching native Mac, run `npm ci` and `npm run setup`, install Xcode command-line tools plus
`nasm` and `pkg-config`, then:

```sh
python3 scripts/build-mac-encoder.py
node scripts/prepare-mac-encoder.cjs
TAKE_FFMPEG="$PWD/vendor/ffmpeg" PATH="$PWD/vendor:$PATH" npm test
npm run dist:mac -- --arm64 --publish never
python3 scripts/verify-mac-package.py
```

Use `--x64` on Intel. Packaging remains unsigned unless you separately configure
signing. Python 3.11.4+ is required for archive extraction with the data filter.
The manifest in `packaging/mac/encoder-sources.json` pins exact source hashes.
Each `Encoder-Sources.tar.gz` download includes those unmodified sources, the
recipe and build configuration. FFmpeg is a separate GPL executable; Latitude's
own source remains MIT. See [third-party notices](../THIRD-PARTY-NOTICES.md).
