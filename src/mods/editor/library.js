import { BUILTIN_PACKS, PACK_LIMITS, validatePack, presetFromClip } from "./packs.js";
import { cssColor } from "./color.js";
import { clipMask, ease } from "./motion.js";
import { fontSpec } from "./fonts.js";
import { LOCATIONS, KINDS, libraryView, isPremium, visiblePacks, searchPresets, searchCollections } from "./library-model.js";
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function createLibrary({ root, ui, io, fonts, selection, apply, addTitle, stop }) {
  const dialog = document.createElement("dialog");
  dialog.id = "edit-library"; dialog.className = "editor-library"; root.append(dialog);
  const controller = new AbortController();
  const listen = (el, event, fn) => el.addEventListener(event, fn, { signal: controller.signal });
  let limit = 60, animation = null, frame = 0, generation = 0, disposed = false, operating = false,
    opener, detail = null, detailOpener = null, detailScroll = 0, restoreFrame = 0, previewObserver = null;
  let saved, savedView;
  try { saved = ui.readSettings("latitude-editor-library"); savedView = ui.readSettings("latitude-editor-library-view"); } catch {}
  const view = libraryView(savedView), installed = [];
  for (const item of (Array.isArray(saved?.installed) ? saved.installed : []).slice(0, PACK_LIMITS.installed)) {
    try {
      if (typeof item.id === "string" && !item.id.startsWith("builtin-") && /^[\w-]{1,80}$/.test(item.id) && !installed.some(p => p.id === item.id))
        installed.push({ id: item.id, pack: validatePack(item.pack) });
    } catch {} // Corrupt local packs must never prevent opening a project.
  }
  const favorites = new Set((Array.isArray(saved?.favorites) ? saved.favorites : []).filter(v => typeof v === "string").slice(0, 256));
  const persist = () => ui.writeSettings("latitude-editor-library", { installed, favorites: [...favorites].slice(0, 256) });
  // Small preferences are separate: searching must not rewrite installed pack data.
  const persistView = () => { try { ui.writeSettings("latitude-editor-library-view", view); } catch {} };
  const filter = () => view.filters[view.location];
  let packs, index;
  function reindex() {
    packs = [...BUILTIN_PACKS.map((pack, i) => ({ pack, id: "builtin-" + i, included: true })), ...installed];
    index = new Map();
    for (const item of packs) item.pack.presets.forEach((preset, i) => {
      const key = item.id + ":" + i; index.set(key, { ...item, preset, key });
    });
  }
  reindex();
  for (const key of favorites) if (!index.has(key)) favorites.delete(key);
  const $ = s => dialog.querySelector(s);
  const status = (message, error = false) => {
    if (disposed) return;
    $("#library-status").textContent = message; $("#library-status").classList.toggle("error", error);
  };
  const run = fn => async () => {
    if (operating || disposed) return;
    operating = true; dialog.setAttribute("aria-busy", "true");
    try { await fn(); } catch (e) { status(e.message, true); }
    finally { operating = false; dialog.setAttribute("aria-busy", "false"); }
  };
  function stopAnimation() { cancelAnimationFrame(frame); frame = 0; animation = null; }
  function stopCardPreviews() { previewObserver?.disconnect(); previewObserver = null; }
  function clearCanvases(container) { for (const c of container.querySelectorAll("canvas")) c.width = c.height = 1; }
  const sample = document.createElement("canvas"); sample.width = 240; sample.height = 135;
  {
    const ctx = sample.getContext("2d"), gradient = ctx.createLinearGradient(0, 0, 240, 135);
    gradient.addColorStop(0, "#527a90"); gradient.addColorStop(.5, "#b89075"); gradient.addColorStop(1, "#d1b897");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 240, 135);
    ctx.fillStyle = "#183a36"; ctx.beginPath(); ctx.arc(50, 135, 82, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d1ff4a"; ctx.fillRect(172, 30, 42, 72);
    ctx.fillStyle = "#fff3df"; ctx.beginPath(); ctx.arc(120, 60, 24, 0, Math.PI * 2); ctx.fill();
  }
  function draw(canvas, preset, progress = .65) {
    if (!canvas.isConnected || disposed) return;
    const ctx = canvas.getContext("2d"), s = preset.settings;
    ctx.setTransform(canvas.width / 240, 0, 0, canvas.height / 135, 0, 0);
    ctx.clearRect(0, 0, 240, 135); ctx.fillStyle = "#101a18"; ctx.fillRect(0, 0, 240, 135);
    ctx.save();
    if (preset.kind === "transition") {
      const p = ease(progress, s.easing), type = s.transition;
      let x = 0, y = 0;
      if (type === "slide-left") x = -240 * (1 - p);
      if (type === "slide-right") x = 240 * (1 - p);
      if (type === "slide-up") y = 135 * (1 - p);
      if (type === "slide-down") y = -135 * (1 - p);
      ctx.globalAlpha = type === "fade" ? p : 1;
      clipMask(ctx, type, p, x, y, 240, 135); ctx.drawImage(sample, x, y);
    } else if (preset.kind === "look") {
      ctx.filter = cssColor(s); ctx.drawImage(sample, 0, 0);
    } else {
      ctx.fillStyle = s.box ? "#1c2926" : "#111a18"; ctx.fillRect(10, 20, 220, 95);
      ctx.fillStyle = s.color || "#edf4df"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      ctx.font = fontSpec(s.font, preset.kind === "font" ? 25 : 23);
      if (s.gradient) { const g = ctx.createLinearGradient(20, 0, 220, 0); g.addColorStop(0, s.color); g.addColorStop(1, s.color2); ctx.fillStyle = g; }
      ctx.fillText(preset.kind === "font" ? "Your next story" : preset.name, 120, 65, 204);
      ctx.fillStyle = "#9eafa7"; ctx.font = "11px sans-serif"; ctx.fillText(s.font, 120, 97, 204);
    }
    ctx.restore();
  }

  const canApply = preset => {
    const c = selection();
    return c && !c.locked && c.kind !== "audio" && (!["title", "font"].includes(preset.kind) || c.kind === "title");
  };
  function actionButtons(item) {
    return '<button class="button small" data-apply="' + escape(item.key) + '"' + (canApply(item.preset) ? "" : " disabled") + '>Apply</button>'
      + (["title", "font"].includes(item.preset.kind) ? '<button class="button small" data-add="' + escape(item.key) + '">Add title</button>' : "");
  }
  function refreshActions() {
    for (const b of dialog.querySelectorAll("[data-apply]")) b.disabled = !canApply(index.get(b.dataset.apply)?.preset);
  }
  function emptyMessage() {
    const hasFilters = filter().query || filter().collection;
    const heading = hasFilters ? "No matches" : view.location === "library" ? "Make this library yours"
      : view.location === "favorites" ? "Keep your favorites close" : "No styles in this category";
    const copy = hasFilters ? "Try a shorter search or clear the filters."
      : view.location === "library" ? "Import a preset pack or save a style from your selected clip. Included styles have their own tab."
      : view.location === "favorites" ? "Use the star beside any style to find it here."
      : "Choose another category or view all styles.";
    return '<div class="library-empty"><h3>' + heading + '</h3><p>' + copy + '</p>'
      + (hasFilters ? '<button class="button small" data-clear>Clear filters</button>'
        : view.location === "library" ? '<button class="button small" data-import>Import pack…</button>'
        : '<button class="button small" data-included>Browse included styles</button>') + '</div>';
  }
  function renderCards() {
    stopAnimation(); stopCardPreviews(); const token = ++generation;
    const matches = searchPresets(packs, view.location, filter(), favorites, view.hidePremium), items = matches.slice(0, limit);
    clearCanvases($("#library-grid"));
    $("#library-count").textContent = matches.length + (matches.length === 1 ? " style" : " styles");
    $("#library-grid").innerHTML = items.length ? items.map(item =>
      '<article class="library-card" data-preset="' + escape(item.key) + '">'
      + '<button class="library-preview" data-detail="' + escape(item.key) + '" aria-label="Preview ' + escape(item.preset.name) + '"><canvas width="480" height="270"></canvas><span>Preview style</span></button>'
      + '<div class="library-card-body"><div class="library-card-heading"><h3>' + escape(item.preset.name) + '</h3>'
      + '<button class="text-button library-star" data-favorite="' + escape(item.key) + '" aria-pressed="' + favorites.has(item.key)
      + '" aria-label="Favorite ' + escape(item.preset.name) + '">' + (favorites.has(item.key) ? "★" : "☆") + '</button></div>'
      + '<p>' + escape(item.preset.description) + '</p><small>' + escape(item.pack.name) + ' · ' + (item.included ? "Included" : "Local") + '</small>'
      + '<div class="library-card-actions">' + actionButtons(item) + '</div></div></article>').join("") : emptyMessage();
    $("#library-more").hidden = matches.length <= limit;
    // Only visible cards (plus a small scroll buffer) allocate canvas pixels or load fonts.
    const byKey = new Map(items.map(item => [item.key, item.preset]));
    previewObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || disposed || token !== generation || !dialog.open || detail) continue;
        previewObserver?.unobserve(entry.target);
        const canvas = entry.target, preset = byKey.get(canvas.closest("[data-preset]").dataset.preset);
        draw(canvas, preset);
        if (preset.settings.font) fonts.ensure(preset.settings.font).then(() => {
          if (token === generation && dialog.open && !detail) draw(canvas, preset);
        }).catch(() => {});
      }
    }, { root: $("#library-body"), rootMargin: "160px 0px" });
    for (const canvas of $("#library-grid").querySelectorAll("canvas")) previewObserver.observe(canvas);
  }
  function renderPacks() {
    stopAnimation(); stopCardPreviews(); generation++; clearCanvases($("#library-grid"));
    const results = searchCollections(packs, view.location, filter(), favorites, view.hidePremium);
    $("#library-grid").innerHTML = results.length ? results.map(item =>
      '<article class="library-pack"><div><span class="library-badge">' + (item.included ? "Included by Latitude" : "Local · not reviewed")
      + '</span><h3>' + escape(item.pack.name) + '</h3><p>' + escape(item.pack.description) + '</p><small>'
      + item.pack.presets.length + ' styles · ' + escape(item.pack.author) + '</small></div><div class="library-card-actions">'
      + '<button class="button small" data-browse="' + escape(item.id) + '">Browse styles</button>'
      + '<button class="button small" data-export="' + escape(item.id) + '">Export pack</button>'
      + (item.included ? "" : '<button class="text-button" data-remove="' + escape(item.id) + '">Remove</button>') + '</div></article>').join("") : emptyMessage();
    $("#library-count").textContent = results.length + (results.length === 1 ? " collection" : " collections");
    $("#library-more").hidden = true;
  }
  function collections() {
    const choices = visiblePacks(packs, view.location, favorites, view.hidePremium);
    if (filter().collection && !choices.some(p => p.id === filter().collection)) filter().collection = "";
    $("#library-collection").innerHTML = '<option value="">All collections</option>' + choices.map(p =>
      '<option value="' + escape(p.id) + '">' + escape(p.pack.name) + '</option>').join("");
    $("#library-collection").value = filter().collection;
  }
  function updateSelection() {
    const c = selection();
    $("#library-selection").textContent = !c ? "Select a clip to apply a style, or add a new title."
      : c.locked ? "Locked layer: " + c.name + ". Unlock it to apply a style."
      : c.kind === "audio" ? "Choose a picture for looks and motion, or add a title. Audio is unchanged."
      : "Selected: " + c.name;
    $("#library-selection").title = $("#library-selection").textContent;
  }
  function render() {
    for (const b of dialog.querySelectorAll("[data-location]")) b.setAttribute("aria-pressed", String(view.location === b.dataset.location));
    for (const b of dialog.querySelectorAll("[data-category]")) b.setAttribute("aria-pressed", String(filter().category === b.dataset.category));
    const discover = view.location === "discover";
    $("#library-hide-premium").checked = view.hidePremium;
    $("#library-promo").hidden = view.hidePremium;
    $("#library-browse").hidden = !!detail || discover;
    $("#library-controls").hidden = !!detail || discover;
    $("#library-details").hidden = !detail;
    $("#library-discover").hidden = !discover;
    $("#library-save").hidden = !(view.location === "library" && filter().category === "packs");
    $("#library-search").value = filter().query;
    $("#library-clear").hidden = !filter().query && !filter().collection;
    collections(); updateSelection();
    if (!detail && !discover) filter().category === "packs" ? renderPacks() : renderCards();
    if (discover) { stopAnimation(); stopCardPreviews(); generation++; clearCanvases($("#library-grid")); $("#library-grid").replaceChildren(); }
  }
  function rememberScroll() { if (dialog.open && !detail) filter().scroll = $("#library-body").scrollTop; }
  function restoreScroll(value, focus) {
    cancelAnimationFrame(restoreFrame);
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = 0; if (disposed || !dialog.open) return;
      $("#library-body").scrollTop = value;
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    });
  }
  function closeDetail({ focus = true } = {}) {
    if (!detail) return;
    stopAnimation(); generation++;
    const key = detail.key; detail = null;
    clearCanvases($("#library-details")); $("#library-details").replaceChildren();
    $("#library-details").hidden = true; $("#library-browse").hidden = false; $("#library-controls").hidden = false;
    render(); detailOpener = [...$("#library-grid").querySelectorAll("[data-detail]")].find(b => b.dataset.detail === key) || $("#library-search");
    restoreScroll(detailScroll, focus ? detailOpener : null);
  }
  function chooseLocation(location) {
    if (!Object.hasOwn(LOCATIONS, location)) return;
    rememberScroll(); closeDetail({ focus: false });
    view.location = location; limit = filter().limit; render(); restoreScroll(filter().scroll); persistView();
  }
  function openDetail(item, button) {
    if (!item || (view.hidePremium && isPremium(item))) return;
    rememberScroll(); detailScroll = filter().scroll; detailOpener = button; detail = item; stopAnimation(); stopCardPreviews();
    $("#library-details").innerHTML =
      '<div class="library-detail-heading"><button class="button small" id="library-back">← Back to results</button><span class="library-badge">'
      + (item.included ? "Included by Latitude" : "Local · not reviewed") + '</span></div>'
      + '<div class="library-detail-grid"><div><canvas id="library-detail-canvas" width="960" height="540" aria-label="' + escape(item.preset.name)
      + ' preview"></canvas>' + (item.preset.kind === "transition" ? '<button class="button small" id="library-replay">Replay preview</button>' : "")
      + '</div><div><p class="eyebrow">' + escape(KINDS[item.preset.kind]) + '</p><h3>' + escape(item.preset.name)
      + '</h3><p>' + escape(item.preset.description || item.pack.description) + '</p><dl><dt>Collection</dt><dd>'
      + escape(item.pack.name) + '</dd><dt>Creator</dt><dd>' + escape(item.pack.author)
      + '</dd><dt>Availability</dt><dd>Installed · works offline</dd></dl><p class="fine-print">Apply a starting point, then adjust every setting in the Inspector. Your original media stays untouched.</p>'
      + '<div class="library-card-actions">' + actionButtons(item)
      + '<button class="button small" data-favorite="' + escape(item.key) + '" aria-pressed="' + favorites.has(item.key) + '">'
      + (favorites.has(item.key) ? "★ Saved" : "☆ Favorite") + '</button></div></div></div>';
    render(); $("#library-body").scrollTop = 0; $("#library-back").focus({ preventScroll: true });
    const canvas = $("#library-detail-canvas"), token = ++generation; draw(canvas, item.preset);
    if (item.preset.settings.font) fonts.ensure(item.preset.settings.font).then(() => {
      if (generation === token && dialog.open) draw(canvas, item.preset);
    }).catch(() => {});
  }
  function animate(canvas, preset) {
    stopAnimation();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { draw(canvas, preset, 1); return; }
    animation = { canvas, start: performance.now(), last: 0 };
    const tick = now => {
      if (!animation || !dialog.open || document.hidden || !canvas.isConnected) { stopAnimation(); return; }
      const t = (now - animation.start) / 1000;
      if (now - animation.last >= 1000 / 30) { draw(canvas, preset, Math.min(1, t / .85)); animation.last = now; }
      if (t < 1.1) frame = requestAnimationFrame(tick); else stopAnimation();
    };
    frame = requestAnimationFrame(tick);
  }
  function install(pack) {
    if (installed.length >= PACK_LIMITS.installed) throw Error("Remove a local pack before adding another (20-pack limit).");
    const canonical = validatePack(pack);
    if (packs.some(item => JSON.stringify(item.pack) === JSON.stringify(canonical))) throw Error("This exact pack is already in your library.");
    installed.push({ id: crypto.randomUUID(), pack: canonical });
    try { persist(); } catch (e) { installed.pop(); throw e; }
    reindex();
    closeDetail({ focus: false }); view.location = "library"; Object.assign(filter(), { category: "packs", query: "", collection: "", scroll: 0, limit: 60 });
    render(); restoreScroll(0); status("Added " + canonical.name + ". Settings stay editable and work offline.");
  }
  dialog.innerHTML = '<header class="library-header"><div><span class="eyebrow">MAKE IT YOURS</span><h2>Creative library</h2><p id="library-selection"></p></div>'
    + '<div class="library-header-actions"><details class="library-options"><summary>Options</summary><div class="library-options-panel"><label><input id="library-hide-premium" type="checkbox"> Hide premium content</label><small>Show only free and personal styles. This never changes a project or removes a pack.</small></div></details>'
    + '<button class="button small" id="library-close" aria-label="Close creative library">Done</button></div></header>'
    + '<nav class="library-locations" aria-label="Library destinations">' + Object.entries(LOCATIONS).map(([id, label]) =>
      '<button class="button small" data-location="' + id + '" aria-pressed="false">' + label + '</button>').join("") + '</nav>'
    + '<div id="library-controls"><div class="library-filters"><input id="library-search" type="search" placeholder="Search styles, collections, creators…" aria-label="Search creative library" maxlength="120">'
    + '<select id="library-collection" aria-label="Collection"></select><button class="text-button" id="library-clear" hidden>Clear filters</button></div>'
    + '<nav class="library-tabs" aria-label="Creative categories">' + Object.entries(KINDS).map(([id, label]) =>
      '<button class="button small" data-category="' + id + '" aria-pressed="false">' + label + '</button>').join("") + '</nav></div>'
    + '<div class="library-body" id="library-body"><section id="library-browse"><details id="library-save" class="library-save" hidden><summary>Save your own style</summary>'
    + '<p>Make a reusable preset from the selected clip. Removing a pack never changes your edits.</p><div class="library-save-controls">'
    + '<input id="library-pack-name" placeholder="Name your preset…" aria-label="New preset name" maxlength="80"><select id="library-save-kind" aria-label="Save preset type">'
    + '<option value="look">Color look</option><option value="transition">Transition</option><option value="title">Title style</option></select>'
    + '<button class="button small" id="library-save-clip">Save selected style</button></div></details>'
    + '<div class="library-meta"><span id="library-count" role="status"></span><button class="text-button" id="library-import">Import pack…</button></div>'
    + '<div id="library-grid" class="library-grid"></div><button class="button small" id="library-more" hidden>Show more</button></section>'
    + '<section id="library-details" hidden></section><section id="library-discover" class="library-discover" hidden><span class="library-badge">YOUR COLLECTIONS</span>'
    + '<h3>Explore your creative tools</h3><p id="library-promo">Curated title, transition, font and animation collections will live here. The online catalog is not connected yet, and purchases are not enabled.</p>'
    + '<p>Your included styles and imported packs already work offline. You can build, export and share your own collections today.</p>'
    + '<div class="library-card-actions"><button class="button small" data-included>Explore included styles</button><button class="button small" data-import>Import a pack…</button></div></section></div>'
    + '<footer class="library-footer"><p id="library-status" role="status">All included styles are free and work offline. Make them your own in the Inspector.</p>'
    + '<small>Local imports are not reviewed by Latitude. Editing and exports never require a purchase.</small></footer>';
  const importPack = run(async () => { const pack = await io.call("import-pack"); if (pack && !disposed) install(pack); });
  listen($("#library-hide-premium"), "change", e => {
    view.hidePremium = e.target.checked;
    if (detail && isPremium(detail) && view.hidePremium) closeDetail({ focus: false });
    persistView(); render(); status(view.hidePremium ? "Showing free and personal styles." : "All styles are visible.");
  });
  listen(dialog, "pointerdown", e => { if (!e.target.closest(".library-options")) $(".library-options").open = false; });
  listen(dialog, "focusout", e => { if (e.relatedTarget && !e.relatedTarget.closest(".library-options")) $(".library-options").open = false; });
  listen($("#library-close"), "click", () => { rememberScroll(); dialog.close(); });
  listen(dialog, "close", () => {
    $(".library-options").open = false; persistView(); stopAnimation(); stopCardPreviews(); generation++; cancelAnimationFrame(restoreFrame);
    detail = null; clearCanvases($("#library-grid")); clearCanvases($("#library-details"));
    $("#library-grid").replaceChildren(); $("#library-details").replaceChildren(); opener?.focus({ preventScroll: true });
  });
  listen(dialog, "cancel", e => { if ($(".library-options").open) {
    e.preventDefault(); $(".library-options").open = false; $(".library-options summary").focus(); return;
  } if (operating || detail) { e.preventDefault(); if (!operating) closeDetail(); } else rememberScroll(); });
  listen(dialog, "keydown", e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault(); closeDetail({ focus: false });
      if (view.location === "discover") chooseLocation("included");
      $("#library-search").focus(); $("#library-search").select();
    }
  });
  listen(dialog, "click", e => {
    const b = e.target.closest("button"); if (!b || operating) return;
    if (b.dataset.location) { chooseLocation(b.dataset.location); return; }
    if (b.dataset.category) {
      closeDetail({ focus: false }); filter().category = b.dataset.category; filter().scroll = 0; limit = filter().limit = 60; render(); restoreScroll(0); return;
    }
    if (b.hasAttribute("data-clear") || b.id === "library-clear") {
      filter().query = filter().collection = ""; filter().scroll = 0; limit = filter().limit = 60; render(); restoreScroll(0); $("#library-search").focus(); return;
    }
    if (b.hasAttribute("data-included")) {
      view.filters.included = { category: "all", query: "", collection: "", scroll: 0, limit: 60 }; chooseLocation("included"); return;
    }
    if (b.id === "library-import" || b.hasAttribute("data-import")) { importPack(); return; }
    if (b.id === "library-back") { closeDetail(); return; }
    if (b.id === "library-replay" && detail) { animate($("#library-detail-canvas"), detail.preset); return; }
    if (b.dataset.detail) { openDetail(index.get(b.dataset.detail), b); return; }
    if (b.dataset.favorite) {
      const key = b.dataset.favorite, was = favorites.has(key);
      if (!was && favorites.size >= 256) { status("Remove a favorite before adding another (256-style limit).", true); return; }
      was ? favorites.delete(key) : favorites.add(key);
      try { persist(); } catch (error) { was ? favorites.add(key) : favorites.delete(key); status(error.message, true); return; }
      if (detail) {
        b.setAttribute("aria-pressed", String(!was)); b.textContent = !was ? "★ Saved" : "☆ Favorite";
        const star = [...$("#library-grid").querySelectorAll("[data-favorite]")].find(el => el.dataset.favorite === key);
        if (star) { star.setAttribute("aria-pressed", String(!was)); star.textContent = !was ? "★" : "☆"; }
      } else render();
      return;
    }
    const item = index.get(b.dataset.apply || b.dataset.add);
    if (item) {
      run(async () => {
        if (item.preset.settings.font) await fonts.ensure(item.preset.settings.font);
        if (disposed) return;
        if (b.dataset.add) addTitle(item.preset); else apply(item.preset);
        updateSelection(); refreshActions(); status(item.preset.name + " applied. Undo is available after closing the library.");
      })(); return;
    }
    if (b.dataset.browse) {
      const item = packs.find(p => p.id === b.dataset.browse); if (!item) return;
      Object.assign(filter(), { category: "all", collection: item.id, query: "", scroll: 0 }); render(); restoreScroll(0); return;
    }
    if (b.dataset.export) run(async () => {
      const item = packs.find(p => p.id === b.dataset.export); if (item && await io.call("export-pack", item.pack)) status("Pack exported. It contains presets, not your footage or title text.");
    })();
    if (b.dataset.remove) run(() => {
      const index = installed.findIndex(p => p.id === b.dataset.remove); if (index < 0) return;
      const old = installed.splice(index, 1)[0], oldFavorites = [...favorites];
      for (const key of favorites) if (key.startsWith(old.id + ":")) favorites.delete(key);
      try { persist(); } catch (error) { installed.splice(index, 0, old); favorites.clear(); oldFavorites.forEach(k => favorites.add(k)); throw error; }
      reindex(); render(); status("Local pack removed. Applied styles and project files are unchanged.");
    })();
  });
  listen($("#library-search"), "input", e => { filter().query = e.target.value; filter().scroll = 0; limit = filter().limit = 60; render(); restoreScroll(0); });
  listen($("#library-collection"), "change", e => { filter().collection = e.target.value; filter().scroll = 0; limit = filter().limit = 60; render(); restoreScroll(0); });
  listen($("#library-more"), "click", () => { limit += 60; filter().limit = limit; renderCards(); });
  listen($("#library-save-clip"), "click", run(() => {
    const c = selection(), kind = $("#library-save-kind").value;
    if (!c || c.kind === "audio") throw Error("Select a picture or title before saving its style.");
    if (kind === "title" && c.kind !== "title") throw Error("Select a title to save its typography and layout.");
    install(presetFromClip(c, kind, $("#library-pack-name").value)); $("#library-pack-name").value = "";
  }));
  listen($("#library-grid"), "pointerover", e => {
    const card = e.target.closest("[data-preset]"); if (!card || card.contains(e.relatedTarget) || detail) return;
    const item = index.get(card.dataset.preset);
    if (item?.preset.kind === "transition") animate(card.querySelector("canvas"), item.preset);
  });
  listen($("#library-grid"), "pointerout", e => { const card = e.target.closest("[data-preset]"); if (card && !card.contains(e.relatedTarget)) stopAnimation(); });
  listen(document, "visibilitychange", () => { if (document.hidden) stopAnimation(); });
  return {
    open(kind) {
      if (disposed) return; stop(); opener = document.activeElement; detail = null;
      if (kind && Object.hasOwn(KINDS, kind)) { view.location = "included"; filter().category = kind; }
      limit = filter().limit; render(); dialog.showModal(); restoreScroll(filter().scroll);
      $(view.location === "discover" ? "#library-close" : "#library-search").focus({ preventScroll: true });
    },
    destroy() {
      if (disposed) return; rememberScroll(); persistView(); disposed = true; stopAnimation(); stopCardPreviews(); cancelAnimationFrame(restoreFrame);
      controller.abort(); if (dialog.open) dialog.close();
      clearCanvases(dialog); dialog.remove(); sample.width = sample.height = 1; detail = detailOpener = opener = null;
    },
  };
}
