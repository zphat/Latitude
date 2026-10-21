import { bounded, rect, cameraRect } from "./design.js";
export const SCENE_IDS = ["present", "camera", "split", "screen", "break"];
export const FONTS = ["Inter", "Arial", "Georgia", "Verdana", "monospace"];
export const color = (v, f = "#d1ff4a") =>
  /^#[0-9a-f]{6}$/i.test(v || "") ? v : f;
export const uid = () => crypto.randomUUID();
const str = (v, n = 100) => (typeof v === "string" ? v.slice(0, n) : "");
export function layer(v = {}) {
  v = v && typeof v === "object" ? v : {};
  const type = ["video", "text", "image", "color"].includes(v.type)
    ? v.type
    : "video";
  return {
    id: /^[\w-]{1,80}$/.test(v.id || "") ? v.id : uid(),
    type,
    name:
      str(v.name, 60) ||
      { video: "Screen A", text: "Text", image: "Image", color: "Color panel" }[
        type
      ],
    ...rect(v, 0.015),
    visible: v.visible !== false,
    locked: !!v.locked,
    opacity: bounded(v.opacity, 0, 1, 1),
    source: ["a", "b", "camera"].includes(v.source) ? v.source : "a",
    crop: rect(v.crop),
    fit: v.fit === "cover" ? "cover" : "contain",
    mirror: !!v.mirror,
    shape: ["rectangle", "rounded", "circle"].includes(v.shape)
      ? v.shape
      : "rectangle",
    radius: bounded(v.radius, 0, 160, 24),
    text:
      typeof v.text === "string"
        ? str(v.text, 2000)
        : type === "text"
          ? "Your text"
          : "",
    font: FONTS.includes(v.font) ? v.font : "Arial",
    size: bounded(v.size, 12, 240, 64),
    bold: v.bold !== false,
    italic: !!v.italic,
    color: color(v.color, type === "color" ? "#162320" : "#edf1e6"),
    color2: color(v.color2),
    gradient: !!v.gradient,
    angle: bounded(v.angle, 0, 360, 90),
    align: ["left", "center", "right"].includes(v.align) ? v.align : "left",
    outline: bounded(v.outline, 0, 12, 0),
    outlineColor: color(v.outlineColor, "#10150f"),
    shadow: v.shadow !== false,
    asset: str(v.asset, 80),
    aspectLock: v.aspectLock !== false,
  };
}
export function layers(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.slice(0, 40).map((v) => {
    const l = layer(v);
    if (ids.has(l.id)) l.id = uid();
    ids.add(l.id);
    return l;
  });
}
export function defaults(scene, l, appearance = {}) {
  const video = (source, box = { x: 0, y: 0, w: 1, h: 1 }) =>
    layer({
      type: "video",
      name: source === "camera" ? "Camera" : `Screen ${source.toUpperCase()}`,
      source,
      ...box,
      crop: l.crops[source],
      fit: source === "camera" ? "cover" : l.fit,
      mirror: source === "camera" && appearance.mirror,
    });
  let result = [];
  if (scene === "camera") result = [video("camera")];
  else if (scene === "split") {
    const horizontal = l.axis === "horizontal",
      gap = l.gap / (horizontal ? 1920 : 1080),
      first = (1 - gap) * l.split;
    result = [
      video("a", {
        x: 0,
        y: 0,
        w: horizontal ? first : 1,
        h: horizontal ? 1 : first,
      }),
      video("b", {
        x: horizontal ? first + gap : 0,
        y: horizontal ? 0 : first + gap,
        w: horizontal ? 1 - first - gap : 1,
        h: horizontal ? 1 : 1 - first - gap,
      }),
    ];
  } else if (scene === "break")
    result = [
      layer({
        type: "color",
        name: "Backdrop",
        color: "#0e1915",
        locked: true,
      }),
      layer({
        type: "text",
        name: "Show name",
        text: appearance.brand || "LATITUDE",
        x: 0.1,
        y: 0.27,
        w: 0.8,
        h: 0.08,
        size: 32,
        color: "#d1ff4a",
        align: "center",
      }),
      layer({
        type: "text",
        name: "Intermission title",
        text: appearance.breakTitle || "We’ll be right back",
        x: 0.08,
        y: 0.41,
        w: 0.84,
        h: 0.16,
        size: 86,
        align: "center",
      }),
      layer({
        type: "text",
        name: "Subtitle",
        text: appearance.subtitle || "A conversation worth recording",
        x: 0.1,
        y: 0.59,
        w: 0.8,
        h: 0.12,
        size: 32,
        align: "center",
        color: "#a4b3aa",
        bold: false,
      }),
    ];
  else result = [video("a")];
  if (scene === "present" || (scene === "split" && l.overlay)) {
    const aspect =
      l.cameraAspect === "classic"
        ? 4 / 3
        : ["circle", "square"].includes(l.cameraAspect)
          ? 1
          : 16 / 9;
    result.push({
      ...video("camera", cameraRect(l.facecams[scene], aspect)),
      shape: l.cameraAspect === "circle" ? "circle" : "rounded",
    });
  }
  if (appearance.lowerThird && scene !== "break")
    result.push(
      layer({
        type: "text",
        name: "Lower third",
        text: `${appearance.brand || "Latitude"}\n${appearance.subtitle || ""}`,
        x: 0.04,
        y: 0.8,
        w: 0.6,
        h: 0.16,
        size: 40,
        color: "#d1ff4a",
      }),
    );
  return result;
}
export function sceneDocuments(saved, l, appearance) {
  return Object.fromEntries(
    SCENE_IDS.map((id) => [
      id,
      Array.isArray(saved?.[id])
        ? layers(saved[id])
        : defaults(id, l, appearance),
    ]),
  );
}
export function hitTest(items, x, y) {
  return [...items]
    .reverse()
    .find(
      (l) =>
        l.visible &&
        !l.locked &&
        x >= l.x &&
        x <= l.x + l.w &&
        y >= l.y &&
        y <= l.y + l.h,
    );
}
export function moveBox(
  original,
  dx,
  dy,
  snap = true,
  others = [],
  threshold = 0.008,
) {
  const r = {
      ...original,
      x: bounded(original.x + dx, 0, 1 - original.w),
      y: bounded(original.y + dy, 0, 1 - original.h),
    },
    guides = [];
  if (snap)
    for (const [axis, size] of [
      ["x", "w"],
      ["y", "h"],
    ]) {
      const targets = [
        0,
        0.5,
        1,
        ...others
          .filter((o) => o.visible && o.id !== original.id)
          .flatMap((o) => [o[axis], o[axis] + o[size] / 2, o[axis] + o[size]]),
      ];
      let best = threshold,
        delta = 0,
        guide = null;
      for (const anchor of [r[axis], r[axis] + r[size] / 2, r[axis] + r[size]])
        for (const target of targets) {
          const d = target - anchor;
          if (Math.abs(d) < best) {
            best = Math.abs(d);
            delta = d;
            guide = target;
          }
        }
      r[axis] = bounded(r[axis] + delta, 0, 1 - r[size]);
      if (guide !== null) guides.push({ axis, value: guide });
    }
  return { box: r, guides };
}
export function resizeBox(o, dx, dy, handle = "se", lock = true) {
  const west = handle.includes("w"),
    north = handle.includes("n");
  let w = bounded(o.w + (west ? -dx : dx), 0.015, west ? o.x + o.w : 1 - o.x),
    h = bounded(o.h + (north ? -dy : dy), 0.015, north ? o.y + o.h : 1 - o.y);
  if (lock) {
    const factor = Math.abs(dx / o.w) > Math.abs(dy / o.h) ? w / o.w : h / o.h,
      scale = Math.min(
        factor,
        (west ? o.x + o.w : 1 - o.x) / o.w,
        (north ? o.y + o.h : 1 - o.y) / o.h,
      );
    w = Math.max(0.015, o.w * scale);
    h = Math.max(0.015, o.h * scale);
  }
  return rect(
    { x: west ? o.x + o.w - w : o.x, y: north ? o.y + o.h - h : o.y, w, h },
    0.015,
  );
}
export function bitrateFor(height, fps, quality = "balanced") {
  const rates = {
    efficient: { 720: 3.25, 1080: 5.85, 1440: 10.4, 2160: 20.8 },
    balanced: { 720: 6, 1080: 12, 1440: 21, 2160: 42 },
    high: { 720: 10, 1080: 20, 1440: 32, 2160: 64 },
  };
  const base = (rates[quality] || rates.balanced)[height] || 12;
  return Math.round(
    base *
      (fps === 60 ? 1.65 : 1) *
      1e6,
  );
}
