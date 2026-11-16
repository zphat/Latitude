# Editor scroll and drag regression check

Follow-up to 0.9.8, verified locally on Linux with Electron 44.11.3.

## Fixed behavior

- A held preview drag owns its pending edit until pointer release or Escape.
  Delete, Split, Undo, markers and navigation must not change the project or
  history underneath it. Before the fix, Delete removed the selected linked
  clips during the drag. The native test reproduces this failure on the old code
  and checks that Escape still restores the original project, history and time.
- The timeline reuses its buffered rows and waveforms for vertical scrolling and
  horizontal movement within that region. In the native 63-clip, nine-layer
  fixture, 16 scroll movements previously caused 16 row replacements; now they
  cause zero. This is a DOM-work measurement, not a CPU/FPS or hardware benchmark.
- Leaving the buffered region renders the newly visible clips. Widening a window
  also refreshes coverage through a resize observer. Selection, project settings,
  media, playhead and history remain independent of viewport changes.
- Disabling the editor disconnects the resize observer, removes the scroll
  callback and cancels pending animation work. There is no new dependency,
  polling timer or media decoder; project and export formats are unchanged.

## Verification

- 128 Node tests pass, including model, audio and native export checks.
- Native gesture suite passes held-drag commands, Escape restoration, scroll
  reuse, far scrolling, resize coverage, observer cleanup, linked trimming,
  exact retained-frame previews, snapping, Alt bypass, zoom and edge scrolling.
- Native editor suite passes project save/reopen, linked editing and real
  separate-track export. Creative suite passes pack IO, font/color parity,
  resize and optional-mod cleanup. Scrub suite passes exact frame IDs,
  latest-seek-wins and decoder reuse.
- Screenshots inspected at 960×640 and 1280×720/125%, plus Creative library at
  150%. Existing controls remain accessible through the small-window scroll
  areas; Save and Export remain pinned. Resize coverage also exercises a 2560px
  window with the existing 1800px editor width limit.

These are local Linux results. Native Windows/macOS packaging, physical capture,
long takes, GPU behavior and installer/update testing remain separate checks.
The published 0.9.8 downloads and homepage are unchanged by this follow-up.
