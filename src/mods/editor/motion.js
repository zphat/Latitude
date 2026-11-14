// Data-only motion vocabulary shared by the preview, project validator and exporter.
export const TRANSITIONS = Object.freeze([
  ["fade", "Fade / dissolve"], ["slide-left", "Slide from left"],
  ["slide-right", "Slide from right"], ["slide-up", "Slide from below"],
  ["slide-down", "Slide from above"], ["wipe", "Wipe from left"],
  ["wipe-right", "Wipe from right"], ["wipe-up", "Wipe from below"],
  ["wipe-down", "Wipe from above"], ["reveal-center", "Open from center"],
  ["iris", "Circle reveal"], ["diamond", "Diamond reveal"],
]);
export const TRANSITION_IDS = new Set(TRANSITIONS.map(([id]) => id));
export const MASKS = new Set(["wipe", "wipe-right", "wipe-up", "wipe-down", "reveal-center", "iris", "diamond"]);
export const ease = (v, mode) => mode === "smooth" ? v * v * (3 - 2 * v) : v;
export const easeExpression = (v, mode) => mode === "smooth" ? `((${v})*(${v})*(3-2*(${v})))` : v;
export function maskExpression(type, phase) {
  const p = `(${phase})`;
  return {
    wipe: `lt(X,W*${p})`, "wipe-right": `gte(X,W*(1-${p}))`,
    "wipe-up": `gte(Y,H*(1-${p}))`, "wipe-down": `lt(Y,H*${p})`,
    "reveal-center": `lt(abs(X-W/2),W/2*${p})`,
    iris: `lt(pow(X-W/2,2)+pow(Y-H/2,2),(W*W+H*H)/4*${p}*${p})`,
    diamond: `lt(abs((X-W/2)/(W/2))+abs((Y-H/2)/(H/2)),2*${p})`,
  }[type] || "1";
}
export function clipMask(ctx, type, phase, x, y, w, h) {
  ctx.beginPath();
  if (type === "wipe") ctx.rect(x, y, w * phase, h);
  else if (type === "wipe-right") ctx.rect(x + w * (1 - phase), y, w * phase, h);
  else if (type === "wipe-up") ctx.rect(x, y + h * (1 - phase), w, h * phase);
  else if (type === "wipe-down") ctx.rect(x, y, w, h * phase);
  else if (type === "reveal-center") ctx.rect(x + w * (1 - phase) / 2, y, w * phase, h);
  else if (type === "iris") ctx.arc(x + w / 2, y + h / 2, Math.hypot(w, h) / 2 * phase, 0, Math.PI * 2);
  else if (type === "diamond") {
    ctx.moveTo(x + w / 2, y + h / 2 - h * phase);
    ctx.lineTo(x + w / 2 + w * phase, y + h / 2);
    ctx.lineTo(x + w / 2, y + h / 2 + h * phase);
    ctx.lineTo(x + w / 2 - w * phase, y + h / 2); ctx.closePath();
  } else ctx.rect(x, y, w, h);
  ctx.clip();
  // Circular / diamond masks never reveal pixels outside the clip's frame.
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
}
