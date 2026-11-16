# Latitude 0.9.9 library navigation and release gates

## Scope

The existing optional Editor owns the library dialog, canvases and listeners.
No framework, media decoder, font asset or production dependency is added.
The separate pack service is not bundled or deployed; Discover is an honest
unconnected state. The preset format, source media, voice DSP and export formats
are unchanged.

## Native regression coverage

`tests/editor-creative-ui.cjs` opens the real Electron app with synthetic media.
It covers Included/My library/Favorites isolation, creator search, a larger
preview, Back/Escape focus and scroll restoration, close/reopen search and scroll,
Ctrl/Cmd+F, applying/undoing a style, native import/export, untrusted review claims,
font loading, preview/export colors, long names, 960×640 and 1280×720 windows,
125%/150% scaling, project/selection/playhead/history preservation, and mod
disable/re-enable. Distant cards stay unpainted until scrolled into view.
The original save/export, decoded-frame scrub and gesture suites also remain
required. Screenshots are retained on failures as well as success.

The shared pure-model tests cover corrupt view preferences, destination filters,
multiword/diacritic-insensitive search, collection names and creators. The
release-gate test prevents removing Windows or Linux live updater verification
from the publisher's required dependencies.

## Independent live updater gate

The Windows and Linux packaging jobs still run every deterministic native
updater UI assertion. The same full suite, including the exact production
unauthenticated HTTPS transport to GitHub metadata/checksums, runs in a required
`live-updater` job for each platform. A network-only failure can be retried on
its own after diagnosis; it cannot publish an unchecked package. Standalone
Linux builds retain their inline live check by default. HTTP diagnostics record
status, rate-limit headers and request ID, never credentials. TLS, URL, checksum,
licensing, architecture and publication guards are unchanged.

## Evidence and limits

PR #12 tracks the current native checks and screenshot review. Preceding native
passes identified and fixed two test references after navigation changed; neither
was used to waive pack persistence or project-state assertions. A library-close
scroll bug was found during review and has a dedicated close/reopen assertion.

Release jobs must pass at the exact final release commit before publishing.
Native CI is not hardware capture, long-recording, GPU or installation validation.
Windows is unsigned beta; Linux is a Flatpak preview. macOS remains unsigned and
unnotarized, requires 14.2+, and uses manual updates.
