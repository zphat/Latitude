import { icon, paintIcons } from "./icons.js";
import { PRESETS, gainToDb, clamp } from "../audio/dsp.js";
import { Compositor, SCENES } from "./compositor.js";
import { StudioEngine } from "./engine.js";
import { installStudioTools } from "./studio-tools.js";
import { layout } from "./design.js";
import { sceneDocuments, bitrateFor } from "./scene-model.js";
import { installSceneEditor } from "./scene-editor.js";
import { EXPORT_FORMATS } from "./export-formats.js";
import { mountExportControls } from "./export-ui.js";

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const read = () => {
  try {
    return JSON.parse(
      localStorage.getItem("latitude-v2") ||
        localStorage.getItem("take-studio-v1") ||
        "{}",
    );
  } catch {
    return {};
  }
};
const saved = read();
let config = {
  quality: "balanced",
  codec: "auto",
  previewMode: "balanced",
  reconnectMic: true,
  name: "Untitled session",
  preset: ["natural", "natural"],
  width: 1920,
  height: 1080,
  fps: 30,
  countdown: true,
  target: -16,
  normalize: true,
  editorClips: false,
  format: "mp4",
  separateTracks: true,
  editingFiles: true,
  autoExport: true,
  hotkeys: true,
  mic1: "",
  mic2: "off",
  camera: "",
  desktop: "system",
  output: "",
  noise: [false, false],
  profiles: {},
  appearance: {},
  ...saved,
};
if (!EXPORT_FORMATS.some((f) => f.id === config.format)) config.format = "mp4";
config.profiles ??= {};
if (!Array.isArray(config.noise)) config.noise = [false, false];
if (!Array.isArray(config.preset)) config.preset = ["natural", "natural"];
config.appearance ??= {};
let selectedVoice = 0,
  info = {},
  sourceState = {},
  lastMeters = null,
  exporting = false,
  checking = null,
  countdownToken = 0,
  starting = false,
  clipWarningAt = -Infinity;
let quitting = false;
const clippedInputs = [false, false];
let shortcutFailures = [];
let lastSavedId = null;
const compositor = new Compositor($("#preview"));
const engine = new StudioEngine($("#preview"), compositor);
for (let i = 0; i < 2; i++)
  engine.setVoice(i, {
    ...PRESETS[config.preset[i] || "natural"],
    ...saved.voices?.[i],
    mute: false,
  });
engine.setDesktop({ ...saved.desktopSettings, mute: false });
engine.setMaster({ ...saved.masterSettings, mute: false });
Object.assign(compositor, config.appearance);
compositor.layout = layout(config.layout);
compositor.scene = ["present", "camera", "split", "screen", "break"].includes(
  config.scene,
)
  ? config.scene
  : "screen";
compositor.documents = sceneDocuments(
  config.compositions,
  compositor.layout,
  compositor,
);
let persistTimer;
const savePreferences = () => {
  config.voices = engine.voiceSettings;
  config.desktopSettings = engine.desktopSettings;
  config.masterSettings = engine.masterSettings;
  try {
    localStorage.setItem("latitude-v2", JSON.stringify(config));
  } catch {
    toast("Preferences could not be saved. Check available disk space.", true);
  }
};
const persist = () => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(savePreferences, 150);
};
const formatTime = (secs) => {
  const n = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(n / 3600)).padStart(2, "0")}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};
function toast(message, error = false) {
  if (error && $("#modal").open) {
    let notice = $("#modal-content .modal-error");
    if (!notice) {
      notice = document.createElement("p");
      notice.className = "notice modal-error";
      notice.setAttribute("role", "alert");
      $("#modal-content").prepend(notice);
    }
    notice.textContent = message;
    return;
  }
  while ($("#toasts").children.length >= 2)
    $("#toasts").firstElementChild.remove();
  const el = document.createElement("div");
  el.className = `toast${error ? " error" : ""}`;
  const span = document.createElement("span");
  span.textContent = message;
  el.append(span);
  const b = document.createElement("button");
  b.textContent = "×";
  b.ariaLabel = "Dismiss notification";
  b.onclick = () => el.remove();
  el.append(b);
  $("#toasts").append(el);
  setTimeout(() => el.remove(), error ? 12000 : 4000);
}
const attempt =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      toast(e.message || String(e), true);
    }
  };
function modal(title, body, eyebrow = "LATITUDE") {
  $("#modal-title").textContent = title;
  $("#modal-content").innerHTML = body;
  $("#modal-eyebrow").textContent = eyebrow;
  paintIcons($("#modal"));
  if (!$("#modal").open) $("#modal").showModal();
}
const closeModal = () => $("#modal").close();
$("#close-modal").onclick = closeModal;
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = $("#modal").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
function view(name) {
  compositor.visible = name === "studio" && !document.hidden;
  compositor.invalidate();
  $("#workspace").scrollTop = 0;
  $$(".page").forEach((el) =>
    el.classList.toggle("active", el.id === `page-${name}`),
  );
  $$(".nav-button").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name),
  );
  $("#inspector").style.display = name === "studio" ? "" : "none";
  if (name === "recordings") loadTakes();
}
$$("[data-view]").forEach((b) => (b.onclick = () => view(b.dataset.view)));
$("#go-soundcheck").onclick = () => view("soundcheck");
$("#session-name").value = config.name;
$("#session-name").oninput = (e) => {
  config.name = e.target.value;
  persist();
};

function renderScenes() {
  $("#scene-list").innerHTML = SCENES.map(
    (s) =>
      `<button class="scene-card ${s.id === compositor.scene ? "active" : ""}" data-scene="${s.id}" aria-pressed="${s.id === compositor.scene}"><span class="scene-icon">${icon(s.icon)}</span><span>${s.name}</span><kbd>${s.key}</kbd></button>`,
  ).join("");
  $$("[data-scene]").forEach(
    (b) => (b.onclick = () => setScene(b.dataset.scene)),
  );
}
function setScene(scene) {
  compositor.setScene(scene);
  config.scene = scene;
  persist();
  window.dispatchEvent(new Event("latitude-layout"));
  $("#scene-label").textContent = SCENES.find((s) => s.id === scene)?.name;
  renderScenes();
  refreshSources(engine.sourceState());
  engine.sceneEvent(scene).catch((e) => toast(e.message, true));
}
$("#transition").value = compositor.transition;
$("#transition").onchange = (e) => {
  compositor.transition = e.target.value;
  config.appearance.transition = e.target.value;
  persist();
};
$("#fullscreen-preview").onclick = attempt(async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await $("#preview-frame").requestFullscreen();
});

