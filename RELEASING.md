# Releasing Latitude

Keep application source in Git and downloadable builds in GitHub Releases. Do not commit executables, dependency folders, recordings, or generated archives.

## Build and check

1. Use a clean checkout on Windows x64 with Node.js 24. Keep package.json and package-lock.json versions aligned. Linux packaging also needs the tools listed in [docs/LINUX.md](docs/LINUX.md).
2. Run `npm ci`, then `node scripts/prepare-encoder.cjs`.
3. Run `npm test` with ffprobe on PATH. Run the browser recording and framing checks described in CONTRIBUTING.md when changing capture, audio, or scene behavior.
4. Run `npm run dist:win -- --x64 --publish never`. This creates Setup.exe and a portable ZIP. Run `python scripts/verify-release-package.py` to verify contents and write both checksums.
5. Extract the ZIP to a clean folder and test screen/window capture, mic and desktop audio, pause/resume, scene changes, playback, isolated stems, and an interrupted take on real Windows hardware. Document any untested paths. A beta may explicitly disclose outstanding checks; a stable release should complete them.
6. Retain the application license, Electron/Chromium notices, and build-specific FFmpeg license and source information. Check corresponding-source availability for the exact encoder build before redistributing it. Latitude's MIT license does not replace dependency licenses.

## Publish

Create a release from the reviewed main-branch commit, with a matching version tag. For 0.6.0 use tag `v0.6.0` and title **Latitude 0.6.0 — Windows beta + Linux preview**. Mark it **pre-release**. Copy `docs/releases/0.6.0.md` into the release description.

Attach Setup.exe, the portable ZIP, the Linux x86-64 Flatpak, and SHA256SUMS.txt. GitHub provides source snapshots from the tag automatically; these exclude the encoder executable. An optional source bundle may include the encoder and must preserve its notices. Release notes should distinguish those formats.

Generate SHA-256 checksums of the exact final files, and verify them after upload. On Windows:

```powershell
Get-FileHash .\Latitude-0.6.0-Windows-x64-Setup.exe -Algorithm SHA256
```

The Build Windows package workflow is an on-demand packaging aid. Its artifact is not automatically a public release, and a successful build does not verify hardware capture. The Tests workflow runs the unit and FFmpeg integration suite on source changes.

## Publish through GitHub Actions

The **Publish desktop preview** workflow builds and publishes a prerelease from a reviewed commit on `main`. Run it from Actions, or push a commit whose subject is exactly `Release Latitude vX.Y.Z`, matching the version in package.json and package-lock.json. Ordinary commits do not publish a release. Add the reviewed `docs/releases/X.Y.Z.md` first.

The workflow runs the test suite, builds on a Windows runner, checks the archive and bundled encoder/notices, installs on a disposable runner, checks desktop/Start links, launches the packaged app and encoder from another folder, verifies uninstall preserves data, transfers the package with its checksum, then creates a prerelease attached to that exact commit. Only the final publishing job has repository contents write permission. It refuses to replace an existing release. Build success does not validate microphones, screen capture, or long sessions on real hardware.

The encoder hash in `scripts/verify-release-package.py` deliberately pins the reviewed Windows encoder. If upgrading FFmpeg, review the exact new binary and corresponding notices before updating that hash.

No code-signing certificate or automatic updater is configured. Do not describe a package as signed, hardware-validated, or stable unless those checks were actually completed for that package. Preserve released assets; use a new version for changes to application behavior.

## Linux release gate

The release workflow also calls `linux.yml`. That workflow builds the native audio helper with warnings treated as errors, tests real PulseAudio and PipeWire routing, checks old-server rejection, exercises all formats with the Linux encoder, validates metadata, and installs/launches the Flatpak with the normal sandbox. The audio smoke test sends a generated tone through the host server into the packaged Chromium/Web Audio processor. Hardware/portal tests remain documented manual gates.

Publishing waits for both platform jobs. Linux bundles and Windows assets are downloaded with their own checksums, then one combined SHA256SUMS.txt is published alongside the installers. Review exact encoder notices and hashes for both platforms. The application ID, desktop file, and Flatpak ID must remain `studio.latitude.recorder` to retain preferences and portal identity across updates.
