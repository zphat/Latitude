# Creative library and editable packs

The optional Editor has a **Library** button beside its project actions. Browse
Transitions, Looks, Titles and Fonts, search by name, choose a collection, or mark
favorites. Apply a style to the selected picture/title, or use **Add title** to
place editable text on the Titles layer at the playhead. Undo reverses the action.

The included collection contains 12 entrances, 12 color recipes, 12 title styles
and 15 bundled fonts plus system monospace. **Fade / enter** controls the length
of an entrance. Choose linear or smooth timing. An entrance reveals the incoming
clip; overlap two pictures to reveal one over the other. **Dissolve from previous**
also aligns their overlap and audio fades. These aren't automatic scene detection,
optical-flow effects, a full keyframe editor, or a color-managed grading system.

In **My packs**, save a selected clip's color, transition or title style. Export
the resulting `.latitude-pack` file to share it. Import opens a normal file dialog.
Imported packs are labeled **Local · not reviewed**. A pack cannot label itself
approved. Included collections are shipped in the reviewed application source.
There is currently no remote marketplace, paid listing or payment processing.

Applying a preset copies ordinary settings into the project. It never adds a
runtime reference to a pack, renames source files, includes footage, uploads
anything, changes voice processing, or changes the export format. Removing the
pack leaves saved edits intact. Saved title styles omit the actual title text.
Every setting can be adjusted by hand in the Inspector.

## Make a pack

Application and preset handling code is MIT. The initial pack format is data only:

```json
{
  "type": "latitude-editor-pack",
  "version": 1,
  "name": "Quiet entrances",
  "author": "Your name",
  "description": "Restrained motion for interviews.",
  "presets": [{
    "name": "Smooth lower third",
    "kind": "transition",
    "description": "Bring a name into the frame from below.",
    "settings": {
      "transition": "slide-up",
      "easing": "smooth",
      "fadeIn": 0.5,
      "fadeOut": 0.25
    }
  }]
}
```

`src/mods/editor/packs.js` is the shared renderer/main-process validator. It lists
the supported categories, fields and ranges. Unknown settings fail validation;
unknown metadata (including review, pricing or script claims) is discarded.
There are no paths, URLs, HTML, arbitrary CSS, filters or JavaScript expressions.
Use supported transition IDs and bundled font names; incompatible packs fail
with an explanation. Imports are limited to 128 KiB, 64 presets per pack and
20 installed local packs. This format does **not** embed fonts, clip art or video.

Both native import and export validate the file. Installation is local; settings
are remembered independently of project Undo and layout. Exported presets can
be inspected in any text editor. Native dialogs choose paths; a manifest never
chooses where to read or write files. UI previews use small generated canvases,
not additional video decoders. Only a hovered transition animates briefly;
reduced-motion preferences disable that animation. Closing the library stops it.

## Fonts and reproducible previews

Fonts load from bundled local files on demand, only while the Editor is enabled.
Open titles load their saved font before being shown; export waits for the exact
face before rendering its PNG. Disabling the mod removes its decoded font faces,
listeners and previews. Font files and upstream notices remain in `assets/fonts`.
`creative-fonts-sources.json` pins source URLs, a repository commit, sizes and
SHA-256 hashes. Retain their OFL or Apache notices when redistributing Latitude.
The collection adds about 2.3 MiB of fonts and notices, with no runtime dependency.

## Future optional catalog and paid collections

The product direction is optional, one-time purchases for authored styles and
assets, with ordinary editing and manual controls staying available. Buying a
collection should save time and provide a coherent visual identity. It should
not unlock an otherwise inaccessible export, effect parameter or audio tool.
The current library is the offline foundation, not a claim that a store exists.

Before adding an online catalog:

1. Keep catalog identity, review state, exact version, compatibility, artifact
   digest, creator attribution and price outside imported manifests. A server
   response or signed curated index must establish review; seller claims do not.
2. Review both the contents and redistribution rights. Display what was checked,
   by whom and when. A technical validation pass is not a rights review. Keep
   removal/reporting and revocation paths, without breaking users' existing edits.
3. Show the exact contents and final one-time price before checkout; no random
   paid packs, subscription requirement, token balance or account requirement for
   editing. Separate checkout/download infrastructure from the recording engine.
4. Cache purchased files for offline use, verify the downloaded bytes against the
   catalog digest, and let users export projects without an online license check.
   Keep any purchase entitlement outside the project model and renderer.
5. Add versioned asset-package handling before font, animation-media or clip-art
   packs: a bounded archive parser; no traversal/symlinks/executable files; MIME,
   dimension and decompression limits; checksums; per-file attribution; controlled
   local loading. Do not extend this JSON format to accept arbitrary URLs or code.
6. For new font files, track font identity/version and missing-font warnings so
   a replacement cannot silently change a title. Preserve explicit licenses.
   For clip art, support transparent images and editable placement first. Avoid
   adding a second decoder, a webview or a graphics framework for the catalog.

Custom motion/keyframes and animated asset packs are later engine capabilities;
a preset recipe may only use effects the installed renderer and exporter both
implement. Preview/export parity, offline behavior and mod cleanup remain gates.