const mixerIds = ["voice1", "voice2", "desktop", "mix"];
function renderMixer() {
  const items = [
    { name: "Voice 1", icon: "mic", id: "voice1", track: "ISO 1" },
    { name: "Voice 2", icon: "mic", id: "voice2", track: "ISO 2" },
    { name: "Desktop", icon: "speaker", id: "desktop", track: "ISO 3" },
    { name: "Full mix", icon: "wave", id: "mix", track: "MASTER" },
  ];
  $("#mixer").innerHTML = items
    .map(
      (x, i) =>
        `<div class="mixer-card ${i === selectedVoice ? "selected" : ""} ${i === 3 ? "master-card" : ""}" data-mixer="${i}"><div class="mixer-title"><button data-select-channel="${i}" title="${i < 2 ? "Edit voice processing" : "Audio routing"}">${icon(x.icon)}${x.name}</button><span class="track-label">${x.track}</span></div><div class="mixer-device" id="device-${x.id}">${i === 3 ? "Final limiter · −1.5 dBFS" : "Not connected"}</div><div class="level-track"><div class="level-fill" id="level-${x.id}"></div><div class="level-grid"></div></div><div class="mixer-db"><span id="peak-${x.id}">−∞ dBFS</span><b id="status-${x.id}">${i === 3 ? "Protected" : "No signal"}</b></div><div class="mixer-bottom"><button class="mute-button" data-mute="${i}" title="Mute ${x.name}" aria-label="Mute ${x.name}" aria-pressed="false">M</button><input type="range" min="-24" max="${i < 2 ? "24" : "6"}" step="0.5" data-gain="${i}" aria-label="${x.name} gain"><span class="gain-value" id="gain-${x.id}">0 dB</span></div></div>`,
    )
    .join("");
  $$("[data-select-channel]").forEach(
    (b) =>
      (b.onclick = () =>
        Number(b.dataset.selectChannel) < 2
          ? selectVoice(Number(b.dataset.selectChannel))
          : audioSetup()),
  );
  $$("[data-mute]").forEach(
    (b) => (b.onclick = () => toggleMute(Number(b.dataset.mute))),
  );
  $$("[data-gain]").forEach(
    (input) =>
      (input.oninput = () => {
        const i = Number(input.dataset.gain),
          gain = Number(input.value);
        if (i < 2) engine.setVoice(i, { gain });
        else if (i === 2) engine.setDesktop({ gain });
        else engine.setMaster({ gain });
        syncMixer();
        persistProfile(i);
      }),
  );
  syncMixer();
  refreshSources(sourceState);
}
function syncMixer() {
  [
    ...engine.voiceSettings,
    engine.desktopSettings,
    engine.masterSettings,
  ].forEach((p, i) => {
    const input = $(`[data-gain="${i}"]`);
    if (input) input.value = p.gain;
    const o = $(`#gain-${mixerIds[i]}`);
    if (o) o.textContent = `${p.gain > 0 ? "+" : ""}${p.gain} dB`;
    const b = $(`[data-mute="${i}"]`);
    if (b) {
      b.classList.toggle("muted", !!p.mute);
      b.ariaPressed = String(!!p.mute);
      b.title = `${p.mute ? "Unmute" : "Mute"} ${mixerIds[i]}`;
    }
  });
}
let muteSnapshot = null;
$("#mute-all").onclick = () => {
  if (!muteSnapshot) {
    muteSnapshot = [...engine.voiceSettings, engine.desktopSettings].map(
      (p) => !!p.mute,
    );
    engine.setVoice(0, { mute: true });
    engine.setVoice(1, { mute: true });
    engine.setDesktop({ mute: true });
    $("#mute-all").textContent = "Restore audio";
    $("#mute-all").classList.add("muted");
  } else {
    engine.setVoice(0, { mute: muteSnapshot[0] });
    engine.setVoice(1, { mute: muteSnapshot[1] });
    engine.setDesktop({ mute: muteSnapshot[2] });
    muteSnapshot = null;
    $("#mute-all").textContent = "Mute all";
    $("#mute-all").classList.remove("muted");
  }
  syncMixer();
};
function toggleMute(i) {
  const p =
    i < 2
      ? engine.voiceSettings[i]
      : i === 2
        ? engine.desktopSettings
        : engine.masterSettings;
  if (i < 2) engine.setVoice(i, { mute: !p.mute });
  else if (i === 2) engine.setDesktop({ mute: !p.mute });
  else {
    engine.setMaster({ mute: !p.mute });
    if (p.mute)
      toast(
        "Full mix muted. Isolated source tracks still record. Use Mute all to silence every source.",
      );
  }
  syncMixer();
}
const profileFor = (id, channel = "left") =>
  config.profiles[`${id || "default"}::${channel}`] ||
  config.profiles[id || "default"];
function persistProfile(i = selectedVoice) {
  if (i < 2) {
    const key = `${config[`mic${i + 1}`] || "default"}::${engine.voiceSettings[i].channel || "left"}`;
    config.profiles[key] = {
      settings: { ...engine.voiceSettings[i], mute: false },
      preset: config.preset[i],
    };
  }
  persist();
}
const modules = [
  {
    name: "Clean up",
    summary: "Rumble + room",
    params: [
      ["highpass", "Low cut", 30, 180, 1, " Hz"],
      ["gate", "Noise threshold", -75, -25, 1, " dB"],
      ["gateDepth", "Quiet-gap reduction", 0, 30, 1, " dB"],
    ],
    note: "A gentle downward expander. It reduces room sound between phrases; it does not remove noise underneath speech.",
  },
  {
    name: "Shape the tone",
    summary: "4-band EQ",
    params: [
      ["body", "Body · 120 Hz", -6, 6, 0.5, " dB"],
      ["mud", "Boxiness · 280 Hz", -8, 4, 0.5, " dB"],
      ["presence", "Presence · 3 kHz", -6, 6, 0.5, " dB"],
      ["air", "Air · 9.5 kHz", -6, 5, 0.5, " dB"],
    ],
  },
  {
    name: "Even things out",
    summary: "Soft-knee compressor",
    params: [
      ["threshold", "Threshold", -40, -6, 1, " dB"],
      ["ratio", "Ratio", 1, 6, 0.1, ":1"],
      ["attack", "Attack", 2, 40, 1, " ms"],
      ["release", "Release", 60, 400, 10, " ms"],
      ["makeup", "Makeup gain", -3, 9, 0.5, " dB"],
    ],
    note: "Look for a few dB of gain reduction on louder phrases. More compression is not always better.",
  },
  {
    name: "Tame sharp S sounds",
    summary: "Split-band de-esser",
    params: [["deess", "Maximum reduction", 0, 8, 0.5, " dB"]],
  },
  {
    name: "Catch the peaks",
    summary: "Always on · −1.5 dBFS",
    params: [],
    note: "5 ms lookahead on each source and the mix. The final loudness pass also measures true peaks. Hardware distortion cannot be repaired here.",
  },
];
function renderProcessing() {
  const p = engine.voiceSettings[selectedVoice];
  $("#clarity-bypass").textContent = p.clarityBypass
    ? "Clarity off"
    : "Clarity on";
  $("#clarity-bypass").ariaPressed = String(!p.clarityBypass);
  $("#voice-preset").innerHTML =
    Object.entries(PRESETS)
      .map(([id, p]) => `<option value="${id}">${p.name}</option>`)
      .join("") + '<option value="custom">Custom settings</option>';
  $("#voice-preset").value = config.preset[selectedVoice] || "custom";
  $("#preset-note").textContent =
    PRESETS[config.preset[selectedVoice]]?.note ||
    "Your own balance. Saved for this input device.";
  $("#processing-chain").innerHTML = modules
    .map(
      (m, i) =>
        `<details class="processor"><summary><span class="module-number">0${i + 1}</span><i class="module-dot"></i>${m.name}<span class="module-summary">${i === 2 ? `<span id="compressor-gr">0.0 dB GR</span>` : m.summary}</span></summary><div class="processor-body">${m.params.map(([key, label, min, max, step, unit]) => `<div class="param"><label for="param-${key}">${label}<output id="value-${key}">${p[key]}${unit}</output></label><input id="param-${key}" data-param="${key}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${p[key]}" type="range"></div>`).join("")}${m.note ? `<p>${m.note}</p>` : ""}</div></details>`,
    )
    .join("");
  $$("[data-param]").forEach(
    (input) =>
      (input.oninput = () => {
        const k = input.dataset.param,
          v = Number(input.value);
        engine.setVoice(selectedVoice, { [k]: v });
        $(`#value-${k}`).textContent = v + input.dataset.unit;
        config.preset[selectedVoice] = "custom";
        $("#voice-preset").value = "custom";
        $("#preset-note").textContent =
          "Your own balance. Saved for this input device.";
        persistProfile();
      }),
  );
  $("#polish").value = p.polish;
  $("#polish-value").textContent = `${p.polish}%`;
  $("#bypass-button").textContent = p.bypass ? "Enable chain" : "Bypass";
  $("#bypass-button").ariaPressed = String(!!p.bypass);
  $("#processing-chain").classList.toggle("bypassed", !!p.bypass);
}
function selectVoice(index) {
  window.dispatchEvent(
    new CustomEvent("latitude-inspector", { detail: "voice" }),
  );
  selectedVoice = index;
  $$("[data-voice]").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.voice) === index),
  );
  $$("[data-mixer]").forEach((c) =>
    c.classList.toggle("selected", Number(c.dataset.mixer) === index),
  );
  renderProcessing();
}
$$("[data-voice]").forEach(
  (b) => (b.onclick = () => selectVoice(Number(b.dataset.voice))),
);
$("#voice-preset").onchange = (e) => {
  if (e.target.value === "custom") return;
  config.preset[selectedVoice] = e.target.value;
  engine.setVoice(selectedVoice, {
    ...PRESETS[e.target.value],
    gain: engine.voiceSettings[selectedVoice].gain,
  });
  renderProcessing();
  syncMixer();
  persistProfile();
};
$("#bypass-button").onclick = () => {
  engine.setVoice(selectedVoice, {
    bypass: !engine.voiceSettings[selectedVoice].bypass,
  });
  renderProcessing();
  persistProfile();
};
$("#clarity-bypass").onclick = () => {
  engine.setVoice(selectedVoice, {
    clarityBypass: !engine.voiceSettings[selectedVoice].clarityBypass,
  });
  renderProcessing();
  persistProfile();
};
$("#polish").oninput = (e) => {
  engine.setVoice(selectedVoice, { polish: Number(e.target.value) });
  $("#polish-value").textContent = `${e.target.value}%`;
  config.preset[selectedVoice] = "custom";
  $("#voice-preset").value = "custom";
  persistProfile();
};

