import { layout, cameraRect, cropPixels } from "./design.js";
import { sceneDocuments } from "./scene-model.js";
import { getAsset } from "./assets-store.js";
import { FrameClock, pixelBounds } from "./video-quality.js";
export const SCENES = [
  { id: "present", name: "Screen + facecam", key: "1", icon: "layout" },
  { id: "camera", name: "Camera", key: "2", icon: "camera" },
  { id: "split", name: "Two views", key: "3", icon: "columns" },
  { id: "screen", name: "Screen only", key: "4", icon: "monitor" },
  { id: "break", name: "Intermission", key: "5", icon: "coffee" },
];
export class Compositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.scene = "screen";
    this.previous = null;
    this.transition = "fade";
    this.duration = 350;
    this.fps = 30;
    this.mirror = false;
    this.brand = "Latitude";
    this.subtitle = "A conversation worth recording";
    this.breakTitle = "We’ll be right back";
    this.layout = layout();
    this.documents = sceneDocuments(null, this.layout, this);
    this.images = new Map();
    this.imageEpoch = 0;
    this.textCache = new Map();
    this.textBytes = 0;
    this.screen = this.video();
    this.screenB = this.video();
    this.camera = this.video();
    this.frames = 0;
    this.measuredFps = 0;
    this.drawMs = 0;
    this.counterAt = performance.now();
    this.previewMode = "balanced";
    this.visible = true;
    this.recording = false;
    this.live = false;
    this.liveFrame = null;
    this.paused = false;
    this.quality = "balanced";
    this.clock = new FrameClock();
    this.videoFrames = new WeakMap();
    this.dirty = true;
    this.outputWidth = 1920;
    this.outputHeight = 1080;
    this.schedulingReady = true;
    this.schedule();
  }
  get visible() {
    return this._visible;
  }
  set visible(value) {
    this._visible = value;
    if (value && this.schedulingReady) this.invalidate();
  }
  video() {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.onloadeddata = () => this.invalidate();
    return v;
  }
  setScreen(s, slot = "a") {
    const v = slot === "b" ? this.screenB : this.screen;
    v.srcObject = s;
    if (s) v.play().catch(() => {});
    this.invalidate();
  }
  setCamera(s) {
    this.camera.srcObject = s;
    if (s) this.camera.play().catch(() => {});
    this.invalidate();
  }
  resize(w, h) {
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.invalidate();
  }
  configure(w, h, fps, previewMode = "balanced", quality = "balanced") {
    this.outputWidth = w;
    this.outputHeight = h;
    this.fps = fps;
    this.previewMode = previewMode;
    this.quality = quality;
    this.resizeForMode();
    this.invalidate();
  }
  resizeForMode() {
    const scale =
      this.recording || this.live
        ? 1
        : Math.min(
            1,
            (this.previewMode === "detail" ? 1920 : 1280) / this.outputWidth,
          );
    this.resize(
      Math.round(this.outputWidth * scale),
      Math.round(this.outputHeight * scale),
    );
  }
  setRecording(on) {
    this.recording = on;
    this.paused = false;
    this.restartClock();
    this.resizeForMode();
    this.invalidate();
  }
  setLive(on) {
    this.live = on;
    this.restartClock();
    this.resizeForMode();
    this.invalidate();
  }
  setPaused(on) {
    this.paused = on;
    // Keep recording dimensions fixed, but reduce preview work while paused.
    this.restartClock();
    this.invalidate();
  }
  restartClock() {
    clearTimeout(this.timer);
    this.timer = null;
    this.clock.reset();
    this.frames = 0;
    this.counterAt = performance.now();
  }
  pruneImages() {
    const used = new Set(
      [
        ...this.getLayers(),
        ...(this.previous ? this.getLayers(this.previous) : []),
      ]
        .filter((l) => l.visible && l.type === "image")
        .map((l) => l.asset),
    );
    for (const [id, img] of this.images)
      if (!used.has(id)) {
        img?.close();
        this.images.delete(id);
      }
  }
  clearImageCache() {
    this.imageEpoch++;
    for (const img of this.images.values()) img?.close();
    this.images.clear();
    this.invalidate();
  }
  invalidate() {
    this.pruneImages();
    this.dirty = true;
    if (this.schedulingReady) this.schedule();
  }
  getLayers(scene = this.scene) {
    return this.documents[scene] || [];
  }
  setScene(s) {
    if (s === this.scene) return;
    this.previous = this.scene;
    this.scene = s;
    this.changedAt = performance.now();
    this.invalidate();
  }
  ready(v) {
    return !!v?.srcObject && v.readyState >= 2 && v.videoWidth > 0;
  }
  source(s) {
    return s === "camera"
      ? this.camera
      : s === "b" && this.layout.secondary === "independent"
        ? this.screenB
        : this.screen;
  }
  facecamRect(s = this.scene) {
    return (
      this.getLayers(s).find(
        (l) => l.type === "video" && l.source === "camera",
      ) || cameraRect(this.layout.facecams[s])
    );
  }
  hasFacecam(s = this.scene) {
    return (
      this.ready(this.camera) &&
      this.getLayers(s).some(
        (l) => l.visible && l.type === "video" && l.source === "camera",
      )
    );
  }
  rounded(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  }
  fit(c, v, x, y, w, h, cover = false, mirror = false, crop = {}) {
    const vw = v.videoWidth || v.width,
      vh = v.videoHeight || v.height;
    if (!vw || !vh) return;
    const r = cropPixels(crop, vw, vh),
      scale = cover ? Math.max(w / r.w, h / r.h) : Math.min(w / r.w, h / r.h),
      dw = r.w * scale,
      dh = r.h * scale;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    if (mirror) {
      c.translate(x + w, y);
      c.scale(-1, 1);
      x = 0;
      y = 0;
    }
    const sx = this.canvas.width / 1920,
      sy = this.canvas.height / 1080;
    const left = Math.round((x + (w - dw) / 2) * sx) / sx,
      top = Math.round((y + (h - dh) / 2) * sy) / sy,
      right = Math.round((x + (w + dw) / 2) * sx) / sx,
      bottom = Math.round((y + (h + dh) / 2) * sy) / sy;
    c.drawImage(v, r.x, r.y, r.w, r.h, left, top, right - left, bottom - top);
    c.restore();
  }
  placeholder(c, x, y, w, h, label) {
    if (this.recording || this.live) return;
    c.save();
    c.fillStyle = "#16251f";
    c.fillRect(x, y, w, h);
    c.strokeStyle = "#435345";
    c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#adb9ab";
    c.font = `500 ${Math.max(16, Math.min(w, h) * 0.045)}px Arial`;
    c.fillText(label, x + w / 2, y + h / 2, w - 20);
    c.restore();
  }
  image(id) {
    if (!id) return null;
    if (!this.images.has(id)) {
      this.images.set(id, null);
      const epoch = this.imageEpoch;
      getAsset(id)
        .then((blob) => (blob ? createImageBitmap(blob) : null))
        .then((img) => {
          if (epoch !== this.imageEpoch || !this.images.has(id)) {
            img?.close();
            return;
          }
          this.images.set(id, img);
          this.invalidate();
        })
        .catch(() => {});
    }
    return this.images.get(id);
  }
  gradient(c, l, w, h) {
    const a = (l.angle * Math.PI) / 180,
      dx = (Math.cos(a) * w) / 2,
      dy = (Math.sin(a) * h) / 2,
      g = c.createLinearGradient(
        w / 2 - dx,
        h / 2 - dy,
        w / 2 + dx,
        h / 2 + dy,
      );
    g.addColorStop(0, l.color);
    g.addColorStop(1, l.color2);
    return g;
  }
  text(c, l, w, h) {
    c.font = `${l.italic ? "italic " : ""}${l.bold ? "700" : "400"} ${l.size}px ${l.font}`;
    c.textBaseline = "top";
    c.textAlign = l.align;
    c.lineJoin = "round";
    const x = l.align === "center" ? w / 2 : l.align === "right" ? w : 0;
    c.fillStyle = l.gradient ? this.gradient(c, l, w, h) : l.color;
    if (l.shadow) {
      c.shadowColor = "#0009";
      c.shadowBlur = 5;
      c.shadowOffsetY = 2;
    }
    let y = 0;
    for (const paragraph of l.text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const next = line ? line + " " + word : word;
        if (line && c.measureText(next).width > w) {
          this.textLine(c, l, line, x, y, w);
          y += l.size * 1.22;
          line = word;
        } else line = next;
      }
      this.textLine(c, l, line, x, y, w);
      y += l.size * 1.22;
      if (y > h) break;
    }
  }
  textLine(c, l, text, x, y, w) {
    if (l.outline) {
      c.strokeStyle = l.outlineColor;
      c.lineWidth = l.outline * 2;
      c.strokeText(text, x, y, w);
    }
    c.fillText(text, x, y, w);
  }
  cachedText(c, l, w, h) {
    const scale = this.canvas.width / 1920,
      pw = Math.max(1, Math.ceil(w * scale)),
      ph = Math.max(1, Math.ceil(h * scale)),
      key = JSON.stringify([
        pw,
        ph,
        l.text,
        l.font,
        l.size,
        l.bold,
        l.italic,
        l.color,
        l.color2,
        l.gradient,
        l.angle,
        l.align,
        l.outline,
        l.outlineColor,
        l.shadow,
      ]);
    let cached = this.textCache.get(l.id);
    if (cached?.key !== key) {
      if (cached) {
        this.textBytes -= cached.bytes;
        this.textCache.delete(l.id);
        cached.canvas.width = 1;
      }
      const bytes = pw * ph * 4;
      if (bytes > 32 * 1024 * 1024) {
        this.text(c, l, w, h);
        return;
      }
      while (
        this.textBytes + bytes > 32 * 1024 * 1024 ||
        this.textCache.size >= 40
      ) {
        const [id, old] = this.textCache.entries().next().value;
        this.textCache.delete(id);
        this.textBytes -= old.bytes;
        old.canvas.width = 1;
      }
      const canvas = document.createElement("canvas");
      canvas.width = pw;
      canvas.height = ph;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      this.text(ctx, l, w, h);
      cached = { key, canvas, bytes };
      this.textCache.set(l.id, cached);
      this.textBytes += bytes;
    }
    c.drawImage(cached.canvas, 0, 0, w, h);
  }
  renderScene(c, s) {
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality =
      this.quality === "high"
        ? "high"
        : this.quality === "efficient"
          ? "low"
          : "medium";
    c.fillStyle = "#090b0d";
    c.fillRect(0, 0, 1920, 1080);
    for (const l of this.getLayers(s)) {
      if (!l.visible || l.opacity <= 0) continue;
      const { x, y, w, h } = pixelBounds(
        l,
        this.canvas.width,
        this.canvas.height,
      );
      c.save();
      c.globalAlpha *= l.opacity;
      c.translate(x, y);
      if (l.shape === "circle") {
        c.beginPath();
        c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        c.clip();
      } else {
        this.rounded(c, 0, 0, w, h, l.shape === "rounded" ? l.radius : 0);
        c.clip();
      }
      if (l.type === "video") {
        const v = this.source(l.source);
        if (this.ready(v))
          this.fit(c, v, 0, 0, w, h, l.fit === "cover", l.mirror, l.crop);
        else if (l.source !== "camera" || s === "camera")
          this.placeholder(c, 0, 0, w, h, `Connect ${l.name}`);
      } else if (l.type === "text") this.cachedText(c, l, w, h);
      else if (l.type === "color") {
        c.fillStyle = l.gradient ? this.gradient(c, l, w, h) : l.color;
        c.fillRect(0, 0, w, h);
      } else if (l.type === "image") {
        const image = this.image(l.asset);
        if (image) this.fit(c, image, 0, 0, w, h, l.fit === "cover", l.mirror);
        else this.placeholder(c, 0, 0, w, h, "Image unavailable");
      }
      c.restore();
    }
  }
  draw(now = performance.now()) {
    const started = performance.now(),
      c = this.ctx;
    c.save();
    c.scale(this.canvas.width / 1920, this.canvas.height / 1080);
    const p = Math.min(1, (now - (this.changedAt || 0)) / this.duration);
    if (this.previous && p < 1 && this.transition !== "cut") {
      this.stage ??= document.createElement("canvas");
      if (
        this.stage.width !== this.canvas.width ||
        this.stage.height !== this.canvas.height
      ) {
        this.stage.width = this.canvas.width;
        this.stage.height = this.canvas.height;
      }
      const sc = this.stage.getContext("2d", { alpha: false });
      sc.save();
      sc.scale(this.stage.width / 1920, this.stage.height / 1080);
      this.renderScene(sc, this.scene);
      sc.restore();
      this.renderScene(c, this.previous);
      if (this.transition === "fade") c.globalAlpha = p;
      c.drawImage(
        this.stage,
        this.transition === "slide" ? 1920 * (1 - p) ** 3 : 0,
        0,
        1920,
        1080,
      );
    } else {
      if (this.previous) {
        this.previous = null;
        this.pruneImages();
      }
      this.renderScene(c, this.scene);
      if (this.stage) {
        this.stage.width = 1;
        this.stage.height = 1;
        this.stage = null;
      }
    }
    c.restore();
    this.drawMs = performance.now() - started;
    if (!this.paused) this.captureTrack?.requestFrame();
    this.liveFrame?.();
    this.dirty = false;
    this.frames++;
  }
  schedule() {
    if (this.timer != null || this.destroyed) return;
    const tick = () => {
      this.timer = null;
      const now = performance.now();
      let live = false,
        changed = false;
      for (const l of this.getLayers()) {
        if (!l.visible || l.opacity <= 0 || l.type !== "video") continue;
        const v = this.source(l.source);
        if (!this.ready(v)) continue;
        live = true;
        const frames = v.getVideoPlaybackQuality?.().totalVideoFrames;
        if (frames == null || this.videoFrames.get(v) !== frames)
          changed = true;
        this.videoFrames.set(v, frames);
      }
      const capturing = this.live || (this.recording && !this.paused),
        active = capturing || (this.visible && (live || this.previous)),
        fps = capturing
          ? this.fps
          : this.previewMode === "eco"
            ? 10
            : this.previewMode === "detail"
              ? 30
              : 15;
      // Keep recording cadence; skip unchanged idle preview paints.
      if (
        capturing ||
        (this.visible && (this.dirty || changed || this.previous))
      )
        this.draw(now);
      if (now - this.counterAt >= 1000) {
        this.measuredFps = (this.frames * 1000) / (now - this.counterAt);
        this.frames = 0;
        this.counterAt = now;
      }
      if (active) {
        this.clock.advance(now, fps);
        this.timer = setTimeout(tick, this.clock.delay(performance.now()));
      } else {
        this.clock.reset();
        this.measuredFps = 0;
        this.frames = 0;
        this.counterAt = now;
      }
    };
    this.timer = setTimeout(tick, 0);
  }
  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.invalidation);
    for (const img of this.images.values()) img?.close();
    for (const v of [this.screen, this.screenB, this.camera])
      v.srcObject = null;
  }
}
