# Contributing to Latitude

Install Node.js 22.12 or newer, then run `npm ci`, `npm run setup`, and `npm start`.
The source archive includes a Windows FFmpeg binary. A Git checkout excludes binaries: run `node scripts/prepare-encoder.cjs` after npm installation to copy the downloaded Windows encoder into vendor before building on Windows. Keep its license notices. Linux cross-builds need a Windows encoder supplied at vendor/ffmpeg.exe.

Run `npm test` for DSP, geometry, pack, file-writing, and FFmpeg tests. `ffprobe` must be on PATH. Browser tests need Playwright and Chromium; install them separately for development and run `tests/ui.cjs` and `tests/framing-ui.cjs`. `tests/beta-ui.cjs` checks idle behavior and beta controls. `npm run bench:audio` runs a worklet microbenchmark; compare on the same host without other heavy tasks. `tests/quality-ui.cjs` checks quality changes; `LATITUDE_TEST_HEIGHT` and `LATITUDE_TEST_FPS` choose the format. `TAKE_TEST_BROWSER` can specify a Chromium executable. Never claim browser mock capture verifies Windows hardware capture.

Use small changes with a concrete reproduction, expected behavior, and the checks performed. Add meaningful tests for audio behavior, clock alignment, file recovery, crop boundaries, or source routing. Do not commit recordings, user settings, build output, dependencies, credentials, or downloaded executables.

`npm run pack:win` makes an unpacked Windows app. `npm run dist:win` makes an installer and portable ZIP. The app has no signing certificate; releases remain unsigned unless a maintainer configures signing. The MIT license covers application code; dependencies and FFmpeg carry their own licenses and redistribution requirements.

Before promoting a beta to a stable release, run a real Windows test with microphones, loopback, multiple windows, camera disconnect/reconnect, external hotkeys, output device selection, pause/resume, and a long take. Report issues without uploading private recordings by default. See RELEASING.md for packaging, verification, and publication.

The CI workflow runs the automated test suite for pushes and pull requests. Its FFmpeg integration tests use the runner's system FFmpeg; that does not replace testing the packaged Windows encoder. The manual Build Windows package workflow creates an unsigned test artifact, not a published release. GitHub workflow permissions are read-only, and third-party action revisions are pinned.

## Linux development

See [docs/LINUX.md](docs/LINUX.md). The Linux audio bridge is built from `native/linux-audio.c`, links libpulse, and controls a temporary monitor source; it never transports PCM through Node. Keep platform-specific code in the capture adapter and helper rather than forking the DSP or compositor. Run `tests/linux-ui.cjs` for the Linux routing UI. `tests/linux-native.cjs` runs against a disposable real audio server; do not run it against your everyday session because its test fixtures change defaults temporarily. The CI shell harness creates an isolated session.

The Linux preview workflow tests PulseAudio, supported PipeWire, and explicit rejection of older PipeWire, then builds and installs a Flatpak and verifies real desktop audio reaches the packaged renderer worklet. Hardware capture and sustained-performance checks remain separate manual gates. The build workflow runs on a normal GitHub-hosted runner; it does not weaken the application sandbox.