function refreshSources(s) {
  sourceState = s || {};
  s = sourceState;
  $("#screen-b-state").textContent =
    compositor.layout.secondary === "same"
      ? "From A"
      : s.screenB
        ? "Connected"
        : "Not connected";
  $("#screen-state").textContent = s.screen ? "Connected" : "Not connected";
  $("#camera-state").textContent = s.camera ? "Connected" : "Off";
  $("#screen-state").classList.toggle("on", !!s.screen);
  $("#camera-state").classList.toggle("on", !!s.camera);
  $("#empty-preview").hidden =
    !!s.screen ||
    !!s.screenB ||
    !!s.camera ||
    compositor.getLayers().some((l) => l.visible && l.type !== "video");
  $("#preview-dot").classList.toggle("on", !!s.screen || !!s.camera);
  $("#capture-status").textContent = Object.values(s).filter(Boolean).length
    ? `${Object.values(s).filter(Boolean).length} sources connected`
    : "No sources connected";
  for (const [key, id] of [
    ["mic1", "voice1"],
    ["mic2", "voice2"],
    ["desktop", "desktop"],
  ]) {
    const el = $(`#device-${id}`);
    if (el)
      el.textContent = s[key]
        ? engine.streams[key].getAudioTracks()[0]?.label || "Connected"
        : key === "mic2"
          ? "Optional second voice"
          : "Not connected";
  }
  if (engine.ctx) {
    $("#engine-status").textContent =
      `48 kHz · Audio engine ${engine.ctx.state === "running" ? "active" : engine.ctx.state}`;
    $("#engine-dot").classList.toggle("on", engine.ctx.state === "running");
  }
}
engine.addEventListener("sources", (e) => refreshSources(e.detail));
window.addEventListener("latitude-content", () =>
  refreshSources(engine.sourceState()),
);
engine.addEventListener("error", (e) => toast(e.detail, true));
engine.addEventListener("meters", ({ detail: m }) => {
  lastMeters = m;
  for (let i = 0; i < 2; i++) clippedInputs[i] ||= m.clips[i] > 0;
  if (document.hidden && !checking) return;
  for (let i = 0; i < 4; i++) {
    const db = gainToDb(m.peaks[i]),
      p = $(`#peak-${mixerIds[i]}`);
    $(`#level-${mixerIds[i]}`).style.width =
      `${clamp(((db + 60) / 60) * 100, 0, 100)}%`;
    p.textContent = db < -70 ? "−∞ dBFS" : `${db.toFixed(1)} dBFS`;
    const status = $(`#status-${mixerIds[i]}`);
    if (i < 2) {
      const input = gainToDb(m.inputPeaks[i]);
      status.textContent = clippedInputs[i]
        ? "INPUT CLIP"
        : input > -6
          ? "Input hot"
          : sourceState[`mic${i + 1}`]
            ? "Input ready"
            : "No signal";
      status.classList.toggle("level-warning", clippedInputs[i] || input > -6);
    } else if (i === 3)
      status.textContent =
        m.limiting > 0.1 ? `${m.limiting.toFixed(1)} dB limiting` : "Protected";
    else
      status.textContent = engine.desktopSettings.duck
        ? "Ducks in mix"
        : sourceState.desktop
          ? "Stereo"
          : "No signal";
  }
  const gr = $("#compressor-gr");
  if (gr) gr.textContent = `${m.reduction[selectedVoice].toFixed(1)} dB GR`;
  if (m.clips.some((n) => n > 0) && performance.now() - clipWarningAt > 18000) {
    clipWarningAt = performance.now();
    toast(
      "Raw microphone input is clipping. Turn down the mic or interface gain; the software limiter cannot repair that distortion.",
      true,
    );
  }
  $("#check-level").style.width =
    `${clamp(((gainToDb(m.inputPeaks[Number($("#check-input").value)]) + 60) / 60) * 100, 0, 100)}%`;
  if (checking) {
    const idx = checking.index,
      t = (performance.now() - checking.started) / 1000;
    (t < 3 ? checking.noise : checking.speech).push({
      rms: m.inputRms[idx],
      peak: m.inputPeaks[idx],
      clips: m.clips[idx],
    });
  }
});

