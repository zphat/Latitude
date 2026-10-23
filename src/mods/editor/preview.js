import { FORMATS, audible, envelope, visualRect, duration } from "./model.js";
export function titleCanvas(c, project, scale = 1) {
  const [W, H] = FORMATS[project.format],
    canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(c.w * W * scale));
  canvas.height = Math.max(2, Math.round(c.h * H * scale));
  const ctx = canvas.getContext("2d"),
    size = (c.fontSize * H * scale) / 1080,
    pad = size * 0.3;
  if (c.box) {
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.font = `${c.font === "DM Serif Display" ? "400" : "700"} ${size}px "${c.font}"`;
  ctx.textBaseline = "top";
  ctx.textAlign = c.align;
  const lines = [];
  for (const paragraph of c.text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > canvas.width - pad * 2) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  const height = lines.length * size * 1.2,
    top = Math.max(pad, (canvas.height - height) / 2);
  let paint = c.color;
  if (c.gradient) {
    paint = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    paint.addColorStop(0, c.color);
    paint.addColorStop(1, c.color2);
  }
  ctx.fillStyle = paint;
  ctx.shadowColor = "rgba(0,0,0,.75)";
  ctx.shadowBlur = size * 0.1;
  ctx.shadowOffsetY = 2;
  const x =
    c.align === "left"
      ? pad
      : c.align === "right"
        ? canvas.width - pad
        : canvas.width / 2;
  lines.forEach((line, i) =>
    ctx.fillText(line, x, top + i * size * 1.2, canvas.width - pad * 2),
  );
  return canvas;
}
export class Preview {
  constructor({ canvas, project, media, onTime, onError, onMeter }) {
    Object.assign(this, { canvas, project, media, onTime, onError, onMeter });
    this.items = new Map();
    this.titles = new Map();
    this.time = 0;
    this.playing = false;
    this.generation = 0;
    this.destroyed = false;
    this.draw();
  }
  async audio() {
    if (!this.audioReady)
      this.audioReady = (async () => {
        this.ctx = new AudioContext({ sampleRate: 48000 });
        await this.ctx.audioWorklet.addModule(
          new URL("./limiter.js", import.meta.url),
        );
        if (this.destroyed) return;
        this.limiter = new AudioWorkletNode(
          this.ctx,
          "latitude-editor-limiter",
          { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] },
        );
        this.limiter.port.onmessage = ({ data }) => this.onMeter?.(data.peak);
        this.limiter.connect(this.ctx.destination);
      })();
    await this.audioReady;
    if (!this.destroyed) await this.ctx.resume();
  }
  clear() {
    for (const item of this.items.values()) this.release(item);
    this.items.clear();
    this.titles.clear();
  }
  release(item) {
    for (const el of [item.el, item.alt])
      if (el) {
        el.pause?.();
        el.removeAttribute("src");
        el.load?.();
      }
    for (const node of item.nodes || []) node.disconnect();
  }
  async play() {
    if (this.playing || this.starting) return;
    this.starting = true;
    const token = ++this.generation;
    try {
      await this.audio();
      if (this.destroyed || token !== this.generation) {
        await this.ctx?.suspend();
        return;
      }
      if (this.time >= duration(this.project())) this.time = 0;
      this.playing = true;
      this.anchor = performance.now() - this.time * 1000;
      this.tick();
    } catch (e) {
      this.onError(e.message);
      this.pause();
    } finally {
      this.starting = false;
    }
  }
  pause() {
    this.generation++;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const item of this.items.values()) {
      item.el.pause?.();
      item.alt?.pause();
    }
    this.ctx?.suspend().catch(() => {});
    this.onMeter?.(0);
    this.onTime?.(this.time, false);
  }
  seek(time) {
    this.time = Math.max(0, Math.min(duration(this.project()), time));
    this.anchor = performance.now() - this.time * 1000;
    this.draw(true);
    this.onTime?.(this.time, this.playing);
  }
  tick() {
    if (!this.playing || this.destroyed) return;
    this.time = (performance.now() - this.anchor) / 1000;
    if (this.time >= duration(this.project())) {
      this.time = duration(this.project());
      this.pause();
      this.draw();
      return;
    }
    this.draw();
    this.onTime?.(this.time, true);
    this.raf = requestAnimationFrame(() => this.tick());
  }
  connect(item, element) {
    if (!this.ctx || item.nodes) return;
    const source = this.ctx.createMediaElementSource(element),
      high = this.ctx.createBiquadFilter(),
      body = this.ctx.createBiquadFilter(),
      presence = this.ctx.createBiquadFilter(),
      comp = this.ctx.createDynamicsCompressor(),
      gain = this.ctx.createGain(),
      pan = this.ctx.createStereoPanner();
    high.type = "highpass";
    high.frequency.value = 80;
    body.type = presence.type = "peaking";
    body.frequency.value = 220;
    body.Q.value = presence.Q.value = 0.8;
    presence.frequency.value = 3500;
    comp.attack.value = 0.012;
    comp.release.value = 0.16;
    comp.knee.value = 6;
    source
      .connect(high)
      .connect(body)
      .connect(presence)
      .connect(comp)
      .connect(gain)
      .connect(pan)
      .connect(this.limiter);
    item.nodes = [source, high, body, presence, comp, gain, pan];
  }
  item(c, t) {
    const a = this.media().get(c.asset),
      key = `${c.id}:${c.audio}:${t.hidden}:${a?.videoUrl || a?.url}:${a?.audioUrls?.[c.audio] || ""}`;
    let item = this.items.get(c.id);
    if (item?.key !== key) {
      if (item) this.release(item);
      item = null;
      this.items.delete(c.id);
    }
    if (!item) {
      if (!a || a.missing) return null;
      const el =
        c.kind === "image"
          ? new Image()
          : document.createElement(
              c.kind === "video" && !t.hidden ? "video" : "audio",
            );
      if (c.kind !== "image") {
        el.preload = "auto";
        el.playsInline = true;
        el.muted = true;
        el.addEventListener("seeked", () => {
          if (!this.playing) this.draw();
        });
        el.addEventListener("loadeddata", () => {
          if (!this.playing) this.draw(true);
        });
        el.addEventListener("error", () =>
          this.onError(
            `“${a.name}” needs a compatible preview. Select it in Media and choose Make preview; export still uses the original.`,
          ),
        );
      } else el.onload = () => this.draw();
      el.src =
        c.kind === "video" && !t.hidden
          ? a.videoUrl || a.url
          : c.kind === "audio" || t.hidden
            ? a.audioUrls?.[c.audio] || a.url
            : a.url;
      item = { key, el };
      if (c.kind === "video" && c.audio > 0 && !t.hidden) {
        el.muted = true;
        if (a.audioUrls?.[c.audio]) {
          item.alt = new Audio(a.audioUrls[c.audio]);
          item.alt.preload = "auto";
          item.alt.muted = true;
        }
      }
      this.items.set(c.id, item);
    }
    const sound = item.alt || item.el;
    if (
      c.kind !== "image" &&
      this.limiter &&
      !(c.audio > 0 && !a?.audioUrls?.[c.audio])
    ) {
      this.connect(item, sound);
      sound.muted = false;
    }
    if (item.nodes) {
      const [, high, body, presence, comp, gain, pan] = item.nodes;
      high.frequency.value = t.voice ? 80 : 5;
      body.gain.value = t.voice ? -2 : 0;
      presence.gain.value = t.voice ? 1.5 : 0;
      comp.threshold.value = t.voice ? -18 : 0;
      comp.ratio.value = t.voice ? 2.5 : 1;
      gain.gain.setTargetAtTime(
        c.mute || !audible(this.project(), t)
          ? 0
          : 10 ** ((c.gain + t.gain) / 20) *
              envelope(c, this.time, true) *
              (t.voice ? 1.3 : 1),
        this.ctx.currentTime,
        0.005,
      );
      pan.pan.value = t.pan;
    }
    return item;
  }
  draw(force = false) {
    if (this.destroyed) return;
    const p = this.project(),
      [W, H] = FORMATS[p.format],
      scale = Math.min(960 / W, 540 / H),
      w = Math.round(W * scale),
      h = Math.round(H * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.canvas.getContext("2d");
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, w, h);
    const active = p.clips
        .filter((c) => c.start <= this.time && c.start + c.duration > this.time)
        .sort(
          (a, b) =>
            p.tracks.findIndex((t) => t.id === a.track) -
              p.tracks.findIndex((t) => t.id === b.track) || a.start - b.start,
        ),
      used = new Set();
    for (const c of active) {
      const t = p.tracks.find((t) => t.id === c.track);
      if ((c.kind === "audio" || t.hidden) && (c.mute || !audible(p, t)))
        continue;
      let source;
      if (c.kind === "title") {
        if (t.hidden) continue;
        const key = JSON.stringify([
          c.text,
          c.font,
          c.fontSize,
          c.color,
          c.color2,
          c.gradient,
          c.box,
          c.align,
          c.w,
          c.h,
          p.format,
        ]);
        let cached = this.titles.get(c.id);
        if (cached?.key !== key) {
          cached = { key, canvas: titleCanvas(c, p, scale) };
          this.titles.set(c.id, cached);
        }
        source = cached.canvas;
      } else {
        const item = this.item(c, t);
        if (!item) continue;
        used.add(c.id);
        for (const el of [item.el, item.alt]) {
          if (!el || c.kind === "image") continue;
          const target = c.in + this.time - c.start;
          if (
            el.duration > 0 &&
            (force || Math.abs(el.currentTime - target) > 0.12)
          )
            el.currentTime = Math.min(el.duration, target);
          if (this.playing && el.paused)
            el.play().catch((e) => {
              if (e.name !== "AbortError")
                this.onError(
                  "Preview playback needs compatible media. Use Make preview in the Media library.",
                );
            });
          else if (!this.playing && !el.paused) el.pause();
        }
        source = item.el;
      }
      if (c.kind === "audio" || t.hidden) continue;
      const sw = source.videoWidth || source.naturalWidth || source.width,
        sh = source.videoHeight || source.naturalHeight || source.height;
      if (!sw || !sh) continue;
      const r = visualRect(c, this.time),
        x = r.x * w,
        y = r.y * h,
        bw = r.w * w,
        bh = r.h * h;
      ctx.save();
      ctx.globalAlpha = r.alpha;
      ctx.beginPath();
      ctx.rect(x, y, bw * r.reveal, bh);
      ctx.clip();
      ctx.filter = `brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturation})`;
      const crop = c.crop || { x: 0, y: 0, w: 1, h: 1 },
        cw = sw * crop.w,
        ch = sh * crop.h,
        fit =
          c.fit === "cover"
            ? Math.max(bw / cw, bh / ch)
            : Math.min(bw / cw, bh / ch),
        dw = cw * fit,
        dh = ch * fit;
      ctx.translate(x + bw / 2, y + bh / 2);
      if (c.flip) ctx.scale(-1, 1);
      ctx.drawImage(
        source,
        sw * crop.x,
        sh * crop.y,
        cw,
        ch,
        -dw / 2,
        -dh / 2,
        dw,
        dh,
      );
      ctx.restore();
    }
    // Prepare the next nearby cut, with a strict cap. No background decoding while idle.
    if (this.playing) {
      const warmed = new Set();
      const upcoming = p.clips
        .filter(
          (c) =>
            c.start > this.time &&
            c.start <= this.time + 0.6 &&
            !["title", "image"].includes(c.kind),
        )
        .sort((a, b) => a.start - b.start);
      for (const c of upcoming) {
        if (warmed.size >= 4) break;
        if (warmed.has(c.track)) continue;
        const t = p.tracks.find((t) => t.id === c.track);
        if ((c.kind === "audio" || t.hidden) && (c.mute || !audible(p, t)))
          continue;
        const item = this.item(c, t);
        if (!item) continue;
        used.add(c.id);
        warmed.add(c.track);
        for (const el of [item.el, item.alt])
          if (el) {
            el.pause();
            if (el.duration > 0 && Math.abs(el.currentTime - c.in) > 0.02)
              el.currentTime = c.in;
          }
      }
    }
    for (const [id, item] of this.items)
      if (!used.has(id)) {
        this.release(item);
        this.items.delete(id);
      }
    for (const id of this.titles.keys())
      if (!active.some((c) => c.id === id)) this.titles.delete(id);
    this.onDraw?.();
  }
  async destroy() {
    this.destroyed = true;
    this.pause();
    this.clear();
    await this.audioReady?.catch(() => {});
    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
    this.ctx = null;
  }
}
