# Make your first theme or scene pack

A settings pack is a JSON file with themes and/or scene templates. It is the
simplest way to contribute without compiling Latitude. It cannot run code.
For the full schema and trusted code-mod API, see [MODDING.md](../MODDING.md).

## Build from a working scene

1. Download the desktop beta and arrange a scene with your own sample images.
   Confirm it works without a camera if you intend it for faceless recording.
2. Choose **Settings → Export my layout**. This exports the current theme and
   scene composition, including embedded supported images. Give the file a clear
   name. Do not add credentials, private screenshots or device identifiers.
3. Use that JSON as your starting point, or copy
   [examples/field-notes.json](../examples/field-notes.json). Keep the format's
   `version` at `1`; it is a schema version, not your product's release number.
4. Import through **Settings → Import pack**, review the summary, then apply a
   template. Connecting screens/mics remains a separate user action. Applying a
   template replaces the destination scene composition, so back up a scene first.
5. Check the result in a short recording. A UI theme changes the app chrome,
   not the footage. Scene text, images and colors affect the composed picture.
6. Export/import again, restart, then disable/re-enable the pack in Mods. Make
   sure your documented result still works and existing recordings remain intact.

One community pack is installed at a time. Combine related choices into one
pack: up to eight themes and eight templates, with a 12 MB import limit including
embedded assets. See the [layer/asset limits](../MODDING.md#layer-schema) before
adding large images. Small static assets preserve the recorder's resource budget.

## What you can distribute today

| Content | Current delivery path |
| --- | --- |
| UI color themes | Version-1 settings pack |
| Scene layouts, text/color layers, static PNG/JPEG/WebP graphics | Scene template with composition and embedded images |
| Intro/outro videos, music or sound effects you have rights to distribute | Separate media files imported into the Editor; keep originals with the project |
| Editor project example | `.latitude-edit` plus its referenced media and instructions; test relinking on another folder |
| New transition algorithms, animated recording sources, new audio processors | Source changes/trusted module work; not a settings-pack feature |
| Font installation | Not supported through Latitude settings packs |

Do not market an animated overlay, installable transition or font pack as a
one-click Latitude mod before that delivery path exists and is tested. The
Editor supports its documented built-in effects; importing a video is different
from installing a new effect. Executable third-party mod installation and an
online catalog are not implemented.

## Include a small README with your download

State the pack's name, author, release date, tested Latitude version/platforms,
what it contains, import steps, which scene it replaces, aspect ratio and any
required media. Include a screenshot of the actual imported result, an uninstall
or disable instruction, and a changelog. State clearly what is not supported.

Ship `LICENSE` and `CREDITS` alongside the JSON, rather than expecting arbitrary
new JSON fields to grant rights or display in the app. List the source and license
of each image, font and sound, and whether buyers/users can modify and redistribute
it. The app's MIT license does not automatically license third-party artwork.
Do not include system fonts just because they are installed on your computer.

For a cross-app kit, give each application its own folder and instructions.
Longitude documents importing Latitude theme packs, but that does not make
Latitude scenes, editor projects or executable mods interchangeable. Test each
claimed app/version; include ordinary PNG/JPEG media where portable files help.
See [the ecosystem workflow](ECOSYSTEM.md).

## Before sharing

- Test readable text, focus indicators and warning colors on every background.
- Test ordinary and narrow windows; include a faceless example where appropriate.
- Check landscape/portrait crops instead of assuming one layout fits both.
- Verify that offline import needs no external image URLs or script downloads.
- Preserve upstream asset licenses and avoid private/test credentials in previews.
- Give a simple way to report a problem. Payment, if any, does not make a pack
  officially reviewed or supported by Latitude.

To propose inclusion upstream, attach the JSON and small screenshots to a pull
request with rights/credits information. Large media belongs in a separate
versioned download, not the application repository. Inclusion is reviewed; a
working pack does not need to be merged to remain useful to others.