async function chooseScreen(slot = "a") {
  if (typeof slot !== "string") slot = "a";
  if (engine.recording || engine.finishing)
    throw Error("Choose capture sources between takes.");
  if (!window.take) {
    await engine.screen(null, config.desktop, slot);
    return;
  }
  modal(
    `Choose screen ${slot.toUpperCase()} or a window`,
    "<p>Finding screens and windows…</p>",
    "SCREEN CAPTURE",
  );
  const sources = await window.take.sources();
  $("#modal-content").innerHTML =
    `<div class="source-grid">${sources.map((s) => `<button class="source-option" data-source="${escape(s.id)}">${s.thumbnail ? `<img alt="" src="${escape(s.thumbnail)}">` : `<span class="portal-picker-icon">${icon("monitor")}</span>`}<span>${escape(s.name)}</span></button>`).join("")}</div><p class="notice">${window.take?.platform === "linux" ? "Your desktop controls screen-sharing permission. Desktop sound captures the output selected in Inputs & outputs, including other apps playing through it. Choose Screen B separately for two sources." : "System audio captures Windows playback from the default output, including sounds from other apps. Choose a loopback input in Inputs & outputs for a separately routed device."}</p><div class="modal-footer"><button class="button" id="disconnect-screen" ${engine.streams[slot === "b" ? "screenB" : "screen"] ? "" : "disabled"}>Disconnect screen ${slot.toUpperCase()}</button></div>`;
  $("#disconnect-screen").onclick = () => {
    engine.remove(slot === "b" ? "screenB" : "screen");
    compositor.setScreen(null, slot);
    if (slot === "a" && engine.desktopMode === "system" && window.take?.platform !== "linux")
      engine.remove("desktop");
    closeModal();
    refreshSources(engine.sourceState());
  };
  $$("[data-source]").forEach(
    (b) =>
      (b.onclick = attempt(async () => {
        b.disabled = true;
        try {
          await engine.screen(b.dataset.source, config.desktop, slot);
          if (slot === "b") {
            compositor.layout.secondary = "independent";
            config.layout = compositor.layout;
            persist();
            setScene("split");
          }
          closeModal();
          refreshSources(engine.sourceState());
          toast(
            slot === "a"
              ? "Screen A connected. Use Crop to trim exactly what appears."
              : "Screen B connected. No duplicate desktop audio is added.",
          );
        } finally {
          b.disabled = false;
        }
      })),
  );
}
$("#choose-screen-main").onclick = attempt(chooseScreen);
$("#screen-source").onclick = attempt(chooseScreen);
function deviceOptions(
  devices,
  kind,
  selected,
  defaultOption = "System default",
  includeOff = true,
) {
  let out = includeOff
    ? `<option value="off" ${selected === "off" ? "selected" : ""}>Off</option>`
    : "";
  if (defaultOption)
    out += `<option value="" ${selected === "" ? "selected" : ""}>${defaultOption}</option>`;
  let n = 0;
  return (
    out +
    devices
      .filter(
        (d) =>
          d.kind === kind &&
          !d.label.startsWith("latitude_desktop_") &&
          d.deviceId !== "default" &&
          d.deviceId !== "communications",
      )
      .map(
        (d) =>
          `<option value="${escape(d.deviceId)}" ${d.deviceId === selected ? "selected" : ""}>${escape(d.label || `${kind === "videoinput" ? "Camera" : "Audio device"} ${++n}`)}</option>`,
      )
      .join("")
  );
}
async function audioSetup() {
  const devices = await engine.devices();
  let linuxOutputs = [], outputError = "";
  if (window.take?.platform === "linux") {
    try { linuxOutputs = await window.take.audioOutputs(); }
    catch { outputError = "Desktop sound is unavailable. Check that PipeWire/PulseAudio is running. Microphone recording still works."; }
  }
  let desktopOptions = `<option value="system" ${config.desktop === "system" ? "selected" : ""}>System playback · default output</option>`;
  desktopOptions += linuxOutputs.map(o => `<option value="linux:${escape(o.name)}" ${config.desktop === `linux:${o.name}` ? "selected" : ""}>Output: ${escape(o.description)}${o.isDefault ? " (default)" : ""}</option>`).join("");
  if (config.desktop.startsWith("linux:") && !linuxOutputs.some(o => config.desktop === `linux:${o.name}`))
    desktopOptions += `<option value="${escape(config.desktop)}" selected>Saved output unavailable · choose another</option>`;
  desktopOptions += deviceOptions(devices, "audioinput", config.desktop, null);
  modal(
    "Your inputs. Your outputs.",
    `<div class="modal-grid">${[0, 1].map((i) => `<section class="modal-section"><h3>Voice ${i + 1} <span class="tag">Separate mono track</span></h3><label>Microphone / interface<select id="setup-mic${i + 1}">${deviceOptions(devices, "audioinput", config[`mic${i + 1}`])}</select></label><label>Input channel<select id="setup-channel${i}"><option value="left">Left / mono</option><option value="right">Right</option><option value="mix">Blend left + right</option></select></label><label>Audio delay · milliseconds<input id="setup-delay${i}" type="number" min="0" max="500" step="1" value="${engine.voiceSettings[i].syncMs || 0}"></label><label class="toggle-row"><span>Browser noise suppression</span><input type="checkbox" id="setup-noise${i}" ${config.noise[i] ? "checked" : ""}></label><p>Leave suppression off for the cleanest source. It can help a noisy room, but may affect voice detail.</p></section>`).join("")}<section class="modal-section"><h3>Desktop sound</h3><label>Capture from<select id="setup-desktop">${desktopOptions}</select></label>${outputError ? `<p class="notice">${escape(outputError)}</p>` : window.take?.platform === "linux" ? `<p>Captures everything playing through this output. If you change speakers or headphones, reconnect here. Screen sharing and desktop sound can be connected independently.</p>` : ""}<label>Desktop delay · milliseconds<input id="setup-desktop-delay" type="number" min="0" max="500" value="${engine.desktopSettings.syncMs || 0}"></label><label class="toggle-row"><span>Lower desktop sound while speaking</span><input type="checkbox" id="setup-duck" ${engine.desktopSettings.duck ? "checked" : ""}></label><p>Ducking only affects the full mix. The isolated Desktop track keeps its own level.</p></section><section class="modal-section"><h3>Headphones / monitoring</h3><label>Listen through<select id="setup-output">${deviceOptions(devices, "audiooutput", config.output, "System default", false)}</select></label><button class="button" id="monitor-button"><span data-icon="headphones"></span> ${engine.monitored ? "Stop listening" : "Listen to microphones"}</button><p>Use headphones. Monitoring automatically stops when recording system audio to prevent your voice being captured twice. Interface direct monitoring avoids this.</p></section></div><div class="notice">If device names are hidden, connect the default microphone once, then reopen this panel. Device choices and voice settings are remembered. New devices start with Natural voice.</div><div class="modal-footer"><button class="button primary" id="apply-devices">Connect selected devices <span data-icon="arrow"></span></button></div>`,
    "AUDIO ROUTING",
  );
  for (let i = 0; i < 2; i++) {
    $(`#setup-channel${i}`).value = engine.voiceSettings[i].channel;
    $(`#setup-mic${i + 1}`).onchange = (e) => {
      const profile = profileFor(e.target.value, $(`#setup-channel${i}`).value);
      if (profile) {
        $(`#setup-channel${i}`).value = profile.settings.channel || "left";
        $(`#setup-delay${i}`).value = profile.settings.syncMs || 0;
      }
    };
  }
  $("#monitor-button").onclick = attempt(async () => {
    await engine.output($("#setup-output").value);
    await engine.listen(!engine.monitored);
    $("#monitor-button").innerHTML =
      icon("headphones") +
      (engine.monitored ? "Stop listening" : "Listen to microphones");
  });
  $("#apply-devices").onclick = attempt(async () => {
    const button = $("#apply-devices");
    button.disabled = true;
    button.textContent = "Connecting…";
    try {
      if (
        $("#setup-mic1").value !== "off" &&
        $("#setup-mic1").value === $("#setup-mic2").value &&
        $("#setup-channel0").value === $("#setup-channel1").value
      )
        throw Error(
          "Both voices are assigned to the same device and channel. Choose left for one voice and right for the other, or use different devices.",
        );
      for (let i = 0; i < 2; i++) {
        const id = $(`#setup-mic${i + 1}`).value,
          noise = $(`#setup-noise${i}`).checked,
          channel = $(`#setup-channel${i}`).value,
          changed = id !== config[`mic${i + 1}`],
          channelChanged = channel !== engine.voiceSettings[i].channel;
        if (
          changed ||
          !engine.streams[`mic${i + 1}`] ||
          noise !== config.noise[i]
        )
          await engine.mic(i, id, noise);
        config[`mic${i + 1}`] = id;
        config.noise[i] = noise;
        if ((changed || channelChanged) && id !== "off") {
          const p = profileFor(id, channel);
          config.preset[i] = p?.preset || "natural";
          engine.setVoice(i, {
            ...(p?.settings || PRESETS.natural),
            mute: false,
          });
        }
        engine.setVoice(i, {
          channel: $(`#setup-channel${i}`).value,
          syncMs: clamp(Number($(`#setup-delay${i}`).value) || 0, 0, 500),
        });
        persistProfile(i);
      }
      const desktop = $("#setup-desktop").value;
      if (window.take?.platform === "linux" && (desktop === "system" || desktop.startsWith("linux:"))) {
        // Explicit reconnect also refreshes what the system-default output points to.
        if (desktop === "system") engine.remove("desktop");
        await engine.linuxDesktopInput(desktop);
      } else {
        if (desktop !== "system" && (desktop !== config.desktop || !engine.streams.desktop))
          await engine.desktopInput(desktop);
        if (desktop === "system" && (config.desktop !== "system" || !engine.streams.desktop)) {
          const tracks = engine.streams.screen?.getAudioTracks().filter(t => t.readyState === "live");
          if (tracks?.length) await engine.attach("desktop", new MediaStream(tracks), 2);
          else { engine.remove("desktop"); toast("Choose your screen again to enable system audio."); }
          engine.desktopMode = "system";
        }
      }
      config.desktop = desktop;
      engine.setDesktop({
        duck: $("#setup-duck").checked,
        syncMs: clamp(Number($("#setup-desktop-delay").value) || 0, 0, 500),
      });
      config.output = $("#setup-output").value;
      await engine.output(config.output);
      persist();
      renderProcessing();
      syncMixer();
      closeModal();
      refreshSources(engine.sourceState());
      toast(
        "Audio inputs are connected. Speak normally and watch your input level.",
      );
    } finally {
      button.disabled = false;
      button.textContent = "Connect selected devices";
    }
  });
}
$("#audio-setup").onclick = attempt(audioSetup);
$("#check-setup").onclick = attempt(audioSetup);

