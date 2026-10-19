import { VoiceProcessor, StereoLimiter, Delay, dbToGain } from "./dsp.js";

class StudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [
      new VoiceProcessor(sampleRate),
      new VoiceProcessor(sampleRate),
    ];
    this.desktopLimiter = new StereoLimiter(sampleRate);
    this.masterLimiter = new StereoLimiter(sampleRate);
    this.monitorLimiter = new StereoLimiter(sampleRate);
    this.monitorEnabled = false;
    this.connected = [false, false];
    this.monitorOut = new Float32Array(2);
    this.meterInterval = 2400;
    const latency = this.masterLimiter.delaySamples;
    this.alignment = Array.from({ length: 4 }, () => new Delay(latency));
    this.dryDelay = [new Delay(latency * 2), new Delay(latency * 2)];
    this.syncDelay = [new Delay(0), new Delay(0), new Delay(0), new Delay(0)];
    this.desktop = { gain: -6, mute: false, duck: false };
    this.master = { gain: 0, mute: false };
    this.deskGain = dbToGain(-6);
    this.masterGain = 1;
    this.duck = 1;
    this.deskTarget = this.deskGain;
    this.masterTarget = 1;
    this.duckAmount = dbToGain(-12);
    this.enabled = Array(6).fill(true);
    this.tmp = new Float32Array(2);
    this.out = new Float32Array(2);
    this.a = new Float64Array(2);
    this.aligned = new Float64Array(4);
    this.raw = new Float64Array(2);
    this.values = new Float64Array(4);
    this.recording = false;
    this.stopFrame = Infinity;
    this.recordFrame = 0;
    this.pauseFrame = Infinity;
    this.resumeFrame = -Infinity;
    this.resetBuffers();
    this.meterSamples = 0;
    this.resetMeters();
    this.port.onmessage = ({ data }) => {
      if (data.type === "voice") {
        if (![0, 1].includes(data.index)) return;
        this.voices[data.index].set(data.settings);
        if (Number.isFinite(data.settings.syncMs)) this.setDelay(data.index, data.settings.syncMs);
      }
      if (data.type === "desktop") {
        this.desktop = { ...this.desktop, ...data.settings };
        this.desktop.gain = Number.isFinite(this.desktop.gain) ? Math.max(-60, Math.min(12, this.desktop.gain)) : -6;
        this.deskTarget = this.desktop.mute ? 0 : dbToGain(this.desktop.gain);
        if (Number.isFinite(data.settings.syncMs)) {
          this.setDelay(2, data.settings.syncMs); this.setDelay(3, data.settings.syncMs);
        }
      }
      if (data.type === "master") {
        this.master = { ...this.master, ...data.settings };
        this.master.gain = Number.isFinite(this.master.gain) ? Math.max(-60, Math.min(12, this.master.gain)) : 0;
        this.masterTarget = this.master.mute ? 0 : dbToGain(this.master.gain);
      }
      if (data.type === "monitor") {
        this.monitorEnabled = !!data.enabled;
        if (!this.monitorEnabled) this.monitorLimiter.reset();
      }
      if (data.type === "visibility") this.meterInterval = data.visible ? 2400 : sampleRate;
      if (data.type === "start") {
        this.enabled = data.enabled || Array(6).fill(true);
        this.resetBuffers();
        this.recording = true;
        this.recordFrame = data.frame;
        this.stopFrame = Infinity;
        this.pauseFrame = Infinity;
        this.resumeFrame = -Infinity;
      }
      if (data.type === "pause")
        this.pauseFrame = Math.max(currentFrame, data.frame);
      if (data.type === "resume") {
        this.pauseFrame = Infinity;
        this.resumeFrame = Math.max(currentFrame, data.frame);
      }
      if (data.type === "stop")
        this.stopFrame = Math.max(currentFrame, data.frame);
    };
  }
  setDelay(index, ms) {
    const samples = Math.round(Math.max(0, Math.min(500, ms)) * sampleRate / 1000);
    // Preserve buffered audio when gain/mute changes resend the same delay.
    if (this.syncDelay[index].samples !== samples) this.syncDelay[index] = new Delay(samples);
  }
  resetBuffers() {
    this.buffers = [1, 1, 2, 2, 1, 1].map((n) => new Float32Array(4096 * n));
    this.fill = 0;
  }
  resetMeters() {
    this.peaks = [0, 0, 0, 0];
    this.sums = [0, 0, 0, 0];
    this.inputPeaks = [0, 0];
    this.inputSums = [0, 0];
    this.clips = [0, 0];
  }
  flush() {
    if (!this.fill) return;
    const data = this.buffers.map((b, i) =>
      this.enabled[i] ? b.slice(0, this.fill * [1, 1, 2, 2, 1, 1][i]) : null,
    );
    this.port.postMessage(
      { type: "pcm", data },
      data.filter(Boolean).map((x) => x.buffer),
    );
    this.fill = 0;
  }
  process(inputs, outputs) {
    const master = outputs[0],
      v1 = inputs[0],
      v2 = inputs[1],
      desktop = inputs[2];
    for (let v = 0; v < 2; v++) {
      const connected = (v ? v2 : v1).length > 0;
      if (this.connected[v] && !connected) {
        this.voices[v].reset(); this.syncDelay[v].data.fill(0);
        this.dryDelay[v].data.fill(0); this.alignment[v].data.fill(0);
      }
      this.connected[v] = connected;
    }
    for (let i = 0; i < master[0].length; i++) {
      const a = this.a;
      for (let v = 0; v < 2; v++) {
        const input = v ? v2 : v1,
          p = this.voices[v].p,
          l = input[0]?.[i] || 0,
          r = input[1]?.[i] ?? l;
        const raw =
          p.channel === "right" ? r : p.channel === "mix" ? (l + r) * 0.5 : l;
        this.inputPeaks[v] = Math.max(this.inputPeaks[v], Math.abs(raw));
        this.inputSums[v] += raw * raw;
        if (Math.abs(raw) >= 0.999) this.clips[v]++;
        a[v] = this.syncDelay[v].tick(raw);
      }
      const m1 = this.connected[0] ? this.voices[0].tick(a[0]) : 0,
        m2 = this.connected[1] ? this.voices[1].tick(a[1]) : 0;
      this.deskGain += (this.deskTarget - this.deskGain) * 0.005;
      const talking =
        Math.max(
          this.voices[0].p.mute ? 0 : this.voices[0].env,
          this.voices[1].p.mute ? 0 : this.voices[1].env,
        ) > 0.0002511886;
      const duckTarget = this.desktop.duck && talking ? this.duckAmount : 1;
      this.duck +=
        (duckTarget - this.duck) * (duckTarget < this.duck ? 0.002 : 0.00008);
      this.desktopLimiter.process(
        this.syncDelay[2].tick(desktop[0]?.[i] || 0) * this.deskGain,
        this.syncDelay[3].tick(desktop[1]?.[i] ?? desktop[0]?.[i] ?? 0) *
          this.deskGain,
        this.tmp,
      );
      // Stems retain desktop level; ducking is applied only to the mixed bus.
      this.masterGain += (this.masterTarget - this.masterGain) * 0.005;
      this.masterLimiter.process(
        (m1 + m2 + this.tmp[0] * this.duck) * this.masterGain,
        (m1 + m2 + this.tmp[1] * this.duck) * this.masterGain,
        this.out,
      );
      const aligned = this.aligned;
      aligned[0] = this.alignment[0].tick(m1);
      aligned[1] = this.alignment[1].tick(m2);
      aligned[2] = this.alignment[2].tick(this.tmp[0]);
      aligned[3] = this.alignment[3].tick(this.tmp[1]);
      const raw = this.raw;
      raw[0] = this.dryDelay[0].tick(a[0] * this.voices[0].muteGain);
      raw[1] = this.dryDelay[1].tick(a[1] * this.voices[1].muteGain);
      master[0][i] = this.out[0];
      master[1][i] = this.out[1];
      // Mic-only monitor output avoids replaying desktop loopback into itself.
      if (this.monitorEnabled) this.monitorLimiter.process(aligned[0] + aligned[1], aligned[0] + aligned[1], this.monitorOut);
      outputs[1][0][i] = this.monitorEnabled ? this.monitorOut[0] : 0;
      outputs[1][1][i] = this.monitorEnabled ? this.monitorOut[1] : 0;
      const values = this.values;
      values[0] = aligned[0];
      values[1] = aligned[1];
      values[2] = Math.max(Math.abs(aligned[2]), Math.abs(aligned[3]));
      values[3] = Math.max(Math.abs(this.out[0]), Math.abs(this.out[1]));
      for (let m = 0; m < 4; m++) {
        this.peaks[m] = Math.max(this.peaks[m], Math.abs(values[m]));
        this.sums[m] += values[m] * values[m];
      }
      const frame = currentFrame + i;
      if (
        this.recording &&
        frame >= this.recordFrame &&
        frame < this.stopFrame &&
        frame < this.pauseFrame &&
        frame >= this.resumeFrame
      ) {
        const k = this.fill;
        this.buffers[0][k] = aligned[0];
        this.buffers[1][k] = aligned[1];
        this.buffers[2][k * 2] = aligned[2];
        this.buffers[2][k * 2 + 1] = aligned[3];
        this.buffers[3][k * 2] = this.out[0];
        this.buffers[3][k * 2 + 1] = this.out[1];
        this.buffers[4][k] = raw[0];
        this.buffers[5][k] = raw[1];
        this.fill++;
        if (this.fill === 4096) this.flush();
      }
      if (this.recording && frame >= this.stopFrame) {
        this.flush();
        this.recording = false;
        this.port.postMessage({ type: "stopped", frame });
      }
    }
    this.meterSamples += master[0].length;
    if (this.meterSamples >= this.meterInterval) {
      this.port.postMessage({
        type: "meters",
        peaks: this.peaks,
        rms: this.sums.map((x) => Math.sqrt(x / this.meterSamples)),
        inputPeaks: this.inputPeaks,
        inputRms: this.inputSums.map((x) => Math.sqrt(x / this.meterSamples)),
        clips: this.clips,
        reduction: this.voices.map((v) => v.lastReduction),
        limiting: this.masterLimiter.reduction,
      });
      this.meterSamples = 0;
      this.resetMeters();
    }
    return true;
  }
}
registerProcessor("take-studio", StudioProcessor);
