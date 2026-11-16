# Creative library: layout and integration plan

The existing offline editor remains the starting point. The separate
[pack service](../services/packs/README.md) supplies catalog, version, compatibility,
review and ownership data. It is not wired into the application yet; these are
the implementation requirements for that next visual pass.

## One library, clear destinations

Use **Creative library** beside the editor's existing project actions. Within it:

- **Included**: everything shipped with Latitude; no sign-in or network needed.
- **My library**: installed and owned packs, with Installed/Download again/Update
  pack states. Imported local packs retain their Local · not reviewed label.
- **Discover**: an optional, deliberately opened catalog. Preserve a usable
  offline state when the catalog is unavailable; no background refresh while
  recording. Show only real available content, with honest empty states.
- **Favorites**: styles and collections saved by the user.

Keep categories (Titles, Transitions, Looks, Fonts; later Animations/Artwork)
separate from these destinations. Search should match name, creator, description
and tags. Retain the current query, filters, scroll position and focused card
when returning from details. Provide Clear filters and meaningful no-results copy.

## Cards and details

Each card should show one useful preview, name, creator, type/count and a plain
status: Included, Local, Reviewed, Installed, Update available, Requires update
or Planned. A paid pack should show an exact one-time price only when that
listing is real. Until purchases are enabled, say so rather than showing an
active Buy button. Never imply that a local file approved itself.

Open details without losing the browse position. Show all included items,
preview controls, editable properties, download size, required Latitude version,
license/attribution and what the curator checked. Keep the primary action fixed
and visible. An owned pack offers Download again, not another purchase. Removing
a local installation must explain that projects retain already applied settings.

Reuse the current single hovered-preview animation and existing media decoders.
Do not autoplay a wall of animated thumbnails, load every font into memory, add a
webview, or introduce another UI framework. Respect reduced motion.

## Comfortable small-window behavior

At 960×640 use horizontal destination/category controls with a compact filter
row; let the card grid scroll independently. Open details as a full-width
in-library page with a visible Back button. At wider sizes a split detail view
may be used. Avoid nested horizontal scrolling or a permanently wide sidebar.

Search, category, selected pack, detail close/back, download state and main editor
Save/Export must remain reachable with keyboard and scaling at 125%/150%.
Library resize/open/close must preserve the project, media, selection, playhead,
unsaved edits and ongoing export state. Return focus to the opener on close.

No payments appear in the timeline, inspector or export path. No subscription,
currency tokens, randomized paid packs, mandatory sign-in for editing or online
license checks on saved projects are part of this plan.

## Next implementation gates

1. Implement and test these layouts in a native coding/preview workspace using
   the existing library and CSS. Test Include/My library navigation and keyboard
   focus before adding remote catalog controls.
2. Add opt-in native catalog/download IPC with cancellation, endpoint allowlist,
   byte/digest verification, compatibility checks, atomic local install, and
   persisted review provenance outside imported manifests. Offline import stays.
3. Test download interruption/retry, catalog unavailable, unsupported versions,
   removed listings, duplicates, removal without project changes, and disabling
   the Editor while a request or preview is active.
4. Visually inspect 960×640, 1280×720, larger windows and 125%/150% scaling with
   long titles, lots of packs and layered projects. Re-run save/export, scrub,
   gesture, font and lifecycle suites. Do not claim this visual work is tested
   from backend tests alone.
5. Add real content and the authenticated payment adapters only when the owner
   supplies the Stripe/account configuration. Future fonts/animation media and
   artwork need a separate secure asset format and renderer/export support.
