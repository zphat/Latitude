import {
  newProject,
  newTrack,
  addClip,
  duration,
  sanitize,
  History,
  uid,
  frame,
  clamp,
  selectedGroup,
  split,
  ripple,
  insertSpace,
  detachAudio,
  pasteClips,
  snap,
  FORMATS,
} from "./model.js";
import { Preview, titleCanvas } from "./preview.js";
let teardown;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const time = (t) => {
  t = Math.max(0, t || 0);
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = (t % 60).toFixed(2).padStart(5, "0");
  return `${h ? h + ":" : ""}${String(m).padStart(2, "0")}:${s}`;
};
const number = (id, label, value, min, max, step = 0.1) =>
  `<label>${label}<input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${Number(value.toFixed(3))}"></label>`;
export async function activate({ services }) {
  const ui = services["workspace-panel"],
    io = services["editor-project"];
  let p = newProject(),
    history = new History(p),
    selected = null,
    inspectorTrack = null,
    clipboard = [],
    librarySelected = null,
    media = new Map(),
    busy = false,
    disposed = false,
    zoom = 45,
    linked = true,
    drag = null,
    rangeIn = null,
    saveError = "",
    shownError = "";
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = new URL("./style.css", import.meta.url).href;
  document.head.append(style);
  const panel = ui.mount({
    id: "editor",
    title: "Edit",
    icon: "scissors",
    html: `
    <div class="page-heading editor-heading"><div><div class="eyebrow">LATITUDE EDITOR · OPTIONAL MOD</div><h1>A good take. A finished story.</h1></div><div class="editor-file-actions"><button class="button small" id="edit-new">New</button><button class="button small" id="edit-open">Open project</button><button class="button small" id="edit-save">Save project</button><button class="button primary" id="edit-export">Export edit</button></div></div>
    <div class="editor-project-line"><input id="edit-name" aria-label="Edit name" maxlength="100" value="Untitled edit"><select id="edit-format" aria-label="Picture shape"><option value="landscape">16:9 · 1080p episode</option><option value="portrait">9:16 · vertical clip</option><option value="square">1:1 · square</option><option value="compact">16:9 · 720p lightweight</option><option value="uhd">16:9 · 4K</option></select><select id="edit-fps" aria-label="Frame rate"><option>24</option><option selected>30</option><option>60</option></select><span class="fine-print" id="edit-save-state" role="status">Sources stay untouched</span></div>
    <div class="editor-operation" id="edit-operation" hidden><div><b id="edit-progress-label">Working…</b><progress id="edit-progress" max="100"></progress></div><button class="button small" id="edit-cancel">Cancel</button></div>
    <div id="edit-recovery" class="notice" hidden><span id="edit-recovery-name"></span> <button class="text-button" id="edit-restore">Restore draft</button></div>
    <div class="editor-top">
      <section class="panel editor-media"><div class="editor-section-title"><h2>Media</h2><button class="button small" id="edit-import">+ Import</button></div><button class="button small" id="edit-takes">Use a Latitude take</button><p class="fine-print">Video, audio, intros, ads and images. Add a source to the timeline to use it.</p><div id="edit-media-list"></div><div id="edit-media-tools" hidden><button class="button small" id="edit-add-media" title="Place media over the current timeline">Add at playhead</button><div class="editor-pair"><button class="button small" id="edit-insert-media" title="Insert here and move all later clips together">Insert</button><button class="button small" id="edit-append-media" title="Place at the end of the timeline">Append</button></div><button class="text-button" id="edit-proxy">Make lighter / compatible preview</button><button class="text-button" id="edit-waveform">Build audio waveform</button><button class="text-button" id="edit-relink">Relink source</button></div></section>
      <section class="panel editor-viewer"><div class="editor-stage" id="edit-stage"><canvas id="edit-canvas" aria-label="Edit preview; drag a selected picture or title to reposition it"></canvas><div id="edit-empty"><b>Your edit starts here.</b><span>Import media or choose a Latitude take.<br>Then split, arrange, and make it yours.</span></div></div><div class="editor-transport"><button class="button small" id="edit-back" title="Previous frame">‹</button><button class="button primary" id="edit-play">Play</button><button class="button small" id="edit-forward" title="Next frame">›</button><output id="edit-time">00:00.00</output><span id="edit-length" class="fine-print">/ 00:00.00</span><label class="editor-meter" title="Protected preview mix; final loudness is set at export"><meter id="edit-meter" min="0" max="1" low=".25" high=".71" optimum=".1" value="0"></meter><small id="edit-meter-db">Mix · silent</small></label></div><input id="edit-scrub" type="range" min="0" max="1" step=".033333" value="0" aria-label="Preview playhead"><p class="editor-preview-note fine-print">Lightweight preview · originals used for export · drag to position, corners to resize</p></section>
      <section class="panel editor-inspector" id="edit-inspector"></section>
    </div>
    <section class="panel editor-timeline-panel"><div class="editor-tools"><button class="button small" id="edit-undo" title="Undo · Ctrl Z">Undo</button><button class="button small" id="edit-redo" title="Redo · Ctrl Shift Z">Redo</button><button class="button small" id="edit-split">Split · S</button><button class="button small" id="edit-delete">Delete</button><button class="button small" id="edit-duplicate">Duplicate</button><button class="button small" id="edit-copy" title="Copy linked selection · Ctrl C">Copy</button><button class="button small" id="edit-cut" title="Cut linked selection · Ctrl X">Cut</button><button class="button small" id="edit-paste" title="Paste at playhead · Ctrl V">Paste</button><button class="button small" id="edit-title">+ Title</button><button class="button small" id="edit-video-layer">+ Video layer</button><button class="button small" id="edit-audio-layer">+ Audio layer</button><label class="check-line"><input type="checkbox" id="edit-linked" checked>Linked clips</label></div>
      <div class="editor-range-tools"><button class="text-button" id="edit-in">Mark in · I</button><button class="text-button" id="edit-out">Mark out · O</button><span id="edit-range-label" class="fine-print">Select a range to make a clip or remove a section</span><button class="button small" id="edit-ripple">Remove range & close gap</button><button class="text-button" id="edit-clear-range">Clear</button><label class="editor-zoom">Zoom <input id="edit-zoom" type="range" min="5" max="160" value="45" aria-label="Timeline zoom"></label></div>
      <div class="editor-timeline" id="edit-timeline"><div id="edit-timeline-content"><div class="editor-ruler" id="edit-ruler"></div><div id="edit-track-rows"></div><div class="editor-playhead" id="edit-playhead"></div><div id="edit-range-shade"></div></div></div>
      <div class="editor-timeline-footer"><span>Drag clips across time or layers · drag their edges to trim · higher video layers cover lower ones</span><details><summary>Shortcuts & tips</summary><p>Space play/pause · S split linked selection · Delete remove selection · Ctrl C/X/V copy/cut/paste · Ctrl D duplicate · Ctrl Z undo · Ctrl Shift Z redo · I/O range · ←/→ one frame · M marker. Shift-click Split cuts every unlocked layer at the playhead. Overlap picture clips and fade the incoming clip for a dissolve. Use Remove range to cut all layers together without losing sync. Save a project before starting a different edit; the local recovery draft holds the latest edit only.</p></details></div>
    </section>
    <dialog id="edit-dialog" class="editor-dialog"></dialog>
  `,
  });
  const $ = (s) => panel.element.querySelector(s),
    canvas = $("#edit-canvas"),
    timeline = $("#edit-timeline");
  const report = (message) => {
    if (message !== shownError) {
      shownError = message;
      ui.toast(message, true);
    }
  };
  const preview = new Preview({
    canvas,
    project: () => p,
    media: () => media,
    onError: report,
    onMeter: (peak) => {
      $("#edit-meter").value = peak;
      $("#edit-meter-db").textContent =
        peak > 1e-5
          ? `Mix · ${(20 * Math.log10(peak)).toFixed(1)} dBFS`
          : "Mix · silent";
    },
    onTime: (t, playing) => {
      $("#edit-time").textContent = time(t);
      $("#edit-play").textContent = playing ? "Pause" : "Play";
      $("#edit-scrub").value = t;
      $("#edit-playhead").style.left = `${150 + t * zoom}px`;
      if (
        playing &&
        150 + t * zoom > timeline.scrollLeft + timeline.clientWidth - 40
      )
        timeline.scrollLeft = 150 + t * zoom - timeline.clientWidth * 0.65;
    },
  });
  const active = () => panel.element.classList.contains("active");
  const stop = () => preview.pause();
  function autosave() {
    if (!io.available) return;
    $("#edit-save-state").textContent = "Saving draft…";
    io.call("draft", p)
      .then(() => {
        if (!disposed) {
          $("#edit-save-state").textContent = "Draft saved locally";
          saveError = "";
        }
      })
      .catch((e) => {
        if (!disposed) {
          $("#edit-save-state").textContent =
            "Draft not saved — save a project";
          if (saveError !== e.message) {
            saveError = e.message;
            report(e.message);
          }
        }
      });
  }
  function commit(next) {
    stop();
    history.commit(next);
    p = history.current;
    inspectorTrack = p.tracks.some((t) => t.id === inspectorTrack)
      ? inspectorTrack
      : null;
    selected = p.clips.some((c) => c.id === selected) ? selected : null;
    autosave();
    render();
  }
  function change(fn) {
    if (busy) return;
    const next = structuredClone(p);
    fn(next);
    commit(next);
  }
  async function work(fn) {
    if (busy) return;
    if (io.isBusy())
      throw Error("Finish recording or streaming before editing media.");
    busy = true;
    stop();
    io.activity(true);
    $("#edit-operation").hidden = false;
    $("#edit-progress").removeAttribute("value");
    $("#edit-progress-label").textContent = "Working…";
    panel.element.classList.add("editor-working");
    try {
      return await fn();
    } finally {
      busy = false;
      io.activity(false);
      if (!disposed) {
        $("#edit-operation").hidden = true;
        panel.element.classList.remove("editor-working");
        render();
      }
    }
  }
  const run = (fn) => async (e) => {
    try {
      if (!io.available)
        throw Error("File editing is available in the Latitude desktop app.");
      await fn(e);
    } catch (error) {
      if (!disposed) ui.toast(error.message, true);
    }
  };
  const addItems = (items) => {
    for (const a of items) media.set(a.id, a);
  };
  const syncAssets = (next) => {
    next.assets = [...media.values()].map((a) => ({ ...a }));
  };
  function editSelection(fn) {
    const selectedClips = selectedGroup(p, selected, linked);
    if (!selectedClips.length) return;
    const ids = selectedClips.map((c) => c.id);
    if (
      p.tracks.some(
        (t) => t.locked && selectedClips.some((c) => c.track === t.id),
      )
    )
      throw Error("Unlock the selected layer before editing.");
    change((next) => next.clips.filter((c) => ids.includes(c.id)).forEach(fn));
  }
  function reset(next, items) {
    stop();
    preview.clear();
    if (items) media = new Map(items.map((a) => [a.id, a]));
    p = sanitize(next);
    history = new History(p);
    selected = null;
    inspectorTrack = null;
    clipboard = [];
    librarySelected = p.assets[0]?.id || null;
    preview.time = 0;
    rangeIn = null;
    render();
    autosave();
    $("#edit-recovery").hidden = true;
  }
  function render() {
    if (disposed) return;
    $("#edit-name").value = p.name;
    $("#edit-format").value = p.format;
    $("#edit-fps").value = p.fps;
    $("#edit-length").textContent = `/ ${time(duration(p))}`;
    $("#edit-scrub").max = duration(p) || 1;
    $("#edit-scrub").step = 1 / p.fps;
    $("#edit-empty").hidden = !!p.clips.length;
    $("#edit-undo").disabled = !history.undoStack.length;
    $("#edit-redo").disabled = !history.redoStack.length;
    for (const id of ["split", "delete", "duplicate", "copy", "cut"])
      $(`#edit-${id}`).disabled = !selected;
    $("#edit-range-label").textContent = p.range
      ? `${time(p.range.in)} → ${time(p.range.out)} · ${(p.range.out - p.range.in).toFixed(2)}s`
      : rangeIn !== null
        ? `In ${time(rangeIn)} · move the playhead and mark out`
        : "Select a range to make a clip or remove a section";
    $("#edit-ripple").disabled = !p.range;
    $("#edit-paste").disabled = !clipboard.length;
    renderMedia();
    renderInspector(inspectorTrack);
    renderTimeline();
    preview.time = Math.min(preview.time, duration(p));
    preview.draw(true);
    $("#edit-playhead").style.left = `${150 + preview.time * zoom}px`;
  }
  function renderMedia() {
    $("#edit-media-list").innerHTML = p.assets.length
      ? p.assets
          .map(
            (a) =>
              `<button class="editor-media-item ${librarySelected === a.id ? "selected" : ""}" data-media="${a.id}"><span class="editor-media-type">${a.kind === "video" ? "VID" : a.kind === "audio" ? "AUD" : "IMG"}</span><span><b>${esc(a.name)}</b><small>${a.missing ? "Missing · relink" : a.kind === "image" ? `${a.width} × ${a.height}` : `${time(a.duration)}${a.audio > 1 ? ` · ${a.audio} audio tracks` : ""}`}</small></span></button>`,
          )
          .join("")
      : '<p class="editor-media-empty">Your media stays on your computer. Nothing is uploaded.</p>';
    $("#edit-media-tools").hidden = !librarySelected;
    $("#edit-add-media").disabled = !!p.assets.find(
      (a) => a.id === librarySelected,
    )?.missing;
  }
  const groupIds = () => selectedGroup(p, selected, linked).map((c) => c.id);
  const rowTracks = () =>
    [...p.tracks.filter((t) => t.kind === "video")]
      .reverse()
      .concat(p.tracks.filter((t) => t.kind === "audio"));
  function waveform(c) {
    const a = media.get(c.asset);
    const peaks = a?.waveforms?.[c.audio];
    if (!peaks) return "";
    const width = Math.max(1, c.duration * zoom),
      points = Math.min(160, Math.ceil(width / 3)),
      vals = [];
    for (let i = 0; i < points; i++) {
      const at = (c.in + (c.duration * i) / points) / a.duration;
      vals.push(
        peaks[Math.min(peaks.length - 1, Math.floor(at * peaks.length))] || 0,
      );
    }
    return `<svg class="editor-wave" viewBox="0 0 ${points} 30" preserveAspectRatio="none" aria-hidden="true"><path d="${vals.map((v, i) => `M${i},${15 - v * 14}V${15 + v * 14}`).join("")}"/></svg>`;
  }
  function renderTimeline() {
    const length = Math.max(30, duration(p) + 5),
      width = 150 + length * zoom;
    $("#edit-timeline-content").style.width = `${width}px`;
    const visibleStart = Math.max(0, (timeline.scrollLeft - 150) / zoom - 3),
      visibleEnd =
        visibleStart + Math.max(1000, timeline.clientWidth) / zoom + 6;
    const interval = zoom < 10 ? 30 : zoom < 30 ? 10 : zoom < 80 ? 5 : 1;
    let ruler = "";
    for (
      let t = Math.floor(visibleStart / interval) * interval;
      t <= visibleEnd;
      t += interval
    )
      ruler += `<span style="left:${150 + t * zoom}px">${time(t).replace(".00", "")}</span>`;
    for (const m of p.markers)
      if (m.time >= visibleStart && m.time <= visibleEnd)
        ruler += `<button class="editor-marker" data-marker="${m.time}" style="left:${150 + m.time * zoom}px" title="${esc(m.name)}">◆</button>`;
    $("#edit-ruler").innerHTML = ruler;
    const ids = groupIds();
    $("#edit-track-rows").innerHTML = rowTracks()
      .map(
        (t) =>
          `<div class="editor-track-row ${t.locked ? "locked" : ""}" data-row="${t.id}" style="--grid:${interval * zoom}px"><div class="editor-track-label"><button class="editor-track-name" data-track-select="${t.id}" title="Layer controls">${esc(t.name)}</button><div><button data-track-action="mute" data-track="${t.id}" class="${t.mute ? "on" : ""}" title="Mute this layer’s audio" aria-label="Mute ${esc(t.name)}">M</button><button data-track-action="solo" data-track="${t.id}" class="${t.solo ? "on" : ""}" title="Solo audio" aria-label="Solo ${esc(t.name)}">S</button>${t.kind === "video" ? `<button data-track-action="hidden" data-track="${t.id}" class="${t.hidden ? "on" : ""}" title="Hide picture" aria-label="Hide ${esc(t.name)}">◉</button>` : ""}<button data-track-action="locked" data-track="${t.id}" class="${t.locked ? "on" : ""}" title="Lock edits" aria-label="Lock ${esc(t.name)}">${t.locked ? "▣" : "□"}</button></div></div>${p.clips
            .filter(
              (c) =>
                c.track === t.id &&
                c.start + c.duration >= visibleStart &&
                c.start <= visibleEnd,
            )
            .map(
              (c) =>
                `<button class="editor-clip ${c.kind} ${ids.includes(c.id) ? "selected" : ""}" data-clip="${c.id}" style="left:${150 + c.start * zoom}px;width:${Math.max(5, c.duration * zoom)}px" title="${esc(c.name)} · ${time(c.start)} · ${c.duration.toFixed(2)}s"><span class="editor-trim left" data-trim="left"></span>${waveform(c)}<span class="editor-clip-label">${esc(c.name)}${c.group ? " ↔" : ""}</span>${c.fadeIn || c.audioIn ? '<span class="editor-fade-mark">◢</span>' : ""}<span class="editor-trim right" data-trim="right"></span></button>`,
            )
            .join("")}</div>`,
      )
      .join("");
    $("#edit-range-shade").hidden = !p.range;
    if (p.range) {
      $("#edit-range-shade").style.left = `${150 + p.range.in * zoom}px`;
      $("#edit-range-shade").style.width =
        `${(p.range.out - p.range.in) * zoom}px`;
    }
  }
  function renderInspector(trackId) {
    inspectorTrack = trackId || null;
    const c = p.clips.find((c) => c.id === selected),
      t = p.tracks.find((t) => t.id === (trackId || c?.track));
    if (trackId) {
      $("#edit-inspector").innerHTML =
        `<span class="eyebrow">LAYER MIXER</span><h2>${esc(t.name)}</h2><label>Name<input id="edit-track-name" value="${esc(t.name)}" maxlength="100"></label>${number("edit-track-gain", "Layer gain · dB", t.gain, -60, 18, 0.5)}${number("edit-track-pan", "Balance · left −1 / right +1", t.pan, -1, 1, 0.05)}<label class="check-line"><input id="edit-track-voice" type="checkbox" ${t.voice ? "checked" : ""}>Dialogue cleanup</label><p class="fine-print">Rumble filter, gentle EQ and compression. Leave off for already-processed Latitude voice tracks.</p><div class="editor-pair"><button id="edit-track-up" class="button small">Move up</button><button id="edit-track-down" class="button small">Move down</button></div><button id="edit-track-remove" class="text-button">Remove empty layer</button>`;
      for (const [id, key] of [
        ["name", "name"],
        ["gain", "gain"],
        ["pan", "pan"],
        ["voice", "voice"],
      ])
        $(`#edit-track-${id}`).onchange = run((e) =>
          change((next) => {
            next.tracks.find((x) => x.id === t.id)[key] =
              key === "name"
                ? e.target.value
                : key === "voice"
                  ? e.target.checked
                  : Number(e.target.value);
          }),
        );
      for (const [id, delta] of [
        ["up", 1],
        ["down", -1],
      ])
        $(`#edit-track-${id}`).onclick = run(() => {
          change((next) => {
            const peers = next.tracks.filter((x) => x.kind === t.kind),
              k = peers.findIndex((x) => x.id === t.id);
            const other = peers[k + (t.kind === "video" ? delta : -delta)];
            const i = next.tracks.findIndex((x) => x.id === t.id),
              j = other ? next.tracks.findIndex((x) => x.id === other.id) : -1;
            if (j >= 0 && j < next.tracks.length)
              [next.tracks[i], next.tracks[j]] = [
                next.tracks[j],
                next.tracks[i],
              ];
          });
          renderInspector(t.id);
        });
      $("#edit-track-remove").onclick = run(() => {
        if (p.clips.some((c) => c.track === t.id))
          throw Error("Move or delete this layer’s clips first.");
        change(
          (next) => (next.tracks = next.tracks.filter((x) => x.id !== t.id)),
        );
      });
      return;
    }
    if (!c) {
      $("#edit-inspector").innerHTML =
        '<span class="eyebrow">MAKE IT YOURS</span><h2>Choose a clip</h2><p>Click a timeline clip for trim, sound, framing and fade controls. Click a layer name for its mixer.</p><div class="notice">Cut a selected range across every layer to keep your microphones and picture in sync.</div><p class="fine-print">Save project creates a small, non-destructive edit file referencing your sources. Keep the source files with it; Relink reconnects moved media.</p>';
      return;
    }
    const a = p.assets.find((a) => a.id === c.asset),
      visual = c.kind !== "audio",
      sound = !!a?.audio;
    $("#edit-inspector").innerHTML =
      `<span class="eyebrow">${esc(c.kind.toUpperCase())} CLIP</span><h2>${esc(c.name)}</h2><label>Layer<select id="clip-track">${p.tracks
        .filter((x) => x.kind === t.kind)
        .map(
          (x) =>
            `<option value="${x.id}" ${x.id === c.track ? "selected" : ""} ${x.locked ? "disabled" : ""}>${esc(x.name)}${x.locked ? " · locked" : ""}</option>`,
        )
        .join(
          "",
        )}</select></label><div class="editor-pair">${number("clip-start", "Timeline start · s", c.start, 0, 43200)}${number("clip-duration", "Length · s", c.duration, 1 / p.fps, 43200)}</div>${c.kind === "video" || c.kind === "audio" ? number("clip-in", "Source in · s", c.in, 0, a?.duration || 43200) : ""}
      ${sound ? `<details open><summary>Audio</summary>${number("clip-gain", "Clip gain · dB", c.gain, -60, 18, 0.5)}<label class="check-line"><input id="clip-mute" type="checkbox" ${c.mute ? "checked" : ""}>Mute this clip</label>${a.audio > 1 ? `<label>Source audio track<select id="clip-audio">${Array.from({ length: a.audio }, (_, i) => `<option value="${i}" ${c.audio === i ? "selected" : ""}>Track ${i + 1}</option>`).join("")}</select></label>` : ""}<div class="editor-pair">${number("clip-audioIn", "Fade in · s", c.audioIn, 0, c.duration / 2)}${number("clip-audioOut", "Fade out · s", c.audioOut, 0, c.duration / 2)}</div><button class="text-button" id="clip-mixer">Open layer mixer</button>${c.kind === "video" ? '<button class="text-button" id="clip-detach">Separate audio into a linked layer</button>' : ""}</details>` : ""}
      ${
        visual
          ? `<details open><summary>Picture & fades</summary><div class="editor-pair">${number("clip-fadeIn", "Fade / enter · s", c.fadeIn, 0, c.duration / 2)}${number("clip-fadeOut", "Fade out · s", c.fadeOut, 0, c.duration / 2)}</div><label>Enter transition<select id="clip-transition">${[
              ["fade", "Fade / dissolve"],
              ["slide-left", "Slide from left"],
              ["slide-right", "Slide from right"],
              ["wipe", "Wipe reveal"],
            ]
              .map(
                ([id, name]) =>
                  `<option value="${id}" ${c.transition === id ? "selected" : ""}>${name}</option>`,
              )
              .join(
                "",
              )}</select></label><button class="text-button" id="clip-crossfade">Dissolve from previous · 0.5s</button></details>
      <details><summary>Position, size & crop</summary><div class="editor-pair">${number("clip-x", "X · %", c.x * 100, -100, 100, 1)}${number("clip-y", "Y · %", c.y * 100, -100, 100, 1)}${number("clip-w", "Width · %", c.w * 100, 2, 200, 1)}${number("clip-h", "Height · %", c.h * 100, 2, 200, 1)}</div><label>Fit<select id="clip-fit"><option value="contain" ${c.fit === "contain" ? "selected" : ""}>Fit inside</option><option value="cover" ${c.fit === "cover" ? "selected" : ""}>Fill & crop</option></select></label>${number("clip-opacity", "Opacity · %", c.opacity * 100, 0, 100, 1)}<label class="check-line"><input id="clip-flip" type="checkbox" ${c.flip ? "checked" : ""}>Flip horizontally</label>${c.kind !== "title" ? `<div class="editor-pair">${["x", "y", "w", "h"].map((k, i) => number(`crop-${k}`, ["Crop left %", "Crop top %", "Source width %", "Source height %"][i], (c.crop?.[k] ?? (i > 1 ? 1 : 0)) * 100, i > 1 ? 2 : 0, 100, 1)).join("")}</div>` : ""}<button class="text-button" id="clip-reset-frame">Reset framing</button></details>
      <details><summary>Simple color effects</summary><label>Look<select id="clip-look"><option value="custom">Adjust / current</option><option value="clean">Original</option><option value="mono">Black & white</option><option value="rich">Rich color</option><option value="soft">Soft contrast</option></select></label>${number("clip-brightness", "Brightness", c.brightness, 0.2, 2, 0.05)}${number("clip-contrast", "Contrast", c.contrast, 0.2, 2, 0.05)}${number("clip-saturation", "Color", c.saturation, 0, 2, 0.05)}</details>`
          : ""
      }
      ${c.kind === "title" ? `<details open><summary>Title</summary><label>Text<textarea id="clip-text" rows="3" maxlength="500">${esc(c.text)}</textarea></label><label>Font<select id="clip-font">${["Manrope", "DM Serif Display", "monospace"].map((f) => `<option ${c.font === f ? "selected" : ""}>${f}</option>`).join("")}</select></label>${number("clip-fontSize", "Size", c.fontSize, 16, 240, 1)}<label>Align<select id="clip-align">${["left", "center", "right"].map((f) => `<option ${c.align === f ? "selected" : ""}>${f}</option>`).join("")}</select></label><div class="editor-pair"><label>Text color<input id="clip-color" type="color" value="${c.color}"></label><label>Gradient end<input id="clip-color2" type="color" value="${c.color2}"></label></div><label class="check-line"><input id="clip-gradient" type="checkbox" ${c.gradient ? "checked" : ""}>Gradient text</label><label class="check-line"><input id="clip-box" type="checkbox" ${c.box ? "checked" : ""}>Dark background for readability</label></details>` : ""}
      <p class="fine-print">${c.group && linked ? "Linked edits move, trim and split synchronized clips together." : "Edits are non-destructive."}</p>`;
    for (const input of $("#edit-inspector").querySelectorAll(
      "input,select,textarea",
    )) {
      if (input.id === "clip-look") continue;
      input.onchange = run(async () => {
        let key = input.id.replace("clip-", ""),
          v =
            input.type === "checkbox"
              ? input.checked
              : input.type === "number"
                ? Number(input.value)
                : input.value;
        if (key === "audio") {
          v = Number(v);
          if (v > 0 && !media.get(c.asset)?.audioUrls?.[v])
            await prepareAudio(c.asset, v);
        }
        if (["start", "duration", "in"].includes(key)) {
          const delta = v - c[key];
          editSelection((x) => {
            if (key === "in") {
              x.in += delta;
              x.duration -= delta;
              x.start += delta;
            } else x[key] += delta;
          });
          return;
        }
        if (input.id.startsWith("crop-")) {
          const k = input.id.slice(5);
          change((next) => {
            next.clips.find((x) => x.id === c.id).crop[k] = v / 100;
          });
          return;
        }
        if (["x", "y", "w", "h", "opacity"].includes(key)) v /= 100;
        change((next) => (next.clips.find((x) => x.id === c.id)[key] = v));
      });
    }
    if (sound) $("#clip-mixer").onclick = () => renderInspector(c.track);
    if ($("#clip-detach"))
      $("#clip-detach").onclick = run(() => commit(detachAudio(p, c.id)));
    if (visual) {
      $("#clip-reset-frame").onclick = run(() =>
        change((next) =>
          Object.assign(
            next.clips.find((x) => x.id === c.id),
            {
              x: 0,
              y: 0,
              w: 1,
              h: 1,
              crop: { x: 0, y: 0, w: 1, h: 1 },
              fit: "contain",
              opacity: 1,
              flip: false,
            },
          ),
        ),
      );
      $("#clip-look").onchange = run((e) =>
        change((next) => {
          const v = {
            clean: [1, 1, 1],
            mono: [1, 1, 0],
            rich: [1, 1.08, 1.15],
            soft: [1.04, 0.9, 0.95],
          }[e.target.value];
          if (v)
            Object.assign(
              next.clips.find((x) => x.id === c.id),
              { brightness: v[0], contrast: v[1], saturation: v[2] },
            );
        }),
      );
      $("#clip-crossfade").onclick = run(() => {
        const previous = p.clips
          .filter((x) => x.track === c.track && x.start < c.start)
          .sort((a, b) => b.start - a.start)[0];
        if (!previous)
          throw Error(
            "Place another clip before this one on the same video layer first.",
          );
        const fade = Math.min(0.5, c.duration / 2, previous.duration / 2);
        const incoming = selectedGroup(p, c.id, linked),
          outgoing = selectedGroup(p, previous.id, linked);
        if (
          p.tracks.some(
            (t) =>
              t.locked &&
              [...incoming, ...outgoing].some((x) => x.track === t.id),
          )
        )
          throw Error("Unlock affected layers first.");
        const delta =
          Math.max(0, previous.start + previous.duration - fade) - c.start;
        change((next) => {
          for (const x of next.clips) {
            if (incoming.some((i) => i.id === x.id)) {
              x.start += delta;
              x.fadeIn = x.audioIn = fade;
              x.transition = "fade";
            }
            if (outgoing.some((i) => i.id === x.id)) x.audioOut = fade;
          }
        });
      });
    }
    if (t.locked) {
      const note = document.createElement("p");
      note.className = "notice";
      note.textContent =
        "This layer is locked. Unlock it in the timeline to edit this clip.";
      $("#edit-inspector").prepend(note);
      $("#edit-inspector")
        .querySelectorAll("input,select,textarea,button")
        .forEach((el) => (el.disabled = true));
    }
  }
  async function prepareAudio(id, channel) {
    const result = await work(() =>
      io.call("preview", { id, audio: channel, video: false }),
    );
    if (result) {
      const a = media.get(id);
      a.audioUrls ||= {};
      a.audioUrls[channel] = result.url;
    }
  }
  async function addMedia(mode = "overlay") {
    const a = p.assets.find((a) => a.id === librarySelected);
    if (!a || a.missing) return;
    const kind = a.kind === "audio" ? "audio" : "video";
    let track =
      p.tracks.find(
        (t) =>
          t.id === p.clips.find((c) => c.id === selected)?.track &&
          t.kind === kind &&
          !t.locked,
      ) || p.tracks.find((t) => t.kind === kind && !t.locked);
    const at = mode === "append" ? duration(p) : preview.time;
    const next =
      mode === "insert"
        ? insertSpace(
            p,
            at,
            a.kind === "image" ? 5 : Math.floor(a.duration * p.fps) / p.fps,
          )
        : structuredClone(p);
    if (!track) {
      track = newTrack(kind);
      next.tracks.push(track);
    }
    const added = addClip(next, a, track.id, at);
    selected = added.clips.at(-1).id;
    inspectorTrack = null;
    commit(added);
  }
  function showDialog(html) {
    $("#edit-dialog").innerHTML = html;
    $("#edit-dialog").showModal();
    $("#edit-dialog")
      .querySelector("[data-close]")
      ?.addEventListener("click", () => $("#edit-dialog").close());
  }
  async function openTake(id) {
    if (
      p.clips.length &&
      !confirm(
        "Replace this timeline with the selected take? Save a project first if you want to keep this edit.",
      )
    )
      return;
    await work(async () => {
      const data = await io.call("take", id);
      addItems(data.items);
      const next = newProject();
      next.name = data.name;
      next.assets = data.items;
      next.tracks = [];
      next.clips = [];
      for (const a of data.items) {
        const track = newTrack(a.kind === "audio" ? "audio" : "video", a.name);
        next.tracks.push(track);
        next.clips.push({
          id: uid(),
          track: track.id,
          asset: a.id,
          kind: a.kind,
          name: a.name,
          start: 0,
          in: 0,
          duration: a.duration,
          group: data.group,
          mute:
            a.kind === "video" && data.items.some((x) => x.kind === "audio"),
        });
      }
      next.markers = data.markers.map((m) => ({
        time: m.time ?? m.seconds ?? 0,
        name: m.label || m.name || "Marker",
      }));
      reset(next, data.items);
    });
  }
  $("#edit-import").onclick = run(() =>
    work(async () => {
      const result = await io.call("import");
      if (!result) return;
      addItems(result.items);
      const next = structuredClone(p);
      syncAssets(next);
      if (result.items[0]) librarySelected = result.items[0].id;
      commit(next);
      if (result.errors.length) ui.toast(result.errors.join("\n"), true);
    }),
  );
  $("#edit-takes").onclick = run(async () => {
    const takes = (await io.takes()).filter((t) => t.status !== "recording");
    showDialog(
      `<h2>Edit a Latitude take</h2><p>Picture and processed microphone/desktop tracks arrive aligned and linked. Raw backups stay in your recordings folder.</p><div class="editor-take-picker">${takes.map((t) => `<button class="button" data-take="${esc(t.id)}">${esc(t.name)} · ${time(t.duration)}</button>`).join("") || "<p>No saved takes yet. Record in Studio or import media.</p>"}</div><button class="button" data-close>Cancel</button>`,
    );
    $("#edit-dialog")
      .querySelectorAll("[data-take]")
      .forEach(
        (b) =>
          (b.onclick = run(async () => {
            $("#edit-dialog").close();
            await openTake(b.dataset.take);
          })),
      );
  });
  $("#edit-new").onclick = run(async () => {
    if (
      p.clips.length &&
      !confirm("Start a new edit? Save a project first to keep this timeline.")
    )
      return;
    await io.call("dispose");
    reset(newProject(), []);
  });
  $("#edit-open").onclick = run(async () => {
    if (
      p.clips.length &&
      !confirm(
        "Open another project? Save the current project first if you want to keep it.",
      )
    )
      return;
    await work(async () => {
      const result = await io.call("open");
      if (result) reset(result.project, result.items);
    });
  });
  $("#edit-restore").onclick = run(() =>
    work(async () => {
      const result = await io.call("restore");
      reset(result.project, result.items);
    }),
  );
  $("#edit-save").onclick = run(async () => {
    const result = await io.call("save", p);
    if (result)
      ui.toast(`Saved ${result}. Keep its source media alongside it.`);
  });
  $("#edit-name").onchange = run((e) =>
    change((next) => (next.name = e.target.value)),
  );
  $("#edit-format").onchange = run((e) =>
    change((next) => (next.format = e.target.value)),
  );
  $("#edit-fps").onchange = run((e) =>
    change((next) => (next.fps = Number(e.target.value))),
  );
  $("#edit-media-list").onclick = (e) => {
    const item = e.target.closest("[data-media]");
    if (item) {
      librarySelected = item.dataset.media;
      renderMedia();
    }
  };
  $("#edit-media-list").ondblclick = run(() => addMedia());
  $("#edit-add-media").onclick = run(() => addMedia());
  $("#edit-insert-media").onclick = run(() => addMedia("insert"));
  $("#edit-append-media").onclick = run(() => addMedia("append"));
  $("#edit-proxy").onclick = run(() =>
    work(async () => {
      const a = media.get(librarySelected);
      if (!a || a.kind === "image")
        throw Error("Choose a video or audio file first.");
      const result = await io.call("preview", {
        id: a.id,
        audio: 0,
        video: a.kind === "video",
      });
      if (a.kind === "video") a.videoUrl = result.url;
      else {
        a.audioUrls ||= {};
        a.audioUrls[0] = result.url;
      }
      preview.clear();
      ui.toast(
        "Preview ready. Export will still use the full-quality original.",
      );
    }),
  );
  $("#edit-waveform").onclick = run(() =>
    work(async () => {
      const a = media.get(librarySelected);
      if (!a?.audio) throw Error("Choose media with audio first.");
      const channel =
        p.clips.find((c) => c.id === selected && c.asset === a.id)?.audio || 0;
      a.waveforms ||= {};
      a.waveforms[channel] = await io.call("waveform", {
        id: a.id,
        audio: channel,
      });
      renderTimeline();
    }),
  );
  $("#edit-relink").onclick = run(() =>
    work(async () => {
      const a = await io.call("relink", librarySelected);
      if (a) {
        media.set(a.id, a);
        const next = structuredClone(p);
        next.assets = next.assets.map((x) => (x.id === a.id ? a : x));
        commit(next);
        preview.clear();
      }
    }),
  );
  $("#edit-play").onclick = run(async () => {
    if (busy) return;
    if (preview.playing) {
      stop();
      return;
    }
    if (io.isBusy())
      throw Error(
        "Finish the active recording or stream before playing an edit.",
      );
    for (const c of p.clips)
      if (c.audio > 0 && !media.get(c.asset)?.audioUrls?.[c.audio])
        await prepareAudio(c.asset, c.audio);
    await preview.play();
  });
  $("#edit-back").onclick = () => {
    stop();
    preview.seek(preview.time - 1 / p.fps);
  };
  $("#edit-forward").onclick = () => {
    stop();
    preview.seek(preview.time + 1 / p.fps);
  };
  $("#edit-scrub").oninput = (e) => {
    stop();
    preview.seek(Number(e.target.value));
  };
  $("#edit-undo").onclick = () => {
    if (busy) return;
    stop();
    p = history.undo();
    selected = null;
    autosave();
    render();
  };
  $("#edit-redo").onclick = () => {
    if (busy) return;
    stop();
    p = history.redo();
    selected = null;
    autosave();
    render();
  };
  $("#edit-linked").onchange = (e) => {
    linked = e.target.checked;
    renderTimeline();
  };
  $("#edit-split").onclick = run((e) => {
    const ids = e.shiftKey
      ? p.clips
          .filter((c) => !p.tracks.find((t) => t.id === c.track).locked)
          .map((c) => c.id)
      : groupIds();
    if (
      p.tracks.some(
        (t) =>
          t.locked &&
          p.clips.some((c) => ids.includes(c.id) && c.track === t.id),
      )
    )
      throw Error("Unlock the layer before splitting.");
    commit(split(p, ids, preview.time));
  });
  $("#edit-delete").onclick = run(() => {
    const ids = groupIds();
    if (
      p.tracks.some(
        (t) =>
          t.locked &&
          p.clips.some((c) => ids.includes(c.id) && c.track === t.id),
      )
    )
      throw Error("Unlock this layer first.");
    change(
      (next) => (next.clips = next.clips.filter((c) => !ids.includes(c.id))),
    );
  });
  $("#edit-copy").onclick = () => {
    clipboard = structuredClone(selectedGroup(p, selected, linked));
    render();
  };
  $("#edit-cut").onclick = run(() => {
    const clips = selectedGroup(p, selected, linked);
    if (p.tracks.some((t) => t.locked && clips.some((c) => c.track === t.id)))
      throw Error("Unlock this layer first.");
    clipboard = structuredClone(clips);
    change(
      (next) =>
        (next.clips = next.clips.filter(
          (c) => !clips.some((x) => x.id === c.id),
        )),
    );
  });
  $("#edit-paste").onclick = run(() =>
    commit(pasteClips(p, clipboard, preview.time)),
  );
  $("#edit-duplicate").onclick = run(() => {
    const clips = selectedGroup(p, selected, linked);
    if (!clips.length) return;
    commit(
      pasteClips(p, clips, Math.max(...clips.map((c) => c.start + c.duration))),
    );
  });
  $("#edit-title").onclick = run(() => {
    const next = structuredClone(p);
    let track = next.tracks.find(
      (t) => t.kind === "video" && t.name === "Titles" && !t.locked,
    );
    if (!track) {
      track = newTrack("video", "Titles");
      next.tracks.push(track);
    }
    const added = addClip(next, null, track.id, preview.time);
    selected = added.clips.at(-1).id;
    inspectorTrack = null;
    commit(added);
  });
  for (const kind of ["video", "audio"])
    $(`#edit-${kind}-layer`).onclick = run(() =>
      change((next) => next.tracks.push(newTrack(kind))),
    );
  $("#edit-in").onclick = () => {
    if (busy) return;
    rangeIn = frame(preview.time, p.fps);
    render();
  };
  $("#edit-out").onclick = run(() => {
    if (rangeIn === null) throw Error("Mark the in point first.");
    if (preview.time <= rangeIn)
      throw Error("Move after the in point before marking out.");
    change(
      (next) => (next.range = { in: rangeIn, out: frame(preview.time, p.fps) }),
    );
  });
  $("#edit-clear-range").onclick = () => {
    rangeIn = null;
    change((next) => (next.range = null));
  };
  $("#edit-ripple").onclick = run(() => {
    if (!p.range) return;
    const at = p.range.in;
    commit(ripple(p, p.range.in, p.range.out));
    rangeIn = null;
    preview.seek(at);
  });
  $("#edit-zoom").oninput = (e) => {
    zoom = Number(e.target.value);
    renderTimeline();
    $("#edit-playhead").style.left = `${150 + preview.time * zoom}px`;
  };
  $("#edit-cancel").onclick = run(() => io.call("cancel"));
  let scrollRaf;
  timeline.onscroll = () => {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(renderTimeline);
  };
  timeline.onclick = (e) => {
    const b = e.target.closest("[data-track-action]");
    if (b) {
      change((next) => {
        const t = next.tracks.find((t) => t.id === b.dataset.track);
        t[b.dataset.trackAction] = !t[b.dataset.trackAction];
      });
      return;
    }
    const name = e.target.closest("[data-track-select]");
    if (name) renderInspector(name.dataset.trackSelect);
    const marker = e.target.closest("[data-marker]");
    if (marker) {
      stop();
      preview.seek(Number(marker.dataset.marker));
    }
  };
  timeline.onpointerdown = (e) => {
    if (
      e.button !== 0 ||
      busy ||
      e.target.closest(".editor-track-label") ||
      e.target.closest("[data-marker]")
    )
      return;
    stop();
    const b = e.target.closest("[data-clip]"),
      rect = timeline.getBoundingClientRect(),
      x = e.clientX - rect.left + timeline.scrollLeft - 150;
    if (!b) {
      preview.seek(Math.max(0, x / zoom));
      return;
    }
    selected = b.dataset.clip;
    const c = p.clips.find((c) => c.id === selected);
    if (preview.time < c.start || preview.time >= c.start + c.duration)
      preview.seek(c.start);
    renderInspector();
    renderTimeline();
    if (
      p.tracks.some(
        (t) =>
          t.locked &&
          selectedGroup(p, selected, linked).some((x) => x.track === t.id),
      )
    )
      return;
    drag = {
      mode: e.target.dataset.trim || "move",
      x: e.clientX,
      base: structuredClone(p),
      ids: groupIds(),
      clip: c,
    };
    timeline.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  timeline.onpointermove = (e) => {
    if (!drag) return;
    const d = drag;
    let delta = frame((e.clientX - d.x) / zoom, p.fps);
    const clips = d.base.clips.filter((c) => d.ids.includes(c.id));
    p = structuredClone(d.base);
    if (d.mode === "move") {
      delta = Math.max(-Math.min(...clips.map((c) => c.start)), delta);
      if (!e.altKey)
        delta = snap(p, d.clip.start + delta, d.ids, 8 / zoom) - d.clip.start;
    }
    if (d.mode === "left")
      delta = clamp(
        delta,
        -Math.min(
          ...clips.map((c) =>
            ["image", "title"].includes(c.kind)
              ? c.start
              : Math.min(c.start, c.in),
          ),
        ),
        Math.min(...clips.map((c) => c.duration)) - 1 / p.fps,
      );
    if (d.mode === "right") {
      const room = Math.min(
        ...clips.map((c) =>
          ["image", "title"].includes(c.kind)
            ? 43200
            : p.assets.find((a) => a.id === c.asset).duration -
              c.in -
              c.duration,
        ),
      );
      delta = clamp(
        delta,
        1 / p.fps - Math.min(...clips.map((c) => c.duration)),
        room,
      );
    }
    if (d.mode === "move") {
      const row = [...timeline.querySelectorAll("[data-row]")].find((el) => {
        const r = el.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY < r.bottom;
      });
      const target = p.tracks.find((t) => t.id === row?.dataset.row),
        source = p.tracks.find((t) => t.id === d.clip.track);
      if (target && !target.locked && target.kind === source.kind)
        p.clips.find((c) => c.id === d.clip.id).track = target.id;
    }
    for (const c of p.clips.filter((c) => d.ids.includes(c.id))) {
      if (d.mode === "move") c.start += delta;
      if (d.mode === "left") {
        c.start += delta;
        if (!["image", "title"].includes(c.kind)) c.in += delta;
        c.duration -= delta;
      }
      if (d.mode === "right") c.duration += delta;
    }
    try {
      p = sanitize(p);
    } catch {
      p = structuredClone(d.base);
    }
    renderTimeline();
    preview.draw(true);
  };
  const finishDrag = () => {
    if (!drag) return;
    drag = null;
    commit(p);
  };
  timeline.onpointerup = finishDrag;
  timeline.onpointercancel = () => {
    if (drag) {
      p = drag.base;
      drag = null;
      render();
    }
  };
  preview.onDraw = () => {
    const c = p.clips.find(
      (c) =>
        c.id === selected &&
        c.kind !== "audio" &&
        preview.time >= c.start &&
        preview.time < c.start + c.duration,
    );
    if (!c || preview.playing) return;
    const ctx = canvas.getContext("2d"),
      x = c.x * canvas.width,
      y = c.y * canvas.height,
      w = c.w * canvas.width,
      h = c.h * canvas.height;
    ctx.save();
    ctx.strokeStyle = "#d1ff4a";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#d1ff4a";
    for (const [hx, hy] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ])
      ctx.fillRect(hx - 4, hy - 4, 8, 8);
    ctx.restore();
  };
  let canvasDrag;
  canvas.onpointerdown = (e) => {
    if (busy || e.button !== 0) return;
    stop();
    const r = canvas.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width,
      y = (e.clientY - r.top) / r.height;
    let c = p.clips.find(
      (c) =>
        c.id === selected &&
        c.kind !== "audio" &&
        preview.time >= c.start &&
        preview.time < c.start + c.duration,
    );
    let corner = c
      ? [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].find(
          ([a, b]) =>
            Math.abs(x - (c.x + a * c.w)) * r.width < 12 &&
            Math.abs(y - (c.y + b * c.h)) * r.height < 12,
        )
      : null;
    if (!corner)
      c = [...p.clips]
        .sort(
          (a, b) =>
            p.tracks.findIndex((t) => t.id === a.track) -
              p.tracks.findIndex((t) => t.id === b.track) || a.start - b.start,
        )
        .reverse()
        .find(
          (c) =>
            c.kind !== "audio" &&
            !p.tracks.find((t) => t.id === c.track).hidden &&
            preview.time >= c.start &&
            preview.time < c.start + c.duration &&
            x >= c.x &&
            x <= c.x + c.w &&
            y >= c.y &&
            y <= c.y + c.h,
        );
    if (!c) return;
    selected = c.id;
    renderInspector();
    renderTimeline();
    if (p.tracks.find((t) => t.id === c.track).locked) return;
    canvasDrag = { x, y, base: structuredClone(p), c: { ...c }, corner };
    canvas.setPointerCapture(e.pointerId);
    preview.draw();
  };
  canvas.onpointermove = (e) => {
    if (!canvasDrag) return;
    const d = canvasDrag,
      r = canvas.getBoundingClientRect(),
      dx = (e.clientX - r.left) / r.width - d.x,
      dy = (e.clientY - r.top) / r.height - d.y;
    p = structuredClone(d.base);
    const c = p.clips.find((c) => c.id === selected);
    if (d.corner) {
      if (d.corner[0]) c.w = d.c.w + dx;
      else {
        c.x = d.c.x + dx;
        c.w = d.c.w - dx;
      }
      if (d.corner[1]) c.h = d.c.h + dy;
      else {
        c.y = d.c.y + dy;
        c.h = d.c.h - dy;
      }
    } else {
      c.x = d.c.x + dx;
      c.y = d.c.y + dy;
    }
    p = sanitize(p);
    preview.draw();
  };
  canvas.onpointerup = () => {
    if (canvasDrag) {
      canvasDrag = null;
      commit(p);
    }
  };
  canvas.onpointercancel = () => {
    if (canvasDrag) {
      p = canvasDrag.base;
      canvasDrag = null;
      render();
    }
  };
  const onKey = (e) => {
    if (
      !active() ||
      busy ||
      e.repeat ||
      $("#edit-dialog").open ||
      ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)
    )
      return;
    const key = e.key.toLowerCase();
    let button;
    if ((e.ctrlKey || e.metaKey) && key === "z")
      button = e.shiftKey ? "redo" : "undo";
    else if (e.ctrlKey || e.metaKey)
      button = { d: "duplicate", c: "copy", x: "cut", v: "paste", s: "save" }[
        key
      ];
    else if (!e.ctrlKey && !e.metaKey && !e.altKey)
      button = {
        " ": "play",
        s: "split",
        delete: "delete",
        backspace: "delete",
        i: "in",
        o: "out",
        arrowleft: "back",
        arrowright: "forward",
      }[key];
    if (button) {
      e.preventDefault();
      $(`#edit-${button}`).dispatchEvent(
        new MouseEvent("click", { shiftKey: e.shiftKey }),
      );
    } else if (key === "m" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      change((next) =>
        next.markers.push({
          time: frame(preview.time, p.fps),
          name: `Marker ${next.markers.length + 1}`,
        }),
      );
    }
  };
  const onView = () => {
    if (!active() || document.hidden || io.isBusy()) {
      stop();
      preview.clear();
    } else preview.draw(true);
  };
  const onTake = (e) => run(() => openTake(e.detail))();
  window.addEventListener("keydown", onKey);
  window.addEventListener("latitude-view", onView);
  window.addEventListener("latitude-edit-take", onTake);
  document.addEventListener("visibilitychange", onView);
  const off = io.onProgress((state) => {
    if (disposed) return;
    $("#edit-progress-label").textContent = state.message;
    if (state.percent !== undefined) $("#edit-progress").value = state.percent;
  });
  $("#edit-export").onclick = run(() => {
    if (!p.clips.length)
      throw Error("Add a take or media to your timeline first.");
    stop();
    showDialog(
      `<h2>Export your finished edit</h2><p>${esc(p.name)} · ${time(duration(p))} · ${FORMATS[p.format].join(" × ")} · ${p.fps} fps</p><label>Format<select id="edit-export-format"><option value="mp4">MP4 · recommended, easiest to share · H.264 / AAC</option><option value="mkv">MKV · editable archive, lossless audio · H.264 / FLAC</option><option value="wav">WAV · audio-only podcast master, larger lossless file</option></select></label><label>Picture quality<select id="edit-export-quality"><option value="balanced">Balanced · faster, smaller render</option><option value="sharp">Sharper · more encoding time and disk space</option></select></label><label class="check-line"><input id="edit-export-separate" type="checkbox">Keep separate audio layers + WAV stems</label><p class="fine-print">MP4/MKV can carry the mix and individual audio tracks. WAV stems make importing individual layers into editors such as CapCut straightforward. The audio-only option exports the finished mix.</p><label class="check-line"><input id="edit-export-normalize" type="checkbox" ${p.normalize ? "checked" : ""}>Match podcast loudness</label><label>Loudness target<select id="edit-export-target"><option value="-16" ${p.target === -16 ? "selected" : ""}>−16 LUFS · stereo podcast</option><option value="-14" ${p.target === -14 ? "selected" : ""}>−14 LUFS · louder social clip</option><option value="-20" ${p.target === -20 ? "selected" : ""}>−20 LUFS · more natural dynamics</option></select></label><label class="check-line"><input id="edit-export-range" type="checkbox" ${p.range ? "" : "disabled"}>${p.range ? `Only selected range · ${time(p.range.in)} → ${time(p.range.out)}` : "Mark in/out to export just a clip"}</label><p class="notice">Exports run locally from your originals. A new folder holds the finished file, optional audio stems and a loudness report. Temporary rendering uses extra disk space; originals are never overwritten.</p><div class="editor-file-actions"><button class="button" data-close>Cancel</button><button class="button primary" id="edit-export-confirm">Choose folder & export</button></div>`,
    );
    $("#edit-export-format").onchange = () => {
      $("#edit-export-separate").disabled =
        $("#edit-export-format").value === "wav";
    };
    $("#edit-export-confirm").onclick = run(async () => {
      const options = {
        format: $("#edit-export-format").value,
        quality: $("#edit-export-quality").value,
        separate: $("#edit-export-separate").checked,
        range: $("#edit-export-range").checked,
      };
      change((next) => {
        next.normalize = $("#edit-export-normalize").checked;
        next.target = Number($("#edit-export-target").value);
      });
      $("#edit-dialog").close();
      await work(async () => {
        await document.fonts.ready;
        const titles = {};
        const from = options.range && p.range ? p.range.in : 0,
          to = options.range && p.range ? p.range.out : duration(p);
        let titleBytes = 0;
        if (options.format !== "wav")
          for (const c of p.clips.filter(
            (c) =>
              c.kind === "title" &&
              c.start < to &&
              c.start + c.duration > from &&
              !p.tracks.find((t) => t.id === c.track).hidden,
          )) {
            const surface = titleCanvas(c, p);
            titles[c.id] = surface.toDataURL("image/png");
            surface.width = surface.height = 1;
            titleBytes += titles[c.id].length;
            if (titleBytes > 64 * 1024 * 1024)
              throw Error(
                "Export a shorter range or simplify the titles in this edit.",
              );
          }
        const result = await io.call("export", { project: p, options, titles });
        if (result) {
          showDialog(
            `<h2>Your edit is ready.</h2><p>${esc(result.report.encodedTruePeak)} · ${result.report.tracks.length} audio ${result.report.tracks.length === 1 ? "track" : "tracks"}</p><p>Your source files and project remain editable.</p><div class="editor-file-actions"><button class="button" data-close>Done</button><button class="button primary" id="edit-export-reveal">Open export folder</button></div>`,
          );
          $("#edit-export-reveal").onclick = run(() => io.call("reveal"));
        }
      });
    });
  });
  render();
  if (io.available)
    io.call("draft-info")
      .then((d) => {
        if (d && !disposed) {
          $("#edit-recovery").hidden = false;
          $("#edit-recovery-name").textContent =
            `Recover your last edit: ${d.name}.`;
        }
      })
      .catch(() => {});
  document.fonts.ready.then(() => {
    if (!disposed) {
      preview.titles.clear();
      preview.draw();
    }
  });
  teardown = async () => {
    if (busy)
      throw Error(
        "Finish or cancel the editor operation before disabling this mod.",
      );
    disposed = true;
    off();
    cancelAnimationFrame(scrollRaf);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("latitude-view", onView);
    window.removeEventListener("latitude-edit-take", onTake);
    document.removeEventListener("visibilitychange", onView);
    await preview.destroy();
    if (io.available) await io.call("dispose");
    panel.remove();
    style.remove();
  };
  if (new URLSearchParams(location.search).has("test"))
    window.__editor = {
      get project() {
        return p;
      },
      get preview() {
        return preview;
      },
      get media() {
        return media;
      },
      reset,
      commit,
      select: (id) => {
        selected = id;
        inspectorTrack = null;
        render();
      },
      openTake,
    };
}
export async function deactivate() {
  await teardown?.();
  teardown = null;
  if (window.__editor) delete window.__editor;
}
