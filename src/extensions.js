// Trusted source extensions only. Theme packs never execute code.
export class OutputExtensions {
  constructor(engine) {
    this.engine = engine;
    this.providers = new Map();
    this.active = new Map();
  }
  register(p) {
    if (
      !p ||
      !/^[a-z][a-z0-9-]{1,50}$/.test(p.id) ||
      typeof p.start !== "function" ||
      typeof p.stop !== "function"
    )
      throw Error("Invalid output provider.");
    if (this.providers.has(p.id))
      throw Error("Output provider already registered.");
    this.providers.set(p.id, p);
    return () => {
      if (this.active.has(p.id)) throw Error("Stop the output first.");
      this.providers.delete(p.id);
    };
  }
  async start(id, options = {}) {
    const p = this.providers.get(id),
      e = this.engine;
    if (!p) throw Error("Unknown output provider.");
    if (this.active.has(id)) throw Error("Output already active.");
    if (!e.recording || e.finishing)
      throw Error("This extension API requires an active recording output.");
    const stream = new MediaStream([
      ...e.canvasStream.getVideoTracks().map((t) => t.clone()),
      ...e.mixDestination.stream.getAudioTracks().map((t) => t.clone()),
    ]);
    this.active.set(id, { stream, p });
    try {
      await p.start({
        apiVersion: 1,
        stream,
        sampleRate: e.ctx.sampleRate,
        width: e.canvas.width,
        height: e.canvas.height,
        fps: e.compositor.fps,
        options,
      });
    } catch (error) {
      stream.getTracks().forEach((t) => t.stop());
      this.active.delete(id);
      throw error;
    }
  }
  async stop(id) {
    const a = this.active.get(id);
    if (!a) return;
    let timer;
    a.stream.getTracks().forEach((t) => t.stop());
    try {
      await Promise.race([
        Promise.resolve().then(() => a.p.stop()),
        new Promise(
          (_, reject) =>
            (timer = setTimeout(
              () => reject(Error("Output stop timed out.")),
              1500,
            )),
        ),
      ]);
    } finally {
      clearTimeout(timer);
      this.active.delete(id);
    }
  }
  async stopAll() {
    await Promise.allSettled(
      [...this.active.keys()].map((id) => this.stop(id)),
    );
  }
}