$("#scene-settings").onclick = () => {
  modal(
    "A smooth change of scene.",
    `<label class="field">Transition length · milliseconds<input type="number" min="100" max="1500" step="50" id="scene-duration" value="${compositor.duration}"></label><p>Add titles with Add source → Text. Select text in the preview to edit its color, gradient, size, and position.</p><div class="modal-footer"><button class="button primary" id="save-scene">Save transition</button></div>`,
    "SCENE TRANSITIONS",
  );
  $("#save-scene").onclick = () => {
    compositor.duration = clamp(
      Number($("#scene-duration").value) || 350,
      100,
      1500,
    );
    config.appearance.duration = compositor.duration;
    persist();
    closeModal();
  };
};

async function record() {
  if (engine.starting) return;
  if (exporting) {
    toast("Finish or cancel the export in Takes before recording.");
    view("recordings");
    return;
  }
  if (starting) {
    countdownToken++;
    starting = false;
    $("#countdown").hidden = true;
    $("#record-label").textContent = "Start recording";
    return;
  }
  if (engine.finishing) return;
  if (engine.recording) {
    await engine.stop();
    return;
  }
  if (!window.take) {
    toast(
      "This is the browser preview. Open the desktop application to record and save files.",
      true,
    );
    return;
  }
  const s = engine.sourceState(),
    graphics = compositor
      .getLayers()
      .some((l) => l.visible && l.type !== "video");
  if (!Object.values(s).some(Boolean) && !graphics) {
    await audioSetup();
    toast("Connect at least one source to start a take.");
    return;
  }
  if (
    !graphics &&
    !s.screen &&
    !s.screenB &&
    s.camera &&
    ["screen", "present", "split"].includes(compositor.scene)
  )
    setScene("camera");
  else if (!graphics && s.screen && !s.camera && compositor.scene === "camera")
    setScene("screen");
  else if (!s.screen && !s.screenB && !s.camera && !graphics) setScene("break");
  refreshSources(s);
  starting = true;
  const token = ++countdownToken;
  try {
    if (config.countdown) {
      $("#record-label").textContent = "Cancel countdown";
      $("#countdown").hidden = false;
      for (let n = 3; n > 0; n--) {
        $("#countdown").textContent = n;
        await new Promise((r) => setTimeout(r, 1000));
        if (token !== countdownToken) return;
      }
      $("#countdown").hidden = true;
    }
    $("#record-button").disabled = true;
    await engine.start({
      name: config.name,
      width: config.width,
      height: config.height,
      fps: config.fps,
      bitrate: bitrateFor(config.height, config.fps, config.quality),
      quality: config.quality,
      codec: config.codec,
    });
  } finally {
    starting = false;
    $("#countdown").hidden = true;
    $("#record-button").disabled = false;
    if (!engine.recording) $("#record-label").textContent = "Start recording";
  }
}
$("#record-button").onclick = attempt(record);
$("#pause-button").onclick = () => engine.pause();
$("#marker-button").onclick = attempt(() => engine.marker("Edit point"));
engine.addEventListener("marker", ({ detail: m }) =>
  toast(`Marker added at ${formatTime(m.time)}.`),
);
engine.addEventListener("recording", ({ detail: on }) => {
  document.body.classList.toggle("recording-mode", on);
  $("#record-button").classList.toggle("recording", on);
  $("#record-label").textContent = on ? "Stop recording" : "Start recording";
  $("#record-button").disabled = false;
  $("#marker-button").disabled = !on;
  $("#pause-button").disabled = !on;
  $("#pause-label").textContent = "Pause";
  $("#preview-title").textContent = "Scene preview";
  $("#recording-indicator").hidden = !on;
  $("#preview-dot").classList.toggle("record", on);
  $("#record-state").textContent = on
    ? "RECORDING · ALL TRACKS"
    : "READY WHEN YOU ARE";
  for (const id of [
    "#audio-setup",
    "#screen-source",
    "#screen-b-source",
    "#camera-source",
    "#templates-button",
    "#reopen-onboarding",
    "#import-pack",
    "#video-size",
    "#video-fps",
    "#video-quality",
    "#video-codec",
    "#preview-quality",
    "#choose-folder",
  ])
    $(id).disabled = on;
  $("#storage-status").textContent = on
    ? "Writing directly to disk"
    : "Local recording · no account needed";
});
engine.addEventListener("paused", ({ detail: paused }) => {
  $("#pause-label").textContent = paused ? "Resume" : "Pause";
  $("#record-state").textContent = paused
    ? "PAUSED · NOT RECORDING"
    : "RECORDING · ALL TRACKS";
  $("#preview-title").textContent = paused
    ? "Recording paused"
    : "Scene preview";
  $("#recording-indicator").hidden = paused;
});
engine.addEventListener("saving", () => {
  $("#record-label").textContent = "Saving take…";
  $("#record-button").disabled = true;
  $("#record-state").textContent = "FINISHING";
});
engine.addEventListener("saved", async ({ detail: s }) => {
  lastSavedId = s.id;
  toast(
    s.status === "interrupted"
      ? "Take saved with an interruption. Check it in Takes before using it."
      : "Take saved. Your original tracks are safe.",
    s.status === "interrupted",
  );
  view("recordings");
  if (
    !quitting &&
    s.status !== "interrupted" &&
    config.autoExport &&
    info.encoder
  )
    await doExport(s.id);
});
setInterval(() => {
  if (document.hidden) return;
  $("#timer").textContent = formatTime(engine.time());
  $("#preview-timer").textContent = formatTime(engine.time());
  const f = $("#actual-fps");
  f.textContent = engine.recording
    ? `${Math.round(compositor.measuredFps)} / ${config.fps} fps`
    : sourceState.screen || sourceState.camera
      ? `${Math.round(compositor.measuredFps)} preview fps`
      : "Preview";
  f.style.color =
    engine.recording && compositor.measuredFps < config.fps * 0.85
      ? "var(--amber)"
      : "";
  f.title =
    "Compositor frame rate. Encoder or capture-device limits can lower the frame rate in the saved file.";
}, 300);

