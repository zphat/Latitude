# Editor gestures and navigation — 0.9.7

Local verification uses Electron 44.8.0, Node 24 and Linux FFmpeg 7.1.5. Each release platform reruns native tests with its own bundled encoder before packaging/publication. A local test is not a native Mac or Windows result.

## Defects and behavior covered

- Old trim gestures redrew the original playhead position, making it hard to judge the cut. Start trims now show the first retained frame, end trims the last retained frame. The exact source time is checked from decoded binary frame IDs during a held mouse gesture.
- Moving clips snapped only their start. Both moving edges and both trim edges now snap within an eight-pixel threshold. Source bounds are shared across linked clips; unreachable snap targets do not display a guide.
- Numeric linked trims could clamp sources independently, changing sync. Inspector position/source-in/length edits now use the same shared constraints as pointer gestures.
- Ruler labels could extend beyond the planned timeline and grow empty scrollable space. Ruler ticks and their overflow now stop at the timeline extent.
- Timeline width could shrink during an end trim and clamp the scroll offset under the pointer, adding an unintended second trim. Width stays at least as wide as the gesture's original timeline until release.
- Selecting a clip after Undo could leave editing buttons disabled. Selection now synchronizes those buttons immediately.
- Pointer movements are coalesced into animation frames; snap points are built once, unchanged placements skip model work, and edge-scrolling stops at limits or when canceled. Wheel/blur/key listeners and pending frames are removed when the mod is disabled. No new production dependency or decoder is used.

## Checks

- `tests/editor-gestures.test.cjs`: snapping at both moving edges/trim edges; markers/playhead targets; unreachable targets; joint source and timeline bounds at 24/30/60 fps; locked linked layers; cut navigation across gaps/layers; cursor-centered zoom math.
- `tests/editor-gestures-ui.cjs`: actual native Electron file import, linked video/audio, held live trim with decoded frame IDs, single-entry undo, action re-enabling, Escape restoration, locked audio blocking a linked trim, Alt changing snapping during a held gesture, typed source trims, keyboard cut navigation, Ctrl/Cmd-wheel anchoring, Shift-wheel scrolling, stable zoomed end trims, stationary edge scrolling, remembered snapping and listener removal after disabling the mod.
- Native screenshots cover 960×640, 1280×720, 125% display zoom and 1480×1000 at 150%, including long source/layer names and nine layers. Save/Export remain above the scrolled editor. Panels and tracks scroll independently; high scaling can still require vertical scrolling.
- Existing `editor-scrub-ui` checks cover decoded-frame seeking, long-GOP sources, raw-take indexing, mixed frame rates and real rendered cut alignment. `editor-mod-ui` covers source import, audio monitoring, linked/ripple cuts, insertion, detach/copy/paste, titles, save, separate-track export, layout and teardown.
- Local validation passed all 121 Node tests and seven Mac publication guard tests. Native gesture, scrubbing and editor save/export scripts passed locally. Windows/Linux and both Mac native package jobs must pass before distributing their installers; public preview status is unchanged.

## Remaining limits

This pass improves ordinary cuts, trimming and navigation; it does not add multiselect, rolling/slip edits, time stretching, auto captions or AI services. Snap/preview responsiveness still depends on source decoding and hardware, especially heavy 4K or unusual/VFR media; the lighter preview option remains available. Native fixtures and screenshots do not certify device capture, GPU behavior, long sessions or Mac signing/notarization. Audio DSP, export normalization and original media bytes are unchanged by these timeline controls.
