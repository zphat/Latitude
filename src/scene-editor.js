import {
  layer,
  layers,
  uid,
  hitTest,
  moveBox,
  resizeBox,
  FONTS,
} from "./scene-model.js";
import { importImage } from "./assets-store.js";
export function installSceneEditor(api) {
  const {
      $,
      $$,
      escape,
      icon,
      config,
      engine,
      compositor,
      persist,
      modal,
      closeModal,
      toast,
      attempt,
      studioTools,
    } = api,
    overlay = $("#layout-overlay"),
    box = $("#selection-box"),
    pane = $("#source-inspector");
  let selected = null,
    drag = null,
    locked = false,
    history = [],
    future = [];
  const current = () => compositor.getLayers(),
    picked = () => current().find((l) => l.id === selected),
    snapshot = () => JSON.stringify(compositor.documents);
  function checkpoint(before = snapshot()) {
    history.push(before);
    if (history.length > 40) history.shift();
    future = [];
  }
  function save() {
    config.compositions = structuredClone(compositor.documents);
    persist();
    compositor.invalidate();
    window.dispatchEvent(new Event("latitude-content"));
    update();
  }
  function commit(fn) {
    checkpoint();
    fn();
    save();
    render();
  }
  function undo(redo = false) {
    const from = redo ? future : history,
      to = redo ? history : future;
    if (!from.length) return;
    to.push(snapshot());
    compositor.documents = JSON.parse(from.pop());
    if (!picked()) selected = null;
    save();
    render();
  }
  function tab(name) {
    if ((name === "source") === pane.hidden) $("#inspector").scrollTop = 0;
    $("#voice-panel").hidden = name !== "voice";
    pane.hidden = name !== "source";
    $$("[data-inspector-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.inspectorTab === name);
      b.ariaSelected = String(b.dataset.inspectorTab === name);
    });
  }
  window.addEventListener("latitude-inspector", (e) => tab(e.detail));
  $$("[data-inspector-tab]").forEach(
    (b) => (b.onclick = () => tab(b.dataset.inspectorTab)),
  );
  function select(id) {
    selected = id;
    update();
    render();
    if (id) tab("source");
  }
  function update() {
    const r = $("#preview-frame").getBoundingClientRect(),
      scale = Math.min(r.width / 1920, r.height / 1080),
      w = scale * 1920,
      h = scale * 1080;
    Object.assign(overlay.style, {
      width: `${w}px`,
      height: `${h}px`,
      left: `${(r.width - w) / 2}px`,
      top: `${(r.height - h) / 2}px`,
    });
    overlay.hidden = locked;
    const l = picked();
    box.hidden = !l || !l.visible;
    if (l) {
      Object.assign(box.style, {
        left: `${l.x * 100}%`,
        top: `${l.y * 100}%`,
        width: `${l.w * 100}%`,
        height: `${l.h * 100}%`,
      });
      $("#selection-name").textContent = l.name + (l.locked ? " · locked" : "");
      $("#selection-name").style.top = l.y > 0.05 ? "-21px" : "0";
      box.classList.toggle("source-locked", l.locked);
    }
    $("#arrange-toggle").textContent = locked
      ? "Unlock preview"
      : "Lock preview";
    $("#arrange-toggle").ariaPressed = String(locked);
    $("#editor-status").textContent = locked
      ? "Preview locked"
      : l
        ? `${l.name} · drag to move · corners resize`
        : "Click any source to move or resize";
    $("#undo-edit").disabled = !history.length;
    $("#redo-edit").disabled = !future.length;
  }
  const opts = (options, value) =>
    options
      .map(
        ([v, n]) =>
          `<option value="${v}" ${v === value ? "selected" : ""}>${n}</option>`,
      )
      .join("");
  function properties(l) {
    return `<div class="source-property-heading"><span class="section-label">SELECTED SOURCE</span><span class="tag">${escape(l.type)}</span></div><label>Name<input id="source-name" value="${escape(l.name)}" maxlength="60"></label><div class="source-actions"><button class="button small" id="source-up">↑ Forward</button><button class="button small" id="source-down">↓ Back</button><button class="button small" id="source-duplicate">Duplicate</button></div>${
      l.type === "text"
        ? `<label>Text<textarea id="source-text" rows="3" maxlength="2000">${escape(l.text)}</textarea></label><div class="source-two"><label>Font<select id="source-font">${opts(
            FONTS.map((f) => [f, f]),
            l.font,
          )}</select></label><label>Size · at 1080p<input type="number" id="source-size" min="12" max="240" value="${l.size}"></label></div><div class="source-two"><label class="toggle-row">Bold<input id="source-bold" type="checkbox" ${l.bold ? "checked" : ""}></label><label class="toggle-row">Italic<input id="source-italic" type="checkbox" ${l.italic ? "checked" : ""}></label></div><label>Alignment<select id="source-align">${opts(
            [
              ["left", "Left"],
              ["center", "Center"],
              ["right", "Right"],
            ],
            l.align,
          )}</select></label>`
        : ""
    }${["text", "color"].includes(l.type) ? `<div class="source-two"><label>Color<input type="color" id="source-color" value="${l.color}"></label><label>Gradient end<input type="color" id="source-color2" value="${l.color2}"></label></div><label class="toggle-row">Use gradient<input type="checkbox" id="source-gradient" ${l.gradient ? "checked" : ""}></label><label>Gradient angle<input type="range" id="source-angle" min="0" max="360" value="${l.angle}"></label>` : ""}${l.type === "text" ? `<div class="source-two"><label>Outline · px<input type="number" id="source-outline" min="0" max="12" value="${l.outline}"></label><label class="toggle-row">Shadow<input type="checkbox" id="source-shadow" ${l.shadow ? "checked" : ""}></label></div>` : ""}<details class="source-transform" ${l.type === "video" ? "open" : ""}><summary>Position & size</summary><div class="source-two">${[
      ["x", "Left", config.width],
      ["y", "Top", config.height],
      ["w", "Width", config.width],
      ["h", "Height", config.height],
    ]
      .map(
        ([k, n, size]) =>
          `<label>${n} · px<input type="number" id="source-${k}" min="${k === "x" || k === "y" ? 0 : 1}" max="${size}" value="${Math.round(l[k] * size)}"></label>`,
      )
      .join(
        "",
      )}</div><label class="toggle-row">Keep aspect ratio<input id="source-aspect" type="checkbox" ${l.aspectLock ? "checked" : ""}></label><div class="button-row"><button class="button small" id="source-center">Center</button><button class="button small" id="source-fill">Full canvas</button></div></details>${
      ["video", "image"].includes(l.type)
        ? `<label>Content fit<select id="source-fit">${opts(
            [
              ["contain", "Fit · show everything"],
              ["cover", "Fill · trim to frame"],
            ],
            l.fit,
          )}</select></label><label>Frame shape<select id="source-shape">${opts(
            [
              ["rectangle", "Rectangle"],
              ["rounded", "Rounded"],
              ["circle", "Circle / oval"],
            ],
            l.shape,
          )}</select></label><label class="toggle-row">Mirror<input id="source-mirror" type="checkbox" ${l.mirror ? "checked" : ""}></label>${l.type === "video" ? '<button class="button crop-selected" id="source-crop">Crop this source</button>' : ""}`
        : ""
    }<label>Opacity · ${Math.round(l.opacity * 100)}%<input id="source-opacity" type="range" min="0" max="100" value="${l.opacity * 100}"></label><button class="text-button danger" id="source-remove">Remove from this scene</button>`;
  }
  function render() {
    $("#layer-list").innerHTML =
      [...current()]
        .reverse()
        .map(
          (l) =>
            `<div class="layer-row ${l.id === selected ? "selected" : ""}"><button class="layer-select" data-layer="${l.id}">${icon(l.type === "video" ? (l.source === "camera" ? "camera" : "monitor") : l.type === "text" ? "type" : l.type === "image" ? "image" : "layout")}<span>${escape(l.name)}</span><small>${l.type === "video" ? (l.source === "camera" ? "camera" : `view ${l.source.toUpperCase()}`) : l.type}</small></button><button class="layer-mini" data-visible="${l.id}" aria-label="${l.visible ? "Hide" : "Show"} ${escape(l.name)}" title="${l.visible ? "Hide" : "Show"} source" aria-pressed="${l.visible}">${l.visible ? "◉" : "○"}</button><button class="layer-mini" data-lock="${l.id}" aria-label="${l.locked ? "Unlock" : "Lock"} ${escape(l.name)}" title="${l.locked ? "Unlock" : "Lock"} source" aria-pressed="${l.locked}">${l.locked ? "▣" : "□"}</button></div>`,
        )
        .join("") ||
      '<p class="fine-print">An empty canvas. Add a source to start.</p>';
    $$("[data-layer]").forEach(
      (b) => (b.onclick = () => select(b.dataset.layer)),
    );
    $$("[data-visible]").forEach(
      (b) =>
        (b.onclick = () =>
          commit(() => {
            const l = current().find((l) => l.id === b.dataset.visible);
            l.visible = !l.visible;
          })),
    );
    $$("[data-lock]").forEach(
      (b) =>
        (b.onclick = () =>
          commit(() => {
            const l = current().find((l) => l.id === b.dataset.lock);
            l.locked = !l.locked;
          })),
    );
    const l = picked();
    $("#source-properties").innerHTML = l
      ? properties(l)
      : '<div class="editor-empty"><h3>Everything has its place.</h3><p>Click a source in the preview or choose a layer above. Drag to move, grab a corner to resize.</p><p>Hold Alt to ignore snapping. Hold Shift while resizing to switch aspect lock.</p></div>';
    if (!l) return;
    const bind = (id, key, read = (v) => v) => {
      $(id).onchange = (e) =>
        commit(() => {
          l[key] = read(
            e.target.type === "checkbox" ? e.target.checked : e.target.value,
          );
        });
    };
    bind("#source-name", "name", (v) => v.slice(0, 60) || l.type);
    bind("#source-opacity", "opacity", (v) => Number(v) / 100);
    bind("#source-aspect", "aspectLock");
    for (const [key, size] of [
      ["x", config.width],
      ["y", config.height],
      ["w", config.width],
      ["h", config.height],
    ])
      $(`#source-${key}`).onchange = (e) =>
        commit(() => {
          const value = Number(e.target.value) / size;
          if (l.aspectLock && (key === "w" || key === "h"))
            Object.assign(
              l,
              resizeBox(
                l,
                key === "w" ? value - l.w : 0,
                key === "h" ? value - l.h : 0,
                "se",
                true,
              ),
            );
          else Object.assign(l, layer({ ...l, [key]: value }));
        });
    $("#source-duplicate").onclick = duplicate;
    $("#source-remove").onclick = remove;
    $("#source-up").onclick = () => reorder(1);
    $("#source-down").onclick = () => reorder(-1);
    $("#source-center").onclick = () =>
      commit(() => {
        l.x = (1 - l.w) / 2;
        l.y = (1 - l.h) / 2;
      });
    $("#source-fill").onclick = () =>
      commit(() => Object.assign(l, { x: 0, y: 0, w: 1, h: 1 }));
    if (["video", "image"].includes(l.type)) {
      bind("#source-fit", "fit");
      bind("#source-mirror", "mirror");
      $("#source-shape").onchange = (e) =>
        commit(() => {
          l.shape = e.target.value;
          if (l.shape === "circle") {
            l.w = Math.min(l.w, 9 / 16);
            l.h = (l.w * 16) / 9;
            l.x = Math.min(l.x, 1 - l.w);
            l.y = Math.min(l.y, 1 - l.h);
            l.aspectLock = true;
          }
        });
    }
    if (l.type === "video")
      $("#source-crop").onclick = () => studioTools.cropEditor(l.source, l);
    if (l.type === "text") {
      bind("#source-font", "font");
      bind("#source-size", "size", (v) =>
        Math.max(12, Math.min(240, Number(v) || 64)),
      );
      bind("#source-bold", "bold");
      bind("#source-italic", "italic");
      bind("#source-align", "align");
      bind("#source-shadow", "shadow");
      bind("#source-outline", "outline", (v) =>
        Math.max(0, Math.min(12, Number(v) || 0)),
      );
      $("#source-text").oninput = (e) => {
        if (!e.target.dataset.editing) {
          checkpoint();
          e.target.dataset.editing = "true";
        }
        l.text = e.target.value.slice(0, 2000);
        compositor.invalidate();
      };
      $("#source-text").onchange = () => {
        save();
        render();
      };
    }
    if (["text", "color"].includes(l.type)) {
      bind("#source-color", "color");
      bind("#source-color2", "color2");
      bind("#source-gradient", "gradient");
      bind("#source-angle", "angle", Number);
    }
  }
  function reorder(d) {
    const l = picked(),
      i = current().indexOf(l),
      j = i + d;
    if (j < 0 || j >= current().length) return;
    commit(() => {
      current().splice(i, 1);
      current().splice(j, 0, l);
    });
  }
  function duplicate() {
    const l = picked();
    if (!l) return;
    if (current().length >= 40) {
      toast("A scene can have up to 40 layers.");
      return;
    }
    commit(() => {
      const n = layer({
        ...l,
        id: uid(),
        name: l.name + " copy",
        x: Math.min(1 - l.w, l.x + 0.02),
        y: Math.min(1 - l.h, l.y + 0.02),
      });
      current().push(n);
      selected = n.id;
    });
  }
  function remove() {
    const l = picked();
    if (l)
      commit(() => {
        current().splice(current().indexOf(l), 1);
        selected = null;
      });
  }
  function add(spec) {
    if (current().length >= 40)
      throw Error("A scene can have up to 40 layers.");
    commit(() => {
      const l = layer(spec);
      current().push(l);
      selected = l.id;
    });
    tab("source");
    closeModal();
  }
  function addDialog() {
    modal(
      "Add to your scene.",
      `<div class="add-source-grid">${[
        ["a", "Screen A", "Your main screen or window."],
        ["b", "View B", "A second view or another area of A."],
        ["camera", "Camera", "Optional facecam or full camera view."],
        ["text", "Text", "Titles, captions, and gradient lettering."],
        ["image", "Image / logo", "Local PNG, JPEG, or WebP."],
        ["color", "Color panel", "A solid or gradient background."],
      ]
        .map(
          ([id, n, note]) =>
            `<button class="template-card" data-add-source="${id}"><h3>${n}</h3><p>${note}</p></button>`,
        )
        .join(
          "",
        )}</div><p class="fine-print">Sources are added only to this scene. Video layers reuse connected captures, without duplicate audio or additional camera connections.</p>`,
      "SCENE SOURCES",
    );
    $$("[data-add-source]").forEach(
      (b) =>
        (b.onclick = attempt(async () => {
          const t = b.dataset.addSource;
          if (t === "image") {
            $("#image-file").click();
            return;
          }
          if (t === "text")
            add({
              type: t,
              name: "Text",
              text: "Your title here",
              x: 0.07,
              y: 0.75,
              w: 0.7,
              h: 0.18,
              size: 64,
            });
          else if (t === "color")
            add({
              type: t,
              name: "Color panel",
              x: 0.1,
              y: 0.1,
              w: 0.8,
              h: 0.8,
              color: "#23372c",
            });
          else {
            add({
              type: "video",
              name:
                t === "camera" ? "Camera" : t === "a" ? "Screen A" : "View B",
              source: t,
              x: 0.08,
              y: 0.08,
              w: 0.6,
              h: 0.6,
              fit: t === "camera" ? "cover" : "contain",
              crop: compositor.layout.crops[t],
            });
            if (!compositor.ready(compositor.source(t)))
              toast("Layer added. Connect its device in the source bar.");
          }
        })),
    );
  }
  $("#image-file").onchange = attempt(async (e) => {
    try {
      const f = e.target.files[0];
      if (!f) return;
      const a = await importImage(f),
        w = Math.min(0.5, (((0.5 * a.width) / a.height) * 9) / 16),
        h = (((w * 16) / 9) * a.height) / a.width;
      add({
        type: "image",
        name: f.name.slice(0, 60),
        asset: a.id,
        x: 0.1,
        y: 0.1,
        w,
        h,
      });
    } finally {
      e.target.value = "";
    }
  });
  $("#add-source").onclick = addDialog;
  $("#add-source-panel").onclick = addDialog;
  $("#undo-edit").onclick = () => undo();
  $("#redo-edit").onclick = () => undo(true);
  $("#arrange-toggle").onclick = () => {
    locked = !locked;
    update();
  };
  overlay.onpointerdown = (e) => {
    if (e.button !== 0) return;
    const r = overlay.getBoundingClientRect(),
      p = {
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
      },
      handle = e.target.dataset.handle,
      l = handle
        ? picked()
        : hitTest(
            current().filter(
              (l) =>
                l.type !== "video" ||
                l.source !== "camera" ||
                compositor.ready(compositor.camera) ||
                compositor.scene === "camera",
            ),
            p.x,
            p.y,
          );
    select(l?.id || null);
    if (!l || l.locked) return;
    drag = {
      before: snapshot(),
      original: { ...l },
      x: e.clientX,
      y: e.clientY,
      width: r.width,
      height: r.height,
      handle,
    };
    overlay.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  overlay.onpointermove = (e) => {
    if (!drag) return;
    const l = picked();
    if (!l) return;
    const dx = (e.clientX - drag.x) / drag.width,
      dy = (e.clientY - drag.y) / drag.height;
    let r,
      guides = [];
    if (drag.handle)
      r = resizeBox(
        drag.original,
        dx,
        dy,
        drag.handle,
        e.shiftKey ? !l.aspectLock : l.aspectLock,
      );
    else
      ({ box: r, guides } = moveBox(
        drag.original,
        dx,
        dy,
        !e.altKey,
        current(),
      ));
    Object.assign(l, { x: r.x, y: r.y, w: r.w, h: r.h });
    if (drag.handle && l.type === "text")
      l.size = Math.max(
        12,
        Math.min(240, (drag.original.size * l.w) / drag.original.w),
      );
    $("#snap-guides").innerHTML = guides
      .map(
        (g) =>
          `<i class="snap-${g.axis}" style="${g.axis === "x" ? "left" : "top"}:${g.value * 100}%"></i>`,
      )
      .join("");
    compositor.invalidate();
    update();
  };
  function finishDrag() {
    if (drag) {
      if (snapshot() !== drag.before) {
        checkpoint(drag.before);
        save();
      }
      drag = null;
      $("#snap-guides").innerHTML = "";
      render();
    }
  }
  overlay.onpointerup = finishDrag;
  overlay.onpointercancel = finishDrag;
  overlay.ondblclick = () => {
    if (picked()?.type === "text") {
      tab("source");
      $("#source-text")?.focus();
    } else if (picked()?.type === "video")
      studioTools.cropEditor(picked().source, picked());
  };
  window.addEventListener("keydown", (e) => {
    if (
      $("#modal").open ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
      !$("#page-studio").classList.contains("active")
    )
      return;
    const command = e.ctrlKey || e.metaKey,
      key = e.key.toLowerCase();
    if (command && !e.shiftKey && key === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (command && (key === "y" || (e.shiftKey && key === "z"))) {
      e.preventDefault();
      undo(true);
      return;
    }
    if (locked) return;
    const l = picked();
    if (!l) return;
    if (e.key === "Escape") {
      select(null);
      return;
    }
    if (command && key === "d") {
      e.preventDefault();
      duplicate();
      return;
    }
    if (l.locked) return;
    if (["Delete", "Backspace"].includes(e.key)) {
      e.preventDefault();
      remove();
      return;
    }
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      commit(() => {
        const r = moveBox(
          l,
          (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0) /
            config.width,
          (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0) /
            config.height,
          false,
        ).box;
        Object.assign(l, { x: r.x, y: r.y });
      });
    }
  });
  window.addEventListener("latitude-checkpoint", () => {
    checkpoint();
    update();
  });
  window.addEventListener("latitude-quality", () => {
    update();
    render();
  });
  new ResizeObserver(update).observe($("#preview-frame"));
  window.addEventListener("latitude-layout", () => {
    selected = null;
    update();
    render();
  });
  window.addEventListener("latitude-rebuild", () => {
    selected = null;
    save();
    render();
  });
  engine.addEventListener("sources", () => {
    compositor.invalidate();
    update();
  });
  for (const event of ["recording", "live"])
    engine.addEventListener(event, () => {
      locked = !!(engine.recording || engine.live);
      update();
    });
  $("#copy-scene").onclick = () => {
    modal(
      "Copy this composition.",
      `<p>Replace another scene’s layers with a copy. You can undo this.</p><label>Destination<select id="copy-destination">${Object.keys(
        compositor.documents,
      )
        .filter((s) => s !== compositor.scene)
        .map(
          (s) =>
            `<option value="${s}">${{ present: "Screen + facecam", camera: "Camera", split: "Two views", screen: "Screen only", break: "Intermission" }[s]}</option>`,
        )
        .join(
          "",
        )}</select></label><div class="modal-footer"><button class="button primary" id="confirm-copy-scene">Copy layers</button></div>`,
      "REUSE A COMPOSITION",
    );
    $("#confirm-copy-scene").onclick = () => {
      commit(() => {
        compositor.documents[$("#copy-destination").value] = layers(
          current().map((l) => ({ ...l, id: uid() })),
        );
      });
      closeModal();
      toast("Composition copied. Each scene is independently editable.");
    };
  };
  update();
  render();
  return {
    select,
    update,
    render,
    save,
    add,
    tab,
    undo,
    checkpoint,
    get selected() {
      return selected;
    },
  };
}