async function loadTakes() {
  const container = $("#takes-list");
  if (!window.take) {
    container.innerHTML = `<div class="takes-empty"><span>${icon("folder")}</span><h2>Your takes belong to you.</h2><p>The desktop app saves recordings and isolated audio tracks to your computer.</p><button class="button" id="empty-studio">Back to studio</button></div>`;
    $("#empty-studio").onclick = () => view("studio");
    return;
  }
  try {
    const sessions = await window.take.sessions();
    if (!sessions.length) {
      container.innerHTML = `<div class="takes-empty"><span>${icon("library")}</span><h2>A fresh start for your next episode.</h2><p>Record a take and you’ll find the video, voice tracks, and desktop audio here.</p><button class="button primary" id="empty-studio">Open studio ${icon("arrow")}</button></div>`;
      $("#empty-studio").onclick = () => view("studio");
      return;
    }
    container.innerHTML = sessions
      .map((s) => {
        const report = s.exports?.at(-1)?.report;
        const trackCount = report?.tracks?.length || 1;
        const audioUnit =
          EXPORT_FORMATS.find((f) => f.id === report?.format)?.kind === "audio"
            ? "file"
            : "track";
        return `<article class="take-card"><div class="take-art">${icon("wave")}</div><div class="take-info"><h3>${escape(s.name)}</h3><p>${escape(new Date(s.created).toLocaleString())} · ${formatTime(s.duration || 0)} · ${s.width || 1920} × ${s.height || 1080}</p><div class="take-meta"><span class="tag">${s.status === "interrupted" ? "Interrupted · recovery available" : s.status === "exported" ? "Ready to edit" : s.status === "recording" ? "Recording" : "Originals saved"}</span>${report ? `<span class="tag">${escape((report.format || "mp4").toUpperCase())} · ${trackCount} audio ${audioUnit}${trackCount === 1 ? "" : "s"}${report.mediaBytes ? ` · ${(report.mediaBytes / 1e6).toFixed(1)} MB` : ""}</span><span class="tag">${escape(report.measuredLUFS)} LUFS · ${escape(report.truePeakDBTP)} dBTP</span>` : ""}</div></div><div class="take-actions"><button class="button" data-play-take="${s.id}" ${s.status === "recording" ? "disabled" : ""} title="Play in your media player">${icon("play")} Play</button><button class="button" data-open-take="${s.id}">${icon("folder")} Open files</button><button class="button ${s.id === lastSavedId ? "primary" : ""}" data-export-take="${s.id}" ${exporting || engine.recording || engine.finishing || engine.starting || s.status === "recording" ? "disabled" : ""}>${icon("download")} ${s.status === "interrupted" ? "Recover & export" : "Export"}</button></div></article>`;
      })
      .join("");
    $$("[data-play-take]").forEach(
      (b) => (b.onclick = attempt(() => window.take.play(b.dataset.playTake))),
    );
    $$("[data-open-take]").forEach(
      (b) =>
        (b.onclick = attempt(() => window.take.openFolder(b.dataset.openTake))),
    );
    $$("[data-export-take]").forEach(
      (b) => (b.onclick = () => exportDialog(b.dataset.exportTake)),
    );
  } catch (e) {
    toast(e.message, true);
  }
}
function exportDefaults() {
  return {
    format: config.format,
    separateTracks: config.separateTracks,
    editingFiles: config.editingFiles,
    editorClips: config.editorClips,
    target: config.target,
    normalize: config.normalize,
  };
}
function syncExportDefaults() {
  mountExportControls(
    $("#default-output-options"),
    "default",
    exportDefaults(),
    (options) => {
      const { format, separateTracks, editingFiles, editorClips } = options;
      Object.assign(config, {
        format,
        separateTracks,
        editingFiles,
        editorClips,
      });
      persist();
    },
  );
}
function exportDialog(id) {
  modal(
    "Your format. Your tracks.",
    `<div class="modal-grid export-grid"><section class="modal-section"><h3>Files to create</h3><div id="export-output-options"></div></section><section class="modal-section"><h3>The final mix</h3><label>Loudness target<select id="export-target"><option value="-16">−16 LUFS · Podcast</option><option value="-18">−18 LUFS · Natural</option><option value="-14">−14 LUFS · Louder</option><option value="-20">−20 LUFS · Gentle</option></select></label><label class="toggle-row"><span>Measure & normalize</span><input type="checkbox" id="export-normalize" ${config.normalize ? "checked" : ""}></label><p>Two-pass loudness processing. Live processing stays in the isolated tracks; only the final mix is normalized.</p><div class="notice">Every export goes into a new folder. You can try another format later without replacing your originals or earlier exports.</div><label class="toggle-row"><span>Use these choices for future recordings</span><input type="checkbox" id="export-remember"></label><p>Automatic export uses your saved defaults after you stop. Recording first saves recoverable video and separate audio originals.</p></section></div><div class="modal-footer"><button class="button primary" id="start-export">Export this take ${icon("arrow")}</button></div>`,
    "EXPORT",
  );
  const controls = mountExportControls(
    $("#export-output-options"),
    "export",
    exportDefaults(),
  );
  $("#export-target").value = config.target;
  $("#start-export").onclick = () => {
    const options = {
      ...controls.read(),
      target: Number($("#export-target").value),
      normalize: $("#export-normalize").checked,
    };
    // Export quality follows the recorded-quality preference; format controls
    // only supply the output choices, never silently reset recording quality.
    delete options.quality;
    if ($("#export-remember").checked) {
      Object.assign(config, options);
      $("#target-loudness").value = config.target;
      $("#normalize").checked = config.normalize;
      syncExportDefaults();
      persist();
    }
    closeModal();
    doExport(id, options);
  };
}
async function doExport(id, options = exportDefaults()) {
  if (engine.recording || engine.finishing || engine.starting) {
    toast("Stop and save your current take before exporting.");
    return;
  }
  if (exporting) {
    toast("Let the current export finish first.");
    return;
  }
  exporting = true;
  $("#cancel-export").disabled = false;
  $("#record-button").disabled = true;
  $("#record-label").textContent = "Export in progress";
  $("#export-progress").hidden = false;
  $("#export-stage").textContent = "Preparing your editing pack";
  $("#export-bar").style.width = "0%";
  $("#export-percent").textContent = "0%";
  await loadTakes();
  try {
    const result = await window.take.export(id, {
      quality: config.quality,
      ...options,
    });
    const r = result.report;
    toast(
      `Export ready. Measured ${r.measuredLUFS} LUFS and ${r.truePeakDBTP} dBTP.`,
    );
    if (Number(r.truePeakDBTP) > -1)
      toast(
        "The encoded mix has less than 1 dB true-peak headroom. Review the audio report before publishing.",
        true,
      );
  } catch (e) {
    toast(
      `Your originals are still saved. ${e.message}`,
      !e.message.includes("Export canceled"),
    );
  } finally {
    exporting = false;
    $("#record-button").disabled = false;
    $("#record-label").textContent = "Start recording";
    $("#export-progress").hidden = true;
    await loadTakes();
  }
}
$("#cancel-export").onclick = attempt(async () => {
  $("#cancel-export").disabled = true;
  $("#export-stage").textContent = "Canceling export · keeping originals";
  await window.take.cancelExport();
});
$("#reset-peaks").onclick = () => {
  clippedInputs.fill(false);
  clipWarningAt = -Infinity;
  toast("Input clip warnings reset.");
};
$("#refresh-takes").onclick = loadTakes;
$("#top-folder").onclick = attempt(async () => {
  if (window.take) await window.take.openFolder();
  else view("recordings");
});

