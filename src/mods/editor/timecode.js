// Timeline timecodes use the project's integer frame rate (non-drop-frame).
export function timecode(seconds, fps) {
  const total = Math.max(0, Math.round(seconds * fps));
  return [Math.floor(total / fps / 3600), Math.floor(total / fps / 60) % 60,
    Math.floor(total / fps) % 60, total % fps].map(n => String(n).padStart(2, "0")).join(":");
}
export function parseTimecode(text, fps) {
  const parts = text.trim().split(":");
  if (!parts.length || parts.length > 4 || parts.some(v => !/^\d+(?:\.\d+)?$/.test(v))) return null;
  const n = parts.map(Number);
  if (n.some(v => !Number.isFinite(v)) || !Number.isInteger(fps) || fps <= 0) return null;
  if (n.length === 4) {
    if (n.some(v => !Number.isInteger(v)) || n[1] >= 60 || n[2] >= 60 || n[3] >= fps) return null;
    return n[0] * 3600 + n[1] * 60 + n[2] + n[3] / fps;
  }
  if (n.slice(0, -1).some(v => !Number.isInteger(v)) || (n.length > 1 && n.at(-1) >= 60) || (n.length === 3 && n[1] >= 60)) return null;
  const result = n.reduce((value, part) => value * 60 + part, 0);
  return Number.isFinite(result) ? result : null;
}
