import { layers } from "./scene-model.js";
export const bounded = (n, min, max, fallback = min) =>
  Number.isFinite(Number(n))
    ? Math.max(min, Math.min(max, Number(n)))
    : fallback;
export function rect(v = {}, min = 0.000001) {
  const w = bounded(v.w, min, 1, 1),
    h = bounded(v.h, min, 1, 1);
  return { x: bounded(v.x, 0, 1 - w, 0), y: bounded(v.y, 0, 1 - h, 0), w, h };
}
export function cropPixels(v, width, height) {
  const r = rect(v),
    x = Math.min(width - 1, Math.round(r.x * width)),
    y = Math.min(height - 1, Math.round(r.y * height));
  return {
    x,
    y,
    w: Math.max(1, Math.min(width - x, Math.round(r.w * width))),
    h: Math.max(1, Math.min(height - y, Math.round(r.h * height))),
  };
}
export function cropFromMargins(
  { left = 0, top = 0, right = 0, bottom = 0 },
  width,
  height,
) {
  const x = bounded(left, 0, width - 1),
    y = bounded(top, 0, height - 1),
    r = bounded(right, 0, width - x - 1),
    b = bounded(bottom, 0, height - y - 1);
  return {
    x: x / width,
    y: y / height,
    w: (width - x - r) / width,
    h: (height - y - b) / height,
  };
}
export function cameraRect(v = {}, aspect = 16 / 9) {
  const w = bounded(v.w, 0.1, Math.min(0.65, (aspect * 9) / 16), 0.27),
    h = (w * 16) / 9 / aspect;
  return rect({ ...v, w, h }, 0.04);
}
export function layout(v = {}) {
  const l = {
    crops: {},
    facecams: {},
    secondary: v.secondary === "independent" ? "independent" : "same",
    axis: v.axis === "vertical" ? "vertical" : "horizontal",
    fit: v.fit === "cover" ? "cover" : "contain",
    split: bounded(v.split, 0.2, 0.8, 0.5),
    gap: bounded(v.gap, 0, 80, 16),
    overlay: !!v.overlay,
    cameraAspect: ["wide", "classic", "square", "circle"].includes(
      v.cameraAspect,
    )
      ? v.cameraAspect
      : "wide",
  };
  for (const k of ["a", "b", "camera"]) l.crops[k] = rect(v.crops?.[k]);
  const a =
    l.cameraAspect === "wide"
      ? 16 / 9
      : l.cameraAspect === "classic"
        ? 4 / 3
        : 1;
  for (const k of ["present", "split"])
    l.facecams[k] = cameraRect(
      v.facecams?.[k] || { x: 0.71, y: 0.7, w: 0.27 },
      a,
    );
  return l;
}
export const THEMES = [
  {
    id: "signal",
    name: "Signal",
    note: "Sundial charcoal & electric lime",
    scheme: "dark",
    colors: {
      bg: "#090d0a",
      panel: "#111712",
      panel2: "#1b231c",
      line: "#303c2f",
      text: "#edf0e5",
      muted: "#aab6a3",
      faint: "#92a18b",
      accent: "#d1ff4a",
      highlight: "#d1ff4a",
      ink: "#16200d",
      green: "#a7d9a0",
      red: "#ffa1a7",
      amber: "#eed09a",
    },
  },
  {
    id: "dusk",
    name: "Dusk",
    note: "A quiet, warm dark mode",
    scheme: "dark",
    colors: {
      bg: "#24232a",
      panel: "#2d2c34",
      panel2: "#383740",
      line: "#514e5c",
      text: "#eeeaf2",
      muted: "#b6b0bf",
      faint: "#a7a0b1",
      accent: "#cbbbe2",
      highlight: "#eac2ad",
      ink: "#2a2335",
      green: "#bdd7b2",
      red: "#f9a9b5",
      amber: "#e5c694",
    },
  },
  {
    id: "linen",
    name: "Linen",
    note: "Soft light, without the glare",
    scheme: "light",
    colors: {
      bg: "#e9e7e0",
      panel: "#f4f1e9",
      panel2: "#dfddd6",
      line: "#c6c2b9",
      text: "#2d3535",
      muted: "#59625f",
      faint: "#626a67",
      accent: "#375b59",
      highlight: "#355e4b",
      ink: "#f8f6ee",
      green: "#306341",
      red: "#a02f48",
      amber: "#805c22",
    },
  },
  {
    id: "latitude",
    name: "Golden latitude",
    note: "Ocean ink & sundial brass",
    scheme: "dark",
    colors: {
      bg: "#1b292e",
      panel: "#24363b",
      panel2: "#30454a",
      line: "#496067",
      text: "#f1ebdc",
      muted: "#b8c5c1",
      faint: "#a5b6b4",
      accent: "#e1ba76",
      highlight: "#efcf8e",
      ink: "#302b20",
      green: "#add2ac",
      red: "#ffa8a3",
      amber: "#e9c787",
    },
  },
  {
    id: "tide",
    name: "Tide",
    note: "Deep teal & warm coral",
    scheme: "dark",
    colors: {
      bg: "#091b20",
      panel: "#102a30",
      panel2: "#1a373e",
      line: "#35545b",
      text: "#e5efea",
      muted: "#b0c5c4",
      faint: "#9db5b5",
      accent: "#ffa990",
      highlight: "#ffd3a8",
      ink: "#24211b",
      green: "#a6dbb6",
      red: "#ffabac",
      amber: "#f2ca92",
    },
  },
];
export const TEMPLATES = [
  {
    id: "presenter",
    name: "Presenter",
    scene: "present",
    icon: "layout",
    note: "Screen with an optional facecam. Move it anywhere. Ideal for tutorials and commentary.",
    preset: "broadcast",
    layout: layout(),
  },
  {
    id: "review",
    name: "Review desk",
    scene: "split",
    icon: "columns",
    note: "Two views, no camera needed. Compare documents or show two halves of one monitor.",
    preset: "natural",
    layout: layout({
      crops: {
        a: { x: 0, y: 0, w: 0.5, h: 1 },
        b: { x: 0.5, y: 0, w: 0.5, h: 1 },
      },
    }),
  },
  {
    id: "focus",
    name: "Screen & voice",
    scene: "screen",
    icon: "monitor",
    note: "A clean screen and your voice. Great for gameplay, walkthroughs, or an audio-first show.",
    preset: "natural",
    layout: layout(),
  },
];
const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export function validatePack(v) {
  if (!v || v.version !== 1) throw Error("Use a Latitude pack with version 1.");
  const name = text(v.name, 60);
  if (!name) throw Error("This pack needs a name.");
  if (
    (v.themes && !Array.isArray(v.themes)) ||
    (v.templates && !Array.isArray(v.templates))
  )
    throw Error("Invalid pack lists.");
  if ((v.themes?.length || 0) > 8 || (v.templates?.length || 0) > 8)
    throw Error("A pack can hold up to eight themes and eight layouts.");
  const themes = [],
    templates = [];
  for (const [i, t] of (v.themes || []).entries()) {
    const colors = {};
    for (const k of Object.keys(THEMES[0].colors)) {
      if (!/^#[0-9a-f]{6}$/i.test(t?.colors?.[k] || ""))
        throw Error(`Theme ${i + 1}: ${k} must be a six-digit hex color.`);
      colors[k] = t.colors[k];
    }
    if (!text(t.name, 32)) throw Error("Each theme needs a name.");
    themes.push({
      id: `custom-${i}`,
      name: text(t.name, 32),
      note: text(t.note, 100),
      scheme: t.scheme === "light" ? "light" : "dark",
      colors,
    });
  }
  for (const [i, t] of (v.templates || []).entries()) {
    if (
      !["present", "camera", "split", "screen", "break"].includes(t?.scene) ||
      !["natural", "broadcast", "room", "soft", "clean"].includes(t?.preset)
    )
      throw Error("Unknown scene or voice preset.");
    if (!text(t.name, 32)) throw Error("Each layout needs a name.");
    templates.push({
      id: `custom-layout-${i}`,
      name: text(t.name, 32),
      note: text(t.note, 180),
      scene: t.scene,
      preset: t.preset,
      icon: t.scene === "split" ? "columns" : "layout",
      layout: layout(t.layout),
      ...(Array.isArray(t.composition)
        ? { composition: layers(t.composition) }
        : {}),
    });
  }
  if (!themes.length && !templates.length) throw Error("This pack is empty.");
  return {
    version: 1,
    name,
    themes,
    templates,
    ...(v.assets && typeof v.assets === "object" && !Array.isArray(v.assets)
      ? { assets: v.assets }
      : {}),
  };
}
