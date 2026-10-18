import {
  THEMES,
  TEMPLATES,
  layout,
  rect,
  cameraRect,
  cropPixels,
  cropFromMargins,
  bounded,
  validatePack,
} from "./design.js";
import { defaults, layers } from "./scene-model.js";
import { exportAssets, importAssets } from "./assets-store.js";
export function installStudioTools(api) {
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
    setScene,
    selectVoice,
    syncMixer,
    persistProfile,
    deviceOptions,
    chooseScreen,
    refreshSources,
  } = api;
  let pack = null;
  try {
    if (config.pack) pack = validatePack(config.pack);
  } catch {
    delete config.pack;
  }
  const themes = () => [...THEMES, ...(pack?.themes || [])],
    templates = () => [...TEMPLATES, ...(pack?.templates || [])];
  const saveLayout = () => {
    config.layout = structuredClone(compositor.layout);
    persist();
    compositor.invalidate();
    window.dispatchEvent(new Event("latitude-content"));
    refreshSources(engine.sourceState());
  };
  function applyTheme(id) {
    document.documentElement.classList.add("theme-switching");
    const t = themes().find((t) => t.id === id) || THEMES[0];
    config.theme = t.id;
    document.documentElement.style.colorScheme = t.scheme;
    document.documentElement.dataset.theme = t.id;
    for (const [k, v] of Object.entries(t.colors))
      document.documentElement.style.setProperty(`--${k}`, v);
    persist();
    if ($("#theme-select")) $("#theme-select").value = t.id;
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.documentElement.classList.remove("theme-switching"),
      ),
    );
  }
  function themeChoices() {
    return `<div class="theme-grid">${themes()
      .map(
        (t) =>
          `<button class="theme-choice ${config.theme === t.id ? "selected" : ""}" data-theme="${t.id}" aria-pressed="${config.theme === t.id}" style="--swatch-bg:${t.colors.bg};--swatch-panel:${t.colors.panel};--swatch-accent:${t.colors.accent};--swatch-highlight:${t.colors.highlight}"><span class="theme-swatch"><i></i><b></b><em></em></span><strong>${escape(t.name)}</strong><small>${escape(t.note)}</small></button>`,
      )
      .join("")}</div>`;
  }
  function bindThemes() {
    $$("button[data-theme]").forEach(
      (b) =>
        (b.onclick = () => {
          applyTheme(b.dataset.theme);
          $$("button[data-theme]").forEach((x) => {
            x.classList.toggle("selected", x === b);
            x.ariaPressed = String(x === b);
          });
        }),
    );
  }
  function templateChoices(selected) {
    return `<div class="template-grid">${templates()
      .map(
        (t, i) =>
          `<button class="template-card ${selected === t.id ? "selected" : ""}" data-template="${i}" aria-pressed="${selected === t.id}"><span class="layout-diagram diagram-${t.scene}"><i></i><b></b><em></em></span><h3>${escape(t.name)}</h3><p>${escape(t.note)}</p></button>`,
      )
      .join("")}</div>`;
  }
  function applyTemplate(t) {
    window.dispatchEvent(new Event("latitude-checkpoint"));
    compositor.layout = layout(t.layout);
    config.template = t.id;
    compositor.documents[t.scene] = t.composition
      ? layers(t.composition)
      : defaults(t.scene, compositor.layout, compositor);
    config.compositions = structuredClone(compositor.documents);
    saveLayout();
    setScene(t.scene);
    window.dispatchEvent(new Event("latitude-rebuild"));
  }
  $("#templates-button").onclick = () => {
    modal(
      "Your starting layout.",
      templateChoices(config.template) +
        '<p class="notice">Camera is always optional. Templates replace the destination scene. Microphone processing and connected devices stay as they are.</p>',
      "SCENE TEMPLATES",
    );
    $$("[data-template]").forEach(
      (b) =>
        (b.onclick = () => {
          const t = templates()[Number(b.dataset.template)];
          applyTemplate(t);
          closeModal();
          toast(
            `${t.name} is ready. Connect your screen, then crop or arrange it.`,
          );
        }),
    );
  };
  async function onboard() {
    if (engine.recording || engine.finishing)
      throw Error("Run setup between takes.");
    let mic = config.mic1 || "",
      devices = await engine.devices();
    const connect = async () => {
      await engine.mic(0, mic, config.noise[0]);
      config.mic1 = mic;
      const profile =
        config.profiles[`${mic || "default"}::left`] ||
        config.profiles[mic || "default"];
      if (profile) {
        engine.setVoice(0, { ...profile.settings, mute: false });
        config.preset[0] = profile.preset;
        selectVoice(0);
        syncMixer();
      }
      persist();
    };
    const finish = () => {
      config.onboarded = true;
      persist();
      closeModal();
      toast(
        "Ready. Choose your screen, then click any source to move or resize it.",
      );
    };
    const draw = () => {
      modal(
        "Start with your voice.",
        `<div class="welcome-copy"><h3>One microphone. Your studio is ready.</h3><p>Choose your main microphone. Camera, scenes, and themes are optional and can be changed anytime.</p></div><label class="field">Voice 1 microphone<select id="onboard-mic">${deviceOptions(devices, "audioinput", mic, "System default microphone")}</select></label><div class="onboard-test"><button class="button" id="onboard-connect">Enable & test microphone</button><span id="onboard-mic-status">${engine.streams.mic1 ? "Connected — speak normally." : "Your microphone stays off until you connect it."}</span></div><div class="check-meter"><div id="onboard-level"></div></div><p class="fine-print">Your mic records on its own synchronized track. Run Soundcheck before an important take to set a comfortable input level.</p><div class="modal-footer"><button class="text-button" id="onboard-back">Skip microphone</button><button class="button primary" id="onboard-next">Open my studio ${icon("arrow")}</button></div>`,
        "QUICK MICROPHONE SETUP",
      );
      $("#onboard-mic").onchange = (e) => (mic = e.target.value);
      $("#onboard-connect").onclick = attempt(async () => {
        const b = $("#onboard-connect");
        b.disabled = true;
        try {
          await connect();
          devices = await engine.devices();
          draw();
        } finally {
          b.disabled = false;
        }
      });
      $("#onboard-back").onclick = attempt(async () => {
        mic = "off";
        await connect();
        finish();
      });
      $("#onboard-next").onclick = attempt(async () => {
        const b = $("#onboard-next");
        b.disabled = true;
        try {
          if (mic !== config.mic1 || (!engine.streams.mic1 && mic !== "off"))
            await connect();
          finish();
        } finally {
          b.disabled = false;
        }
      });
    };
    draw();
  }
  engine.addEventListener("meters", ({ detail: m }) => {
    const meter = $("#onboard-level");
    if (meter)
      meter.style.width = `${bounded(((20 * Math.log10(Math.max(1e-8, m.inputPeaks[0])) + 60) / 60) * 100, 0, 100)}%`;
  });
  $("#reopen-onboarding").onclick = attempt(onboard);
  const updateOverlay = () =>
    window.dispatchEvent(new Event("latitude-content"));
  function cropEditor(slot = "a", target = null) {
    const video = compositor.source(slot);
    if (!compositor.ready(video)) {
      toast(
        `Connect ${slot === "camera" ? "a camera" : `screen ${slot.toUpperCase()}`} before cropping.`,
        true,
      );
      return;
    }
    const width = video.videoWidth,
      height = video.videoHeight;
    let draft = structuredClone(target?.crop || compositor.layout.crops[slot]);
    modal(
      `Crop ${slot === "camera" ? "camera" : `screen ${slot.toUpperCase()}`}`,
      `<p class="crop-intro">Drag a box around what you want to keep, drag inside it to move, or enter exact pixel margins. Only the selected area is recorded.</p><div class="crop-surface" id="crop-surface" style="aspect-ratio:${width}/${height};max-width:${Math.round((380 * width) / height)}px"><canvas id="crop-canvas" width="${width}" height="${height}"></canvas><div id="crop-box"><span>Keep this area</span><i id="crop-handle"></i></div></div><div class="crop-info"><span>${width} × ${height} source pixels</span><b id="crop-size"></b></div><div class="crop-fields">${["left", "top", "right", "bottom"].map((k) => `<label>${k[0].toUpperCase() + k.slice(1)}<input id="crop-${k}" type="number" min="0" max="${k === "left" || k === "right" ? width - 1 : height - 1}" step="1"> px</label>`).join("")}</div><div class="crop-presets">${[
        ["full", "Full source"],
        ["left", "Left half"],
        ["right", "Right half"],
        ["chrome", "Trim browser + taskbar"],
      ]
        .map(
          ([id, label]) =>
            `<button class="button small" data-crop-preset="${id}">${label}</button>`,
        )
        .join(
          "",
        )}</div><p class="fine-print">Browser trim starts at top 100 px, bottom 48 px. Adjust it to your display. Crops keep their proportions if the source changes size.</p><div class="modal-footer"><button class="button" id="crop-cancel">Cancel</button><button class="button primary" id="crop-apply">Apply crop</button></div>`,
      "PRECISE FRAMING",
    );
    const surface = $("#crop-surface"),
      selection = $("#crop-box"),
      canvas = $("#crop-canvas"),
      ctx = canvas.getContext("2d");
    let pointer = null;
    const draw = () => {
      if (!canvas.isConnected || !$("#modal").open) return;
      if (compositor.ready(video)) ctx.drawImage(video, 0, 0, width, height);
      setTimeout(draw, 100);
    };
    draw();
    const update = () => {
      draft = rect(draft, 1 / Math.max(width, height));
      const r = cropPixels(draft, width, height);
      Object.assign(selection.style, {
        left: `${draft.x * 100}%`,
        top: `${draft.y * 100}%`,
        width: `${draft.w * 100}%`,
        height: `${draft.h * 100}%`,
      });
      $("#crop-left").value = r.x;
      $("#crop-top").value = r.y;
      $("#crop-right").value = width - r.x - r.w;
      $("#crop-bottom").value = height - r.y - r.h;
      $("#crop-size").textContent = `Keep ${r.w} × ${r.h} px`;
    };
    update();
    for (const k of ["left", "top", "right", "bottom"])
      $(`#crop-${k}`).oninput = () => {
        draft = cropFromMargins(
          Object.fromEntries(
            ["left", "top", "right", "bottom"].map((n) => [
              n,
              Number($(`#crop-${n}`).value),
            ]),
          ),
          width,
          height,
        );
        update();
      };
    const point = (e) => {
      const r = surface.getBoundingClientRect();
      return {
        x: bounded((e.clientX - r.left) / r.width, 0, 1),
        y: bounded((e.clientY - r.top) / r.height, 0, 1),
      };
    };
    surface.onpointerdown = (e) => {
      if (e.button !== 0) return;
      pointer = {
        start: point(e),
        original: { ...draft },
        mode:
          e.target.id === "crop-handle"
            ? "resize"
            : selection.contains(e.target)
              ? "move"
              : "new",
      };
      surface.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    surface.onpointermove = (e) => {
      if (!pointer) return;
      const p = point(e),
        o = pointer.original,
        dx = p.x - pointer.start.x,
        dy = p.y - pointer.start.y;
      if (pointer.mode === "move") draft = { ...o, x: o.x + dx, y: o.y + dy };
      else if (pointer.mode === "resize")
        draft = {
          ...o,
          w: bounded(o.w + dx, 1 / width, 1 - o.x),
          h: bounded(o.h + dy, 1 / height, 1 - o.y),
        };
      else
        draft = {
          x: Math.min(p.x, pointer.start.x),
          y: Math.min(p.y, pointer.start.y),
          w: Math.max(1 / width, Math.abs(dx)),
          h: Math.max(1 / height, Math.abs(dy)),
        };
      update();
    };
    surface.onpointerup = () => (pointer = null);
    surface.onpointercancel = () => (pointer = null);
    $$("[data-crop-preset]").forEach(
      (b) =>
        (b.onclick = () => {
          const k = b.dataset.cropPreset;
          draft =
            k === "left"
              ? { x: 0, y: 0, w: 0.5, h: 1 }
              : k === "right"
                ? { x: 0.5, y: 0, w: 0.5, h: 1 }
                : k === "chrome"
                  ? cropFromMargins({ top: 100, bottom: 48 }, width, height)
                  : { x: 0, y: 0, w: 1, h: 1 };
          update();
        }),
    );
    $("#crop-cancel").onclick = closeModal;
    $("#crop-apply").onclick = () => {
      window.dispatchEvent(new Event("latitude-checkpoint"));
      if (target) target.crop = draft;
      else {
        compositor.layout.crops[slot] = draft;
        for (const l of compositor.getLayers())
          if (l.type === "video" && l.source === slot)
            l.crop = structuredClone(draft);
      }
      config.compositions = structuredClone(compositor.documents);
      compositor.previous = null;
      saveLayout();
      closeModal();
      toast("Crop applied. Check the preview before recording.");
    };
  }
  async function layoutEditor() {
    const l = compositor.layout;
    modal(
      "Two views, one recording.",
      `<div class="modal-grid"><section class="modal-section"><h3>Screen A · primary view</h3><p>The main screen or window can include desktop sound.</p><div class="button-row"><button class="button" id="layout-source-a">Choose source A</button><button class="button" id="crop-a">Crop A</button></div><h3 class="spaced">Screen B · second view</h3><label>Picture source<select id="secondary-mode"><option value="same">Reuse A · crop a different area</option><option value="independent">Separate window or monitor</option></select></label><div class="button-row"><button class="button" id="layout-source-b">Choose source B</button><button class="button" id="crop-b">Crop B</button></div><p>Reusing A needs only one capture. B never duplicates desktop audio.</p></section><section class="modal-section"><h3>Arrange two views</h3><label>Arrangement<select id="split-axis"><option value="horizontal">Side by side</option><option value="vertical">Top and bottom</option></select></label><label>Space for view A <output id="split-value">${Math.round(l.split * 100)}%</output><input id="split-ratio" type="range" min="20" max="80" value="${l.split * 100}"></label><label>Gap · pixels<input id="split-gap" type="number" min="0" max="80" value="${l.gap}"></label><p>Apply this layout, then drag and resize either source directly in the preview. Each source has its own crop.</p><button class="button primary" id="show-split">Apply two-view layout</button></section></div><div class="modal-footer"><button class="button" id="layout-done">Done</button></div>`,
      "TWO-VIEW LAYOUT",
    );
    $("#secondary-mode").value = l.secondary;
    $("#split-axis").value = l.axis;
    $("#layout-source-a").onclick = attempt(() => chooseScreen("a"));
    $("#layout-source-b").onclick = attempt(() => chooseScreen("b"));
    for (const slot of ["a", "b"])
      $(`#crop-${slot}`).onclick = () =>
        cropEditor(
          slot,
          compositor
            .getLayers()
            .find((x) => x.type === "video" && x.source === slot),
        );
    $("#layout-source-b").disabled = l.secondary === "same" || engine.recording;
    $("#layout-source-a").disabled = engine.recording;
    $("#secondary-mode").onchange = (e) => {
      l.secondary = e.target.value;
      $("#layout-source-b").disabled =
        l.secondary === "same" || engine.recording;
      saveLayout();
    };
    $("#split-axis").onchange = (e) => (l.axis = e.target.value);
    $("#split-ratio").oninput = (e) => {
      l.split = Number(e.target.value) / 100;
      $("#split-value").textContent = `${e.target.value}%`;
    };
    $("#split-gap").onchange = (e) => {
      l.gap = bounded(e.target.value, 0, 80, 16);
      e.target.value = l.gap;
    };
    $("#show-split").onclick = () => {
      applyTemplate({ id: "custom", scene: "split", layout: l });
      closeModal();
    };
    $("#layout-done").onclick = closeModal;
  }
  async function cameraSetup() {
    const devices = await engine.devices();
    modal(
      "Camera is your choice.",
      `<label class="field">Camera device<select id="camera-device">${deviceOptions(devices, "videoinput", engine.streams.camera ? config.camera : "off", "Default camera")}</select></label><p>Only the picture is connected here. Your microphone stays on its own audio track.</p><div class="modal-footer"><button class="button" id="camera-layout">Crop & position</button><button class="button primary" id="connect-camera">Apply camera</button></div>`,
      "OPTIONAL FACECAM",
    );
    $("#camera-layout").onclick = () => {
      closeModal();
      toast("Click the camera in the preview to move, resize, or crop it.");
    };
    $("#connect-camera").onclick = attempt(async () => {
      const id = $("#camera-device").value;
      await engine.camera(id);
      config.camera = id;
      persist();
      if (id !== "off" && compositor.scene === "screen") setScene("present");
      closeModal();
      updateOverlay();
    });
  }
  $("#camera-source").onclick = attempt(cameraSetup);
  $("#layout-button").onclick = attempt(layoutEditor);
  $("#screen-b-source").onclick = () => {
    modal(
      "Where does view B come from?",
      `<div class="template-grid two"><button class="template-card" id="reuse-a"><h3>A different area of screen A</h3><p>Use one monitor for two views. Crop A and B independently, or start with left and right halves.</p></button><button class="template-card" id="new-b"><h3>A second window or monitor</h3><p>Choose another capture source. Its picture appears in Two views without duplicate audio.</p></button></div><div class="modal-footer"><button class="button" id="disconnect-b" ${engine.streams.screenB ? "" : "disabled"}>Disconnect separate source B</button></div>`,
      "SECOND VIEW",
    );
    $("#reuse-a").onclick = () => {
      compositor.layout.secondary = "same";
      saveLayout();
      setScene("split");
      closeModal();
      layoutEditor();
    };
    $("#new-b").onclick = attempt(() => chooseScreen("b"));
    $("#disconnect-b").onclick = () => {
      engine.remove("screenB");
      compositor.setScreen(null, "b");
      compositor.layout.secondary = "same";
      saveLayout();
      closeModal();
    };
  };
  function refreshThemeMenu() {
    $("#theme-select").innerHTML = themes()
      .map((t) => `<option value="${t.id}">${escape(t.name)}</option>`)
      .join("");
    $("#theme-select").value = config.theme;
  }
  $("#theme-select").onchange = (e) => applyTheme(e.target.value);
  $("#browse-themes").onclick = () => {
    modal("A different atmosphere.", themeChoices(), "APPEARANCE");
    bindThemes();
  };
  $("#import-pack").onclick = () => $("#pack-file").click();
  $("#pack-file").onchange = attempt(async (e) => {
    const file = e.target.files[0];
    try {
      if (!file) return;
      if (file.size > 12 * 1024 * 1024)
        throw Error("Packs must be smaller than 12 MB.");
      const candidate = validatePack(JSON.parse(await file.text()));
      modal(
        "Add this community pack?",
        `<p><strong>${escape(candidate.name)}</strong> contains ${candidate.themes.length} theme(s) and ${candidate.templates.length} layout(s).</p><p>It replaces your current community pack. Settings only: Latitude does not run code from packs.</p><div class="modal-footer"><button class="button primary" id="confirm-pack">Add pack</button></div>`,
        "THEMES & LAYOUTS",
      );
      $("#confirm-pack").onclick = attempt(async () => {
        await importAssets(candidate.assets);
        compositor.clearImageCache();
        const { assets, ...settings } = candidate;
        pack = settings;
        config.pack = settings;
        applyTheme(
          THEMES.some((t) => t.id === config.theme)
            ? config.theme
            : THEMES[0].id,
        );
        refreshThemeMenu();
        closeModal();
        toast(
          "Pack added. Find its themes in Settings and layouts in Templates.",
        );
      });
    } finally {
      e.target.value = "";
    }
  });
  $("#export-layout").onclick = attempt(async () => {
    const t = themes().find((t) => t.id === config.theme) || THEMES[0],
      data = {
        version: 1,
        name: "My Latitude studio",
        themes: [t],
        assets: await exportAssets({ current: compositor.getLayers() }),
        templates: [
          {
            name: "My layout",
            scene: compositor.scene,
            preset:
              config.preset[0] === "custom" ? "natural" : config.preset[0],
            note: "My saved composition and screen crops.",
            layout: compositor.layout,
            composition: compositor.getLayers(),
          },
        ],
      };
    if (window.take?.savePack) {
      if (await window.take.savePack(data))
        toast("Theme and layout pack saved.");
    } else {
      const a = document.createElement("a"),
        url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          }),
        );
      a.href = url;
      a.download = "Latitude-studio.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  applyTheme(config.theme || "signal");
  refreshThemeMenu();
  updateOverlay();
  return {
    onboard,
    cropEditor,
    layoutEditor,
    applyTheme,
    applyTemplate,
    updateOverlay,
  };
}
