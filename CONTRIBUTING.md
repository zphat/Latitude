# Contributing to Latitude

Welcome. Useful contributions include clear bug reports, real-device tests,
documentation, accessible themes, scene packs and focused code changes. A
recording studio gets better through repeatable results, not feature count alone.

## Find the right starting point

| I want to… | Start here |
| --- | --- |
| Use the app and report a problem | [First recording](docs/START-HERE.md), then [beta testing](BETA-TESTING.md) |
| Share a theme or scene | [Make a pack](docs/MAKING-A-PACK.md) and [working JSON example](examples/field-notes.json) |
| Build or distribute a fork | [Building and forking](docs/BUILDING-AND-FORKING.md) |
| Add an executable mod | [Source-reviewed module API](MODDING.md#mods-page-and-reviewed-source-modules) |
| Work on audio or performance | [Measurement guide](docs/PERFORMANCE.md) and [source map](MODDING.md#source-map) |
| Package a release | [Release process](RELEASING.md), [Linux](docs/LINUX.md), [Mac preview](docs/MACOS.md) |

## Make a focused change

1. Check existing issues and the [roadmap](ROADMAP.md). Explain the user problem
   before a large API, capture, dependency or format change. Small docs/fix PRs
   can go straight to a branch.
2. Use Node.js 24 and `npm ci`. Follow the platform setup in the build guide.
   Source archives exclude encoder executables; installed-app downloads are
   separate. `npm run setup` is only needed to retry Electron installation.
3. Make one coherent change. Keep user media local by default and optional mods
   unloaded when disabled. Preserve capture clocks, separate stems and bounded
   queues; no synchronous I/O or unbounded work in the per-sample audio loop.
4. Run checks relevant to the behavior. Explain what you could not verify.
   For docs-only changes, check commands, UI labels, relative links and examples;
   no full desktop rebuild is needed.
5. Open a PR explaining the problem, resulting behavior and verification. Include
   small screenshots for visible UI changes. Do not include private recordings,
   device credentials, user settings, dependencies, installers or build output.

AI-assisted contributions are welcome under the same review standard: understand
the change, check its source/licenses, run meaningful checks and describe real
results. Do not claim tests or hardware checks that were not performed. Keep
large generated rewrites out of a small bug fix.

## Verification map

Install FFmpeg/ffprobe for integration checks (`ffprobe` on PATH). `TAKE_FFMPEG`
can point to a system encoder. Browser/native integration scripts additionally
need Playwright and Chromium/Electron; CI workflows show the exact setup. Run
browser scripts sequentially because they share the preview server port.

| Area | Checks |
| --- | --- |
| Shared behavior | `npm test` |
| Audio, stems and meters | DSP/worklet tests in the shared suite; `node tests/audio-meters-ui.cjs`; real-mic listening |
| Scene positioning/crop | `node tests/framing-ui.cjs`; visible preview and recorded-output checks |
| Video quality | `node tests/quality-ui.cjs`; set `LATITUDE_TEST_HEIGHT`/`LATITUDE_TEST_FPS`; inspect decoded file FPS |
| Streaming | `node tests/streaming-ui.cjs`; local receiver/reconnect and independent local recording |
| Editor | `node tests/editor-mod-ui.cjs`; real native IPC and export |
| Updates | `node tests/updater-ui.cjs`; check both skip and handoff behavior |
| Performance | `npm run bench:audio`, `npm run soak:audio`; scope/limits in [PERFORMANCE.md](docs/PERFORMANCE.md) |

`TAKE_TEST_BROWSER` and `TAKE_TEST_ELECTRON` can select test executables. Synthetic
browser capture does not verify physical device capture. CI tests with a system
encoder do not replace verification of the exact packaged encoder. Native Linux
routing tests need an isolated disposable audio server; follow the CI harness,
not your everyday sound session, because fixtures change its defaults.

The source Tests workflow runs on PRs/pushes. Preview packaging artifacts are not
public releases. Most CI permissions are read-only; the intentional release
publish job has narrowly scoped write permission. Actions are pinned. Windows
is unsigned, Linux is a preview, and Mac packaging is a development preview;
report platform confidence accurately.

## Rights and review

Latitude application code is [MIT licensed](LICENSE). Keep applicable copyright
and license notices. Dependencies, fonts and media retain their own licenses;
include provenance for any new asset. Do not change existing licenses casually.
A fork does not need upstream approval or a promise to contribute back.

A PR is a proposal, not a guaranteed merge or support contract. Keep changes
small enough to review, be clear about tradeoffs, and preserve easy ways for
users to save and export their work. Questions and feedback:
[GitHub issues](https://github.com/zphat/Latitude/issues) or
[Discord](https://discord.gg/EnPRdDutAn).
