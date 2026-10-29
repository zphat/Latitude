# Build Latitude or maintain a fork

For an installed app, use [Releases](https://github.com/zphat/Latitude/releases).
GitHub source ZIPs do not include an installed runtime or encoder executable.

## Choose your starting point

Use a release tag for a reproducible baseline, or `main` for development that may
not yet be released. Node.js 24 matches CI. Start from a normal user account.

```sh
git clone https://github.com/zphat/Latitude.git
cd Latitude
npm ci
```

`npm ci` installs development dependencies and runs their normal installation
scripts. If the Electron runtime download was interrupted, `npm run setup`
retries that download; it is not normally a second required installation step.
Install FFmpeg/ffprobe for integration tests, with `ffprobe` on PATH. Set
`TAKE_FFMPEG` to a known executable if testing a system encoder instead of the
one installed by `ffmpeg-static`.

| Platform | Before `npm start` | Packaging |
| --- | --- | --- |
| Windows x64 | `node scripts/prepare-encoder.cjs` | `npm run dist:win -- --x64 --publish never` |
| Linux x64 | Native build dependencies, `npm run build:linux-audio`, then `node scripts/prepare-encoder.cjs` | Follow [Linux prerequisites](LINUX.md#build-from-source), then `npm run dist:linux -- --x64 --publish never` |
| macOS development preview | On a Mac, `node scripts/prepare-mac-encoder.cjs` | `npm run dist:mac -- --arm64 --publish never` or `--x64` on the matching architecture; see [Mac release gates](MACOS.md) |

The Linux encoder preparer deliberately checks a reviewed binary hash. A mismatch
needs a provenance/license review, not removal of that check. Build and test on
each target platform; a package produced on one platform is not evidence of
working capture on another. Mac preview artifacts are not notarized public releases.

For UI-only work, `npm run preview` serves the interface at
`http://127.0.0.1:4173`. It does not provide the installed app's native IPC,
system capture permissions or full file/export workflow. Use the desktop app
for those checks. Do not add `--no-sandbox` as an installation workaround.

## Contribute without maintaining a whole fork

- A color/layout pack: [Make a pack](MAKING-A-PACK.md); no build required.
- A small fix: branch from upstream, explain a reproduction, and open a PR.
- A code mod: use the source-reviewed catalog and lifecycle in
  [MODDING.md](../MODDING.md). Begin with a single capability and release all
  owned resources on disable. The module API is not a security sandbox.
- A new output/codec: keep it out of the per-sample audio loop and verify the
  exact bundled encoder, timestamps and separate-track behavior.

Keep broad ideas in an issue before implementing a major new framework, loader,
project schema or capture backend. Contributors can also improve docs, test a
real device, create a minimal reproduction or share a pack without coding.

## If you distribute your own fork

The [MIT license](../LICENSE) permits modification and distribution, including
commercial use, while retaining its copyright/license notice. It does not require
you to submit changes upstream. Contributions back are welcome. Dependency and
asset licenses remain separate; see [third-party notices](../THIRD-PARTY-NOTICES.md).

A fork should be distinguishable and install safely beside Latitude. This is an
engineering checklist, not an added restriction on the MIT license:

1. **Choose your identity.** Review `package.json` name/productName/appId,
   installer shortcut names and artifact names. Review Linux desktop/Flatpak IDs
   in packaging, native code and workflows, plus macOS bundle metadata. Replace
   app icons and user-facing contact/help links so users know who supports it.
2. **Separate user data.** Review Electron's userData directory and the legacy
   `Take Studio` profile migration in `electron/main.cjs`. A renamed fork should
   not silently take over that profile. Review recording defaults, renderer
   storage, assets and editor drafts. Test side-by-side install, launch and uninstall
   with a disposable profile. Do not test migration against your only real takes.
3. **Own or disable updates before distributing.** `electron/updater.cjs` pins
   Latitude's GitHub API, download paths and asset names. Change all matching
   validation and tests for your repository, or disable the fork's update path.
   Changing only `package.json.repository` is insufficient. Do not replace the
   strict URL checks with an unrestricted downloader. A fork must not install
   official Latitude over itself or trust somebody else's release credentials.
4. **Review release automation.** Do not push a `Release Latitude v…` commit just
   to try a build. The official release workflow can publish tags and binaries.
   Use local packaging with `--publish never` or a separate preview workflow until
   your destinations, signing identities, licenses and checksums are correct.
5. **Retain attribution and your changes.** Keep source/license notices, document
   what differs, list tested platforms and disclose untested capture paths.
   Use your own signing credentials; never copy secrets into source, packs or CI logs.
6. **Keep interchange deliberate.** Prefer existing media/project formats when
   compatible. Version incompatible schema changes and supply migrations or a
   clear export route; do not reinterpret an existing version silently.

Before distributing, run a source search for `zphat`, `Latitude`, `Take Studio`,
`studio.latitude.recorder`, `latitude.pictures`, and the Discord invite. Review
matches individually: retain historical attribution while changing operational
update, support, install and storage identities. A global text replacement can
break existing formats and migrations.

## Test the change you made

`npm test` covers the shared suite. The [contributor guide](../CONTRIBUTING.md)
maps specialized checks to their purpose. For capture/audio work, also perform
real-device tests; synthetic tones and mocked browser capture are insufficient.
A successful build is a packaging result, not certification of recording quality.

When sharing a PR, include the smallest reproduction, the resulting behavior,
checks run and known limits. For a distributable fork, provide your source tag,
release notes, checksums and your own support destination.
