import { header, packet } from './matroska.js';

export class StreamingSession extends EventTarget {
  constructor({ capture, transport }) {
    super();
    this.capture = capture;
    this.transport = transport;
    this.generation = 0;
    this.state = { state: 'idle', message: '', dropped: 0 };
    this.off = transport.onState(data => {
      const run = this.run;
      if (!run || data.id !== run.id || !this.wanted) return;
      if (data.state === 'failed') this.recover(run, Error(data.message));
      if (data.state === 'sending') {
        this.update({ ...data, dropped: run.dropped, encoder: run.encoderLabel });
      }
    });
  }
  update(data) {
    this.state = { ...this.state, ...data };
    this.dispatchEvent(new CustomEvent('change', { detail: this.state }));
  }
  get active() { return !!this.wanted; }
  async start(options) {
    if (this.wanted) return;
    if (!this.transport.available) throw Error('Streaming is available in the desktop app.');
    const { width, height, fps } = this.capture.format();
    if (width > 1920 || height > 1080 || ![24, 30, 60].includes(fps))
      throw Error('Choose 720p or 1080p at 24, 30, or 60 fps in Studio settings before streaming.');
    if (!Number.isFinite(options.videoKbps) || options.videoKbps < 1500 || options.videoKbps > 20000)
      throw Error('Choose a video bitrate between 1,500 and 20,000 kb/s.');
    this.options = { ...options, width, height, fps };
    this.wanted = true;
    this.retries = 0;
    this.capture.activity(true);
    try { await this.connect(); }
    catch (error) {
      await this.stop();
      this.update({ state: 'failed', message: error.message });
      throw error;
    }
  }
  async connect() {
    const token = ++this.generation;
    const run = this.run = { token, pending: 0, queue: Promise.resolve(), audio: [], dropped: 0, lastFrame: -1, lastKey: -2e6 };
    const current = () => this.wanted && this.run === run && token === this.generation;
    this.update({ state: 'connecting', message: 'Opening the encoder and destination…', seconds: 0, bytes: 0, dropped: 0 });
    if (typeof VideoEncoder === 'undefined') throw Error('This runtime does not support the streaming video encoder.');
    const base = { codec: 'avc1.42002a', width: this.options.width, height: this.options.height,
      bitrate: this.options.videoKbps * 1000, framerate: this.options.fps, bitrateMode: 'constant',
      latencyMode: 'realtime', avc: { format: 'avc' } };
    let config;
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      const supported = await VideoEncoder.isConfigSupported({ ...base, hardwareAcceleration });
      if (!current()) return;
      if (supported.supported) { config = supported.config; break; }
    }
    if (!config) throw Error('No H.264 streaming encoder supports this size and frame rate. Try 720p / 30 fps.');
    run.encoderLabel = config.hardwareAcceleration === 'prefer-hardware' ? 'Hardware preferred' : 'Automatic / software fallback';
    run.encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        if (!current()) return;
        try {
          if (!run.header) {
            this.send(run, header({ ...this.options, sampleRate: 48000, description: metadata?.decoderConfig?.description }));
            run.header = true;
          }
          const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
          this.send(run, packet(1, chunk.timestamp, data, chunk.type === 'key'));
          for (const item of run.audio) this.send(run, item);
          run.audio.length = 0;
        } catch (error) { this.recover(run, error); }
      },
      error: () => this.recover(run, Error('The video encoder stopped. Try 720p / 30 fps or update the graphics driver.')),
    });
    run.encoder.configure(config);
    const result = await this.transport.start(this.options);
    run.id = result.id;
    if (!current()) { await this.closeRun(run); return; }
    run.lease = await this.capture.acquire({
      onFrame: (canvas, timestamp) => {
        if (!current() || timestamp <= run.lastFrame || run.encoder.state !== 'configured') return;
        // Keep at most two waiting frames. A slow encoder cannot accumulate bitmaps.
        if (run.encoder.encodeQueueSize > 2) { run.dropped++; return; }
        const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1e6 / this.options.fps) });
        try {
          const keyFrame = timestamp - run.lastKey >= 1900000;
          run.encoder.encode(frame, { keyFrame });
          run.lastFrame = timestamp;
          if (keyFrame) run.lastKey = timestamp;
        } catch (error) { this.recover(run, error); }
        finally { frame.close(); }
      },
      onAudio: data => {
        if (!current() || !run.lease) return;
        const timestamp = Math.max(0, Math.round((data.frame / run.lease.sampleRate - run.lease.started) * 1e6));
        const bytes = packet(2, timestamp, new Uint8Array(data.data.buffer));
        if (run.header) this.send(run, bytes);
        else if (run.audio.length < 24) run.audio.push(bytes);
        else this.recover(run, Error('The video encoder did not produce its first frame. Try a lower resolution.'));
      },
      onFault: error => this.recover(run, error),
    });
    if (!current()) await this.closeRun(run);
  }
  send(run, bytes) {
    if (this.run !== run || !this.wanted || run.failing) return;
    run.pending += bytes.byteLength;
    if (run.pending > 4 * 1024 * 1024) {
      run.pending -= bytes.byteLength;
      this.recover(run, Error('Upload cannot keep up. Lower the video bitrate or resolution.'));
      return;
    }
    run.queue = run.queue.then(() => {
      if (this.run === run && this.wanted && !run.failing)
        return this.transport.write(run.id, bytes);
    }).catch(error => { this.recover(run, error); })
      .finally(() => { run.pending -= bytes.byteLength; });
  }
  async closeRun(run) {
    if (!run) return;
    run.failing = true;
    run.lease?.release();
    if (run.encoder?.state !== 'closed') run.encoder?.close();
    run.audio.length = 0;
    if (run.id) await this.transport.stop(run.id).catch(() => {});
  }
  async recover(run, error) {
    if (!this.wanted || this.run !== run || run.failing) return;
    run.failing = true;
    ++this.generation;
    await this.closeRun(run);
    if (!this.wanted || this.run !== run) return;
    if (++this.retries > 3) {
      await this.stop();
      this.update({ state: 'failed', message: `${error.message} Automatic retries ended. Check your settings before starting again.` });
      return;
    }
    const delay = 2 ** this.retries;
    this.update({ state: 'reconnecting', message: `${error.message} Retrying in ${delay} seconds (${this.retries}/3).` });
    this.retryTimer = setTimeout(() => {
      if (this.wanted) this.connect().catch(async e => {
        const active = this.run;
        if (active) { active.failing = false; await this.recover(active, e); }
      });
    }, delay * 1000);
  }
  async stop() {
    this.wanted = false;
    ++this.generation;
    clearTimeout(this.retryTimer);
    const run = this.run;
    this.run = null;
    await this.closeRun(run);
    // Keys live only in the current attempt and password field, never preferences.
    this.options = null;
    this.capture.activity(false);
    this.update({ state: 'idle', message: 'Streaming is off.' });
  }
  async dispose() { await this.stop(); this.off?.(); }
}
