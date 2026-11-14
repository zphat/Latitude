import { BUILTIN_PACKS, PACK_LIMITS, validatePack, presetFromClip } from "./packs.js";
import { cssColor } from "./color.js";
import { clipMask, ease } from "./motion.js";
import { fontSpec } from "./fonts.js";
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kinds = { transition: "Transitions", look: "Looks", title: "Titles", font: "Fonts", packs: "My packs" };
export function createLibrary({ root, ui, io, fonts, selection, apply, addTitle, stop }) {
  const dialog = document.createElement("dialog");
  dialog.id = "edit-library"; dialog.className = "editor-library"; root.append(dialog);
  const controller = new AbortController();
  const listen = (el, event, fn) => el.addEventListener(event, fn, { signal: controller.signal });
  let category = "transition", query = "", favoritesOnly = false, limit = 60, animation = null,
    frame = 0, generation = 0, disposed = false, operating = false, opener;
  let saved;
  try { saved = ui.readSettings("latitude-editor-library"); } catch {}
  const installed = [];
  for (const item of (Array.isArray(saved?.installed) ? saved.installed : []).slice(0, PACK_LIMITS.installed)) {
    try {
      if (typeof item.id === "string" && /^[\w-]{1,80}$/.test(item.id) && !installed.some(p => p.id === item.id))
        installed.push({ id: item.id, pack: validatePack(item.pack) });
    } catch {} // A corrupt local pack must never prevent editing or loading projects.
  }
  const favorites = new Set((Array.isArray(saved?.favorites) ? saved.favorites : []).filter(v => typeof v === "string").slice(0, 256));
  const persist = () => ui.writeSettings("latitude-editor-library", { installed, favorites: [...favorites].slice(0, 256) });
  const allPacks = () => [...BUILTIN_PACKS.map((pack, i) => ({ pack, id: `builtin-${i}`, included: true })), ...installed];
  const allPresets = () => allPacks().flatMap(pack => pack.pack.presets.map((preset, i) => ({ ...pack, preset, key: `${pack.id}:${i}` })));
  const $ = s => dialog.querySelector(s);
  const status = (message, error = false) => {
    if (disposed) return;
    $("#library-status").textContent = message;
    $("#library-status").classList.toggle("error", error);
  };
  const run = fn => async () => {
    if (operating || disposed) return;
    operating = true; dialog.setAttribute("aria-busy", "true");
    try { await fn(); } catch (e) { status(e.message, true); }
    finally { operating = false; dialog.setAttribute("aria-busy", "false"); }
  };
  function stopAnimation() { cancelAnimationFrame(frame); frame = 0; animation = null; }
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
    ctx.setTransform(2, 0, 0, 2, 0, 0);
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
  function renderCards() {
    stopAnimation(); const token = ++generation;
    const collection = $("#library-collection").value;
    const matches = allPresets().filter(item => item.preset.kind === category
      && (!collection || item.id === collection) && (!favoritesOnly || favorites.has(item.key))
      && `${item.preset.name} ${item.preset.description} ${item.pack.name}`.toLowerCase().includes(query.toLowerCase()));
    const items = matches.slice(0, limit);
    $("#library-count").textContent = `${matches.length} ${matches.length === 1 ? "preset" : "presets"}`;
    $("#library-grid").innerHTML = items.length ? items.map(item => {
      const c = selection(), compatible = c && !c.locked && c.kind !== "audio" && (item.preset.kind !== "font" && item.preset.kind !== "title" || c.kind === "title");
      return `<article class="library-card" data-preset="${escape(item.key)}"><canvas width="480" height="270" aria-label="${escape(item.preset.name)} sample"></canvas><div class="library-card-body"><div class="library-card-heading"><h3>${escape(item.preset.name)}</h3><button class="text-button library-star" data-favorite="${escape(item.key)}" aria-pressed="${favorites.has(item.key)}" aria-label="Favorite ${escape(item.preset.name)}">${favorites.has(item.key) ? "★" : "☆"}</button></div><p>${escape(item.preset.description)}</p><small>${escape(item.pack.name)} · ${item.included ? "Included" : "Local"}</small><div class="library-card-actions"><button class="button small" data-apply="${escape(item.key)}" ${compatible ? "" : "disabled"}>Apply</button>${["title", "font"].includes(category) ? `<button class="button small" data-add="${escape(item.key)}">Add title</button>` : ""}</div></div></article>`;
    }).join("") : '<div class="library-empty"><h3>No matching presets</h3><p>Try another search, collection, or turn off Favorites.</p></div>';
    $("#library-more").hidden = matches.length <= limit;
    for (const item of items) {
      const card = [...$("#library-grid").children].find(el => el.dataset.preset === item.key), canvas = card.querySelector("canvas");
      draw(canvas, item.preset);
      if (item.preset.settings.font)
        fonts.ensure(item.preset.settings.font).then(() => { if (token === generation) draw(canvas, item.preset); }).catch(() => {});
    }
  }
  function renderPacks() {
    stopAnimation(); generation++;
    $("#library-grid").innerHTML = allPacks().map(item => `<article class="library-pack"><div><span class="library-badge">${item.included ? "Included by Latitude" : "Local · not reviewed"}</span><h3>${escape(item.pack.name)}</h3><p>${escape(item.pack.description)}</p><small>${item.pack.presets.length} presets · ${escape(item.pack.author)}</small></div><div class="library-card-actions"><button class="button small" data-browse="${escape(item.id)}">Browse</button><button class="button small" data-export="${escape(item.id)}">Export pack</button>${item.included ? "" : `<button class="text-button" data-remove="${escape(item.id)}">Remove</button>`}</div></article>`).join("");
    $("#library-count").textContent = `${allPacks().length} collections`;
    $("#library-more").hidden = true;
  }
  function render() {
    for (const button of dialog.querySelectorAll("[data-category]")) button.setAttribute("aria-pressed", String(category === button.dataset.category));
    $("#library-filters").hidden = category === "packs";
    $("#library-save").hidden = category !== "packs";
    const clip = selection();
    $("#library-selection").textContent = !clip ? "Select a clip to apply a style, or add a new title."
      : clip.locked ? `Locked layer: ${clip.name}. Unlock it to apply a style.`
      : clip.kind === "audio" ? "Choose a picture for looks and motion, or add a title. Audio is unchanged."
      : ["title", "font"].includes(category) && clip.kind !== "title" ? "Select an existing title to style it, or choose Add title."
      : `Selected: ${clip.name}`;
    category === "packs" ? renderPacks() : renderCards();
  }
  function collections() {
    const current = $("#library-collection").value;
    $("#library-collection").innerHTML = '<option value="">All collections</option>' + allPacks().map(p => `<option value="${escape(p.id)}">${escape(p.pack.name)}</option>`).join("");
    $("#library-collection").value = allPacks().some(p => p.id === current) ? current : "";
  }
  function install(pack) {
    if (installed.length >= PACK_LIMITS.installed) throw Error("Remove a local pack before adding another (20-pack limit).");
    const canonical = validatePack(pack);
    if (allPacks().some(item => JSON.stringify(item.pack) === JSON.stringify(canonical))) throw Error("This exact pack is already in your library.");
    installed.push({ id: crypto.randomUUID(), pack: canonical });
    try { persist(); } catch (e) { installed.pop(); throw e; }
    collections(); category = "packs"; render(); status(`Added ${canonical.name}. Settings stay editable and work offline.`);
  }
  dialog.innerHTML = `<header class="library-header"><div><span class="eyebrow">MAKE IT YOURS</span><h2>Creative library</h2><p id="library-selection"></p></div><button class="button small" id="library-close" aria-label="Close creative library">Done</button></header>
    <nav class="library-tabs" aria-label="Creative categories">${Object.entries(kinds).map(([id, name]) => `<button class="button small" data-category="${id}" aria-pressed="false">${name}</button>`).join("")}</nav>
    <div class="library-filters" id="library-filters"><input id="library-search" type="search" placeholder="Find your next look…" aria-label="Search creative presets" maxlength="120"><select id="library-collection" aria-label="Collection"></select><button class="button small" id="library-favorites" aria-pressed="false">☆ Favorites</button></div>
    <div id="library-save" class="library-save" hidden><div><strong>Build your own collection</strong><p>Save a selected clip's style, or import a data-only preset pack. Removing a pack never changes your edits.</p></div><div class="library-save-controls"><input id="library-pack-name" placeholder="Name your preset…" aria-label="New preset name" maxlength="80"><select id="library-save-kind" aria-label="Save preset type"><option value="look">Color look</option><option value="transition">Transition</option><option value="title">Title style</option></select><button class="button small" id="library-save-clip">Save selected style</button></div></div>
    <div class="library-meta"><span id="library-count"></span><button class="text-button" id="library-import">Import pack…</button></div><div id="library-grid" class="library-grid"></div><button class="button small" id="library-more" hidden>Show more</button>
    <footer class="library-footer"><p id="library-status" role="status">Included collections are free and work offline. All styles can be adjusted in the Inspector.</p><small>Pack imports contain settings only. Local packs have not been reviewed by Latitude.</small></footer>`;
  collections();
  listen($("#library-close"), "click", () => dialog.close());
  listen(dialog, "close", () => { stopAnimation(); generation++; $("#library-grid").replaceChildren(); opener?.focus({ preventScroll: true }); });
  listen(dialog, "cancel", e => { if (operating) e.preventDefault(); });
  listen(dialog, "click", e => {
    const b = e.target.closest("button"); if (!b || operating) return;
    if (b.dataset.category) { category = b.dataset.category; limit = 60; render(); }
    if (b.dataset.favorite) {
      favorites.has(b.dataset.favorite) ? favorites.delete(b.dataset.favorite) : favorites.add(b.dataset.favorite);
      try { persist(); } catch (e) { status(e.message, true); } renderCards();
    }
    const item = allPresets().find(p => p.key === (b.dataset.apply || b.dataset.add));
    if (item) run(async () => {
      if (item.preset.settings.font) await fonts.ensure(item.preset.settings.font);
      if (disposed) return;
      if (b.dataset.add) addTitle(item.preset); else apply(item.preset);
      render(); status(`${item.preset.name} applied. Undo is available after closing the library.`);
    })();
    if (b.dataset.browse) {
      const item = allPacks().find(p => p.id === b.dataset.browse);
      category = item.pack.presets[0].kind; $("#library-collection").value = item.id; query = ""; $("#library-search").value = ""; favoritesOnly = false; $("#library-favorites").setAttribute("aria-pressed", "false"); render();
    }
    if (b.dataset.export) run(async () => {
      const item = allPacks().find(p => p.id === b.dataset.export);
      if (await io.call("export-pack", item.pack)) status("Pack exported. It contains presets, not your footage or title text.");
    })();
    if (b.dataset.remove) run(() => {
      const index = installed.findIndex(p => p.id === b.dataset.remove), old = installed.splice(index, 1)[0];
      try { persist(); } catch (e) { installed.splice(index, 0, old); throw e; }
      collections(); render(); status("Local pack removed. Applied styles and project files are unchanged.");
    })();
  });
  listen($("#library-search"), "input", e => { query = e.target.value; limit = 60; renderCards(); });
  listen($("#library-collection"), "change", () => { limit = 60; renderCards(); });
  listen($("#library-favorites"), "click", e => { favoritesOnly = !favoritesOnly; e.currentTarget.setAttribute("aria-pressed", String(favoritesOnly)); renderCards(); });
  listen($("#library-more"), "click", () => { limit += 60; renderCards(); });
  listen($("#library-import"), "click", run(async () => { const pack = await io.call("import-pack"); if (pack && !disposed) install(pack); }));
  listen($("#library-save-clip"), "click", run(() => {
    const c = selection(), kind = $("#library-save-kind").value;
    if (!c || c.kind === "audio") throw Error("Select a picture or title before saving its style.");
    if (kind === "title" && c.kind !== "title") throw Error("Select a title to save its typography and layout.");
    install(presetFromClip(c, kind, $("#library-pack-name").value)); $("#library-pack-name").value = "";
  }));
  listen($("#library-grid"), "pointerover", e => {
    const card = e.target.closest("[data-preset]");
    if (!card || card.contains(e.relatedTarget) || category !== "transition" || animation?.card === card || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    stopAnimation(); const item = allPresets().find(i => i.key === card.dataset.preset);
    animation = { card, start: performance.now(), last: 0 };
    const tick = now => {
      if (!animation || !dialog.open || document.hidden) { stopAnimation(); return; }
      const t = (now - animation.start) / 1000;
      if (now - animation.last >= 1000 / 30) { draw(card.querySelector("canvas"), item.preset, Math.min(1, t / .85)); animation.last = now; }
      if (t < 1.1) frame = requestAnimationFrame(tick); else stopAnimation();
    };
    frame = requestAnimationFrame(tick);
  });
  listen($("#library-grid"), "pointerout", e => {
    const card = e.target.closest("[data-preset]"); if (!card || card.contains(e.relatedTarget)) return;
    stopAnimation();
  });
  listen(document, "visibilitychange", () => { if (document.hidden) stopAnimation(); });
  return {
    open(kind = "transition") {
      if (disposed) return; stop(); opener = document.activeElement;
      category = Object.hasOwn(kinds, kind) ? kind : "transition"; render(); dialog.showModal();
      $(category === "packs" ? "#library-pack-name" : "#library-search").focus();
    },
    destroy() { disposed = true; stopAnimation(); controller.abort(); if (dialog.open) dialog.close(); dialog.remove(); sample.width = sample.height = 1; },
  };
}