$("#start-check").onclick = attempt(async () => {
  if (checking) return;
  if (engine.recording) throw Error("Run Soundcheck between takes.");
  const index = Number($("#check-input").value);
  if (!sourceState[`mic${index + 1}`]) {
    await audioSetup();
    toast(`Connect Voice ${index + 1}, then start Soundcheck.`);
    return;
  }
  checking = { index, started: performance.now(), noise: [], speech: [] };
  $("#check-result").hidden = true;
  $("#start-check").disabled = true;
  $("#check-input").disabled = true;
  const interval = setInterval(() => {
    if (!checking) {
      clearInterval(interval);
      return;
    }
    const elapsed = (performance.now() - checking.started) / 1000;
    $("#check-title").textContent =
      elapsed < 3
        ? `Quiet for ${Math.ceil(3 - elapsed)} seconds…`
        : `Speak normally · ${Math.max(0, Math.ceil(12 - elapsed))} seconds`;
    $("#check-copy").textContent =
      elapsed < 3
        ? "Leave the microphone still. We’re measuring your room."
        : "Say a few sentences as you would in an episode. Include one louder phrase.";
    if (elapsed >= 12) {
      clearInterval(interval);
      finishCheck();
    }
  }, 100);
});
function finishCheck() {
  const check = checking;
  checking = null;
  $("#start-check").disabled = false;
  $("#check-input").disabled = false;
  $("#check-title").textContent = "Your voice, with a little guidance.";
  $("#check-copy").textContent =
    "These are starting points. Record and listen to a short test before your full episode.";
  const peak = Math.max(0, ...check.speech.map((x) => x.peak)),
    noise = check.noise.map((x) => x.rms).sort((a, b) => a - b),
    noiseDb = gainToDb(noise[Math.floor(noise.length * 0.75)] || 0),
    peakDb = gainToDb(peak),
    clipped = check.speech.some((x) => x.clips);
  const result = $("#check-result");
  result.hidden = false;
  if (!check.speech.length || peakDb < -55) {
    result.innerHTML =
      "<strong>No clear voice detected.</strong><p>Check your device and channel selection, microphone hardware mute, and input level, then try again.</p>";
    return;
  }
  if (clipped || peakDb > -0.5) {
    result.innerHTML =
      "<strong>The microphone input is too hot.</strong><p>Lower your microphone or interface’s hardware gain. A software trim cannot undo clipping that happened before the app. Run this check again after adjusting it.</p>";
    return;
  }
  const gain = clamp(Math.round(-12 - peakDb), -12, 12),
    gate = clamp(Math.round(noiseDb + gain + 8), -70, -30);
  result.innerHTML = `<strong>Raw peak: ${peakDb.toFixed(1)} dBFS · Room RMS: ${noiseDb.toFixed(1)} dBFS</strong><p>Suggested trim: ${gain > 0 ? "+" : ""}${gain} dB. Noise threshold: ${gate} dB.${noiseDb > -38 ? " Your room is fairly loud. A closer mic and less background sound will help more than stronger processing." : ""}</p><button class="button primary" id="apply-check">Apply to Voice ${check.index + 1}</button>`;
  $("#apply-check").onclick = () => {
    engine.setVoice(check.index, { gain, gate });
    config.preset[check.index] = "custom";
    persistProfile(check.index);
    syncMixer();
    selectVoice(check.index);
    toast(`Soundcheck settings applied to Voice ${check.index + 1}.`);
    $("#apply-check").disabled = true;
  };
}

