import { TRANSITIONS, TRANSITION_IDS } from "./motion.js";
import { FONTS, FONT_NAMES } from "./fonts.js";
// Preset packs never contain executable code, URLs, media or licensing claims.
// Review status belongs to the app's curated catalogue, not an imported manifest.
export const PACK_LIMITS = Object.freeze({ bytes: 128 * 1024, presets: 64, installed: 20 });
export const COLOR_DEFAULTS = Object.freeze({ brightness: 1, contrast: 1, saturation: 1, sepia: 0, hue: 0 });
export const CATEGORIES = ["transition", "look", "title", "font"];
const numeric = {
  fadeIn: [0, 5], fadeOut: [0, 5], brightness: [.2, 2], contrast: [.2, 2], saturation: [0, 2],
  sepia: [0, 1], hue: [-180, 180], x: [-1, 1], y: [-1, 1], w: [.02, 2], h: [.02, 2],
  opacity: [0, 1], fontSize: [16, 240],
};
const allowed = {
  transition: ["transition", "easing", "fadeIn", "fadeOut"],
  look: Object.keys(COLOR_DEFAULTS),
  title: ["font", "fontSize", "color", "color2", "gradient", "box", "align", "x", "y", "w", "h", "opacity", "transition", "easing", "fadeIn", "fadeOut"],
  font: ["font"],
};
function text(value, max, fallback = "") {
  return typeof value === "string" ? value.replace(/[\x00-\x1f]/g, " ").trim().slice(0, max) : fallback;
}
export function validatePack(input) {
  if (!input || input.type !== "latitude-editor-pack" || input.version !== 1 || !Array.isArray(input.presets)
      || !input.presets.length || input.presets.length > PACK_LIMITS.presets)
    throw Error("Choose a Latitude editor pack (version 1, up to 64 presets).");
  if (JSON.stringify(input).length > PACK_LIMITS.bytes) throw Error("This preset pack is too large.");
  const name = text(input.name, 80);
  if (!name) throw Error("Give this pack a name.");
  const presets = input.presets.map((p, i) => {
    if (!p || !CATEGORIES.includes(p.kind) || !p.settings || typeof p.settings !== "object" || Array.isArray(p.settings))
      throw Error(`Preset ${i + 1} has an unsupported type or missing settings.`);
    const settings = {};
    for (const key of Object.keys(p.settings)) {
      if (!allowed[p.kind].includes(key)) throw Error(`Unsupported ${p.kind} setting: ${key.slice(0, 60)}.`);
      const v = p.settings[key];
      if (numeric[key]) {
        const [min, max] = numeric[key];
        if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw Error(`Invalid ${key} value.`);
      } else if (key === "font" && !FONT_NAMES.has(v)) throw Error("This pack needs a font that is not bundled with this version of Latitude.");
      else if (key === "transition" && !TRANSITION_IDS.has(v)) throw Error("This pack needs an unsupported transition.");
      else if (key === "easing" && !["linear", "smooth"].includes(v)) throw Error("Unsupported motion timing.");
      else if (key === "align" && !["left", "center", "right"].includes(v)) throw Error("Unsupported text alignment.");
      else if (["gradient", "box"].includes(key) && typeof v !== "boolean") throw Error(`Invalid ${key} value.`);
      else if (["color", "color2"].includes(key) && (typeof v !== "string" || !/^#[\da-f]{6}$/i.test(v))) throw Error("Use six-digit hex colors.");
      settings[key] = v;
    }
    if (!Object.keys(settings).length || (p.kind === "font" && !settings.font)) throw Error("A preset needs settings to apply.");
    return { name: text(p.name, 80, `Preset ${i + 1}`) || `Preset ${i + 1}`, kind: p.kind,
      description: text(p.description, 180), settings };
  });
  return { type: "latitude-editor-pack", version: 1, name, author: text(input.author, 80, "Local creator"),
    description: text(input.description, 240), presets };
}
const preset = (name, kind, settings, description = "") => ({ name, kind, description, settings });
export const LOOKS = [
  ["Original", {}, "Reset all color effects."],
  ["Clear interview", { contrast: 1.06, saturation: .96 }, "A restrained, natural finish."],
  ["Rich color", { contrast: 1.08, saturation: 1.15 }, "A little more energy."],
  ["Soft portrait", { brightness: 1.04, contrast: .93, saturation: .94 }, "Gentler contrast for conversation."],
  ["Black & white", { saturation: 0 }, "Let the subject do the talking."],
  ["Graphite", { saturation: 0, contrast: 1.22, brightness: 1.03 }, "Bold monochrome."],
  ["Warm print", { sepia: .3, saturation: .9, contrast: 1.04 }, "Warm, restrained color."],
  ["Archive", { sepia: .8, saturation: .75, contrast: .9 }, "An aged photograph feel."],
  ["Matte", { brightness: 1.03, contrast: .85, saturation: .85 }, "Lifted shadows and muted color."],
  ["Neon pop", { contrast: 1.12, saturation: 1.45 }, "Punchy gaming and social clips."],
  ["Night radio", { contrast: 1.12, saturation: .65, hue: -12 }, "A subdued late-night mood."],
  ["Color shift", { hue: 90 }, "A playful palette rotation."],
].map(([name, values, description]) => preset(name, "look", { ...COLOR_DEFAULTS, ...values }, description));
const title = (name, values, description) => preset(name, "title", {
  font: "Manrope", fontSize: 64, color: "#ffffff", color2: "#d1ff4a", gradient: false, box: true, align: "left",
  x: .06, y: .72, w: .7, h: .2, opacity: 1, transition: "fade", easing: "smooth", fadeIn: .4, fadeOut: .25,
  ...values,
}, description);
export const TITLES = [
  title("Guest name", {}, "A readable lower third for names and roles."),
  title("Studio lime", { font: "Outfit", color: "#d1ff4a", transition: "slide-left" }, "Latitude's accent, with a smooth entrance."),
  title("Chapter card", { font: "DM Serif Display", x: .08, y: .24, w: .84, h: .52, fontSize: 100, align: "center" }, "A clean chapter break."),
  title("Big statement", { font: "Bebas Neue", x: .06, y: .3, w: .88, h: .4, fontSize: 140, align: "center", box: false }, "Confident, condensed headlines."),
  title("Editorial quote", { font: "Playfair Display", y: .18, w: .88, h: .6, fontSize: 76 }, "Room for a quotation."),
  title("Field notes", { font: "Roboto Slab", color: "#ffe7c2", transition: "wipe" }, "A documentary caption."),
  title("Transmission", { font: "Space Mono", fontSize: 52, color: "#d1ff4a", transition: "wipe" }, "A technical lower third."),
  title("Handwritten", { font: "Caveat", fontSize: 100, box: false, transition: "slide-up" }, "A personal note in the frame."),
  title("Off the record", { font: "Permanent Marker", fontSize: 80, color: "#ffd66b", box: false }, "Informal and expressive."),
  title("Comic punch", { font: "Bangers", fontSize: 120, color: "#ffd66b", x: .1, y: .2, w: .8, h: .5, align: "center", transition: "iris" }, "A playful reaction or highlight."),
  title("Good vibes", { font: "Pacifico", fontSize: 88, color: "#ffbadb", box: false, transition: "slide-up" }, "A relaxed handwritten finish."),
  title("Gradient headline", { font: "Archivo Black", fontSize: 96, gradient: true, x: .05, y: .3, w: .9, h: .4, align: "center", box: false, transition: "reveal-center" }, "A bold two-color headline."),
];
export const BUILTIN_PACKS = Object.freeze([
  validatePack({ type: "latitude-editor-pack", version: 1, name: "Essential motion", author: "Latitude", description: "Twelve editable entrances, from restrained dissolves to playful reveals.",
    presets: TRANSITIONS.map(([id, name]) => preset(name, "transition", { transition: id, easing: "smooth", fadeIn: .5, fadeOut: 0 }, "Apply to a picture or title. Overlap clips for a transition between them.")) }),
  validatePack({ type: "latitude-editor-pack", version: 1, name: "Studio looks", author: "Latitude", description: "Twelve light color recipes. Your original remains untouched.", presets: LOOKS }),
  validatePack({ type: "latitude-editor-pack", version: 1, name: "On air titles", author: "Latitude", description: "Twelve editable titles for episodes, guests, quotes and highlights.", presets: TITLES }),
  validatePack({ type: "latitude-editor-pack", version: 1, name: "Type collection", author: "Latitude", description: "Fifteen locally bundled open fonts, plus your system monospace.",
    presets: FONTS.map(f => preset(f.name, "font", { font: f.name }, `${f.family} · ${f.sample}`)) }),
]);
export function applyPreset(clip, preset) {
  if (!clip || clip.kind === "audio") throw Error("Select a picture or title clip first.");
  if (["title", "font"].includes(preset.kind) && clip.kind !== "title") throw Error("Select a title to style it, or choose Add title.");
  Object.assign(clip, preset.settings);
  clip.fadeIn = Math.min(clip.fadeIn || 0, clip.duration / 2);
  clip.fadeOut = Math.min(clip.fadeOut || 0, clip.duration / 2);
  return clip;
}
export function presetFromClip(clip, kind, name) {
  if (!allowed[kind]) throw Error("Choose a preset category.");
  const settings = Object.fromEntries(allowed[kind].filter(k => clip[k] !== undefined).map(k => [k, clip[k]]));
  for (const key of ["fadeIn", "fadeOut"]) if (settings[key] > 5) settings[key] = 5;
  return validatePack({ type: "latitude-editor-pack", version: 1, name, author: "Local creator", presets: [preset(name, kind, settings)] });
}
