// Preserve native display pixels until the composition crop is applied.
export function captureConstraints(kind, width, height, fps) {
  const frameRate = { ideal: fps, max: fps };
  return kind === "camera"
    ? { width: { ideal: width }, height: { ideal: height }, frameRate }
    : { resizeMode: "none", frameRate };
}
export function setVideoHint(track, fps, camera = false) {
  if (!track || !("contentHint" in track)) return;
  try { track.contentHint = camera || fps >= 60 ? "motion" : "detail"; } catch {}
}
// Deadline-based pacing: compensate for timer jitter, skip missed slots.
export class FrameClock {
  reset() { this.next = undefined; }
  advance(now, fps) {
    const interval = 1000 / fps;
    if (this.next == null || this.fps !== fps) this.next = now;
    this.fps = fps;
    this.next += (Math.floor(Math.max(0, now - this.next) / interval) + 1) * interval;
    if (this.next - now < interval / 2) this.next += interval;
  }
  delay(now) { return Math.max(1, Math.ceil((this.next ?? now) - now)); }
}
export function pixelBounds(layer, width, height) {
  const x = Math.round(layer.x * width), y = Math.round(layer.y * height);
  return { x: x * 1920 / width, y: y * 1080 / height,
    w: Math.max(1, Math.round((layer.x + layer.w) * width) - x) * 1920 / width,
    h: Math.max(1, Math.round((layer.y + layer.h) * height) - y) * 1080 / height };
}