$("#video-size").value = String(config.height);
$("#video-fps").value = config.fps;
$("#video-size").onchange = (e) => {
  config.height = Number(e.target.value);
  config.width = Math.round((config.height * 16) / 9);
  updateVideo();
};
$("#video-fps").onchange = (e) => {
  config.fps = Number(e.target.value);
  updateVideo();
};
for (const [id, key] of [
  ["video-quality", "quality"],
  ["video-codec", "codec"],
  ["preview-quality", "previewMode"],
]) {
  $(`#${id}`).value = config[key];
  $(`#${id}`).onchange = (e) => {
    config[key] = e.target.value;
    updateVideo();
  };
}
function updateVideo() {
  compositor.configure(
    config.width,
    config.height,
    config.fps,
    config.previewMode,
  );
  $("#resolution-label").textContent = `${config.height}p · ${config.fps} fps`;
  const mbps = bitrateFor(config.height, config.fps, config.quality) / 1e6;
  $("#quality-estimate").textContent =
    `Target video bitrate: ${mbps.toFixed(1)} Mbps · about ${((mbps * 3600) / 8 / 1000).toFixed(1)} GB/hour, plus up to 6.9 GB/hour for all audio originals. Actual size varies.`;
  persist();
  window.dispatchEvent(new Event("latitude-quality"));
}
for (const [id, key] of [
  ["#auto-export", "autoExport"],
  ["#use-countdown", "countdown"],
  ["#normalize", "normalize"],
  ["#global-hotkeys", "hotkeys"],
  ["#reconnect-mic", "reconnectMic"],
]) {
  $(id).checked = config[key];
  $(id).onchange = attempt(async (e) => {
    config[key] = e.target.checked;
    persist();
    if (key === "hotkeys" && window.take) {
      const failed = await window.take.shortcuts(config.hotkeys);
      shortcutFailures = failed;
      $("#hotkey-note").textContent = failed.length
        ? `Unavailable shortcuts: ${failed.join(", ")}`
        : config.hotkeys
          ? "Shortcuts are active while Latitude is open."
          : "Global shortcuts off. Use them while the app is focused.";
    }
  });
}
syncExportDefaults();
$("#target-loudness").value = config.target;
$("#target-loudness").onchange = (e) => {
  config.target = Number(e.target.value);
  persist();
};
$("#choose-folder").onclick = attempt(async () => {
  if (!window.take)
    throw Error("Open the desktop app to choose a recording folder.");
  const root = await window.take.chooseFolder();
  info.root = root;
  $("#save-path").textContent = root;
  toast("Recording folder updated.");
});
function help() {
  modal(
    "Your first great take.",
    `<div class="guide"><h3>1. Connect your sources</h3><p>Choose a screen or window. Open Camera for your facecam, then Inputs & outputs to select your microphone, desktop sound, and monitoring output.</p><h3>Arrange your scene</h3><p>Click any source in the preview to move it. Drag a corner to resize; hold Alt to bypass snapping. Scene layers has exact position, crop, visibility, lock, and layer order. Add text, gradients, images, and color panels with Add source. Ctrl Z undoes an edit; Ctrl D duplicates a layer. Preview editing locks automatically during recording.</p><h3>2. Get your voice comfortable</h3><p>Run Soundcheck. Pick Natural voice or Podcast broadcast. Start with subtle processing and watch for INPUT CLIP warnings. The left/right selector is useful for a microphone plugged into one side of a stereo interface.</p><h3>3. Make a short test</h3><p>Clap once, talk, play a desktop clip, and switch scenes. Check the result before a long session. Drivers and webcams can introduce different delays; use the audio delay controls if speech arrives early.</p><h3>4. Record, then edit</h3><p>Use Ctrl Shift R to record, Ctrl Shift P to pause/resume, Ctrl Shift M to mute Voice 1, Ctrl Shift B for markers, and Ctrl Shift 1–5 for scenes. Stop to save. Settings → Recording & export format chooses what automatic export creates after you stop. MP4 is the default. Choose MKV or MOV for lossless audio inside video, WebM for the open web, or an audio-only podcast file. Each choice explains its size and compatibility.</p><h3>5. CapCut: keep the tracks separate</h3><p>Keep microphone and desktop sources separate is on by default. In video files, the first track is the full mix. If your editor does not expose the other embedded tracks, import the WAV stems, align everything at the same timeline start, mute the video’s mix, and group/link the clips. Enable WAV editing files or optional audio-specific video copies to choose mic-only or desktop-only audio on each clip instance.</p><h3>Practical limits</h3><p>This is an early desktop build, not a replacement for a thoroughly tested production recorder yet. Windows captures the default playback output. Linux uses PipeWire/PulseAudio output monitoring; Wayland uses your desktop’s screen-sharing picker. SteamOS support targets Desktop Mode; Gaming Mode has not been validated. Hardware routing and long-session performance need testing on your computer. There is no VST hosting or AI voice restoration. Recording is local; no account or upload is required.</p></div>`,
    "QUICK GUIDE",
  );
}
$("#help-button").onclick = help;
document.addEventListener("visibilitychange", () => {
  compositor.visible =
    !document.hidden && $("#page-studio").classList.contains("active");
  engine.node?.port.postMessage({
    type: "visibility",
    visible: !document.hidden,
  });
});
$("#feedback-button").onclick = attempt(async () => {
  if (!window.take?.feedback)
    throw Error("Open github.com/zphat/Latitude/issues to share feedback.");
  await window.take.feedback();
});
$("#diagnostics-button").onclick = () => {
  const diagnostics = JSON.stringify(
    {
      application: "Latitude",
      version: info.version || "browser preview",
      platform: info.platform,
      capture: info.capture,
      runtime: info.runtime,
      encoderAvailable: !!info.encoder,
      output: {
        width: config.width,
        height: config.height,
        fps: config.fps,
        quality: config.quality,
        codec: config.codec,
        preview: config.previewMode,
        exportFormat: config.format,
        separateTracks: config.separateTracks,
      },
      audio: {
        sampleRate: engine.ctx?.sampleRate || 48000,
        sources: engine.sourceState(),
        presets: config.preset,
        delaysMs: [
          ...engine.voiceSettings.map((v) => v.syncMs || 0),
          engine.desktopSettings.syncMs || 0,
        ],
      },
      h264Capture: MediaRecorder.isTypeSupported("video/webm;codecs=h264,opus"),
      shortcutFailures,
    },
    null,
    2,
  );
  modal(
    "Share a useful bug report.",
    `<p>Review these technical details, then copy them into a GitHub issue with what happened and how to reproduce it. No recordings, device names, account information, or folder paths are included. Nothing is uploaded automatically.</p><textarea id="diagnostics-text" readonly rows="14" aria-label="Technical diagnostics">${escape(diagnostics)}</textarea><div class="modal-footer"><button id="copy-diagnostics" class="button primary">Copy diagnostics</button></div>`,
    "BETA FEEDBACK",
  );
  $("#copy-diagnostics").onclick = attempt(async () => {
    if (window.take?.copyDiagnostics)
      await window.take.copyDiagnostics(diagnostics);
    else await navigator.clipboard.writeText(diagnostics);
    toast("Diagnostics copied. Paste them into your bug report.");
  });
};
function action(value) {
  if (value === "stop-and-close") {
    quitting = true;
    attempt(async () => {
      try {
        await engine.stop();
        await window.take.quit();
      } finally {
        quitting = false;
      }
    })();
    return;
  }
  if ($("#modal").open && !engine.recording) return;
  if (value === "record") attempt(record)();
  if (value === "stop" && engine.recording) attempt(() => engine.stop())();
  if (value === "pause") engine.pause();
  if (value === "mute") toggleMute(0);
  if (value === "marker") attempt(() => engine.marker("Edit point"))();
  if (value.startsWith("scene:")) {
    const s = SCENES[Number(value.split(":")[1])];
    if (s) setScene(s.id);
  }
}
window.addEventListener("keydown", (e) => {
  if (e.repeat || $("#modal").open) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    e.key.toLowerCase() === "b" &&
    engine.recording
  ) {
    e.preventDefault();
    engine.marker("Edit point");
    return;
  }
  if (
    (!window.take ||
      !config.hotkeys ||
      shortcutFailures.some((key) =>
        key.endsWith(`+${e.code.replace(/^(Key|Digit)/, "")}`),
      )) &&
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey
  ) {
    const key = e.key.toLowerCase();
    if (key === "r") {
      e.preventDefault();
      action("record");
    } else if (key === "p") {
      e.preventDefault();
      action("pause");
    } else if (key === "m") {
      e.preventDefault();
      action("mute");
    } else if (key === "b") {
      e.preventDefault();
      action("marker");
    } else if (/^[1-5]$/.test(e.code.slice(-1))) {
      e.preventDefault();
      action(`scene:${Number(e.code.slice(-1)) - 1}`);
    }
  }
});
window.addEventListener("beforeunload", (e) => {
  clearTimeout(persistTimer);
  savePreferences();
  if (engine.recording || engine.finishing) {
    e.preventDefault();
    e.returnValue = "Recording is still active.";
  }
});
navigator.mediaDevices?.addEventListener("devicechange", () => {
  if (engine.recording)
    toast("An audio or camera device changed. Check the source meters.");
});
const studioTools = installStudioTools({
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
});
const sceneEditor = installSceneEditor({
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
});
paintIcons();
renderScenes();
renderMixer();
renderProcessing();
updateVideo();
$("#scene-label").textContent = SCENES.find(
  (s) => s.id === compositor.scene,
).name;
if (!config.onboarded)
  studioTools.onboard().catch((e) => toast(e.message, true));
if (window.take) {
  window.take.onAction(action);
  window.take.onAudioDisconnect?.((message) => {
    engine.remove("desktop");
    toast(message, true);
  });
  window.take.onProgress((p) => {
    $("#export-stage").textContent = p.stage;
    $("#export-bar").style.width = `${p.percent}%`;
    $("#export-percent").textContent = `${p.percent}%`;
  });
  window.take.onProblem((message) => {
    toast(message, true);
    if (engine.recording) engine.stop().catch((e) => toast(e.message, true));
  });
  window.take
    .info()
    .then(async (result) => {
      info = result;
      shortcutFailures = result.shortcutFailures || [];
      $("#app-version").textContent =
        `Latitude ${result.version} · ${result.platform === "linux" ? "Linux preview" : "Windows beta"}`;
      $("#save-path").textContent = result.root;
      $("#encoder-status").textContent = result.encoder
        ? "● Video and audio encoder ready"
        : "Encoder missing. Originals will still record; install FFmpeg to export.";
      if (!result.encoder) $("#encoder-status").style.color = "var(--amber)";
      if (config.onboarded && config.reconnectMic)
        for (let i = 0; i < 2; i++) {
          const id = config[`mic${i + 1}`];
          if (id !== "off" && !engine.streams[`mic${i + 1}`])
            try {
              await engine.mic(i, id, config.noise[i]);
            } catch (e) {
              toast(
                `Voice ${i + 1} could not reconnect. Choose its device in Inputs & outputs. ${e.message}`,
                true,
              );
            }
        }
      if (!config.hotkeys) await window.take.shortcuts(false);
      if (result.shortcutFailures.length)
        $("#hotkey-note").textContent =
          `Unavailable shortcuts: ${result.shortcutFailures.join(", ")}`;

    })
    .catch((e) => toast(e.message, true));
} else {
  $(".beta").textContent = "INTERFACE PREVIEW";
  $("#engine-status").textContent =
    "Browser preview · recording needs the desktop app";
}
// Exposed only on a local test page, never in the packaged app.
if (
  location.hostname === "127.0.0.1" &&
  new URLSearchParams(location.search).has("test")
)
  window.__studio = {
    engine,
    compositor,
    config,
    setScene,
    view,
    doExport,
    selectVoice,
    finishCheck,
    studioTools,
    sceneEditor,
  };
