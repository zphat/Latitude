// Small, deterministic audio primitives shared by the AudioWorklet and tests.
// No network, third-party DSP, or automatic gain control.
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (gain) => 20 * Math.log10(Math.max(1e-8, gain));

export const PRESETS = {
  natural: {
    name: "Natural voice",
    note: "Clear, close, and still you.",
    highpass: 75,
    body: 0.5,
    mud: -1.5,
    presence: 1,
    air: 0,
    threshold: -20,
    ratio: 2.5,
    attack: 12,
    release: 150,
    makeup: 2,
    gate: -52,
    gateDepth: 12,
    deess: 2.5,
    polish: 0,
    gain: 0,
  },
  broadcast: {
    name: "Podcast broadcast",
    note: "A fuller voice with controlled dynamics.",
    highpass: 80,
    body: 1.5,
    mud: -2,
    presence: 1.5,
    air: 0.5,
    threshold: -22,
    ratio: 3,
    attack: 8,
    release: 150,
    makeup: 3,
    gate: -50,
    gateDepth: 16,
    deess: 3.5,
    polish: 35,
    gain: 0,
  },
  room: {
    name: "Untreated room",
    note: "Less rumble and quieter gaps. Use Soundcheck first.",
    highpass: 100,
    body: 0,
    mud: -3,
    presence: 1,
    air: -0.5,
    threshold: -18,
    ratio: 2.5,
    attack: 12,
    release: 180,
    makeup: 1,
    gate: -42,
    gateDepth: 22,
    deess: 3,
    polish: 0,
    gain: 0,
  },
  soft: {
    name: "Soft spoken",
    note: "Gentle leveling without an aggressive gate.",
    highpass: 65,
    body: 1,
    mud: -1,
    presence: 2,
    air: 0.5,
    threshold: -26,
    ratio: 2.5,
    attack: 15,
    release: 200,
    makeup: 4,
    gate: -58,
    gateDepth: 8,
    deess: 2,
    polish: 25,
    gain: 0,
  },
  clean: {
    name: "Music / clean",
    note: "Minimal color, no gate, light peak control.",
    highpass: 25,
    body: 0,
    mud: 0,
    presence: 0,
    air: 0,
    threshold: -12,
    ratio: 1.3,
    attack: 25,
    release: 200,
    makeup: 0,
    gate: -80,
    gateDepth: 0,
    deess: 0,
    polish: 0,
    gain: 0,
  },
};

export class Biquad {
  constructor() {
    this.b0 = 1;
    this.b1 = this.b2 = this.a1 = this.a2 = this.z1 = this.z2 = 0;
  }
  set(type, freq, gain, q, sr) {
    const w = (2 * Math.PI * clamp(freq, 10, sr * 0.45)) / sr,
      c = Math.cos(w),
      s = Math.sin(w),
      a = s / (2 * q),
      A = Math.pow(10, gain / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === "highpass") {
      b0 = (1 + c) / 2;
      b1 = -(1 + c);
      b2 = b0;
      a0 = 1 + a;
      a1 = -2 * c;
      a2 = 1 - a;
    } else if (type === "lowpass") {
      b0 = (1 - c) / 2;
      b1 = 1 - c;
      b2 = b0;
      a0 = 1 + a;
      a1 = -2 * c;
      a2 = 1 - a;
    } else if (type === "peak") {
      b0 = 1 + a * A;
      b1 = -2 * c;
      b2 = 1 - a * A;
      a0 = 1 + a / A;
      a1 = -2 * c;
      a2 = 1 - a / A;
    } else {
      const t = 2 * Math.sqrt(A) * a;
      if (type === "lowshelf") {
        b0 = A * (A + 1 - (A - 1) * c + t);
        b1 = 2 * A * (A - 1 - (A + 1) * c);
        b2 = A * (A + 1 - (A - 1) * c - t);
        a0 = A + 1 + (A - 1) * c + t;
        a1 = -2 * (A - 1 + (A + 1) * c);
        a2 = A + 1 + (A - 1) * c - t;
      } else {
        b0 = A * (A + 1 + (A - 1) * c + t);
        b1 = -2 * A * (A - 1 + (A + 1) * c);
        b2 = A * (A + 1 + (A - 1) * c - t);
        a0 = A + 1 - (A - 1) * c + t;
        a1 = 2 * (A - 1 - (A + 1) * c);
        a2 = A + 1 - (A - 1) * c - t;
      }
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }
  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

export class Delay {
  constructor(samples) {
    this.data = new Float32Array(Math.max(1, samples));
    this.pos = 0;
    this.samples = samples;
  }
  tick(x) {
    if (!this.samples) return x;
    const y = this.data[this.pos];
    this.data[this.pos] = x;
    this.pos = (this.pos + 1) % this.data.length;
    return y;
  }
}

export class StereoLimiter {
  constructor(sr, ceiling = -1.5, ms = 5) {
    this.ceiling = dbToGain(ceiling);
    this.delaySamples = Math.round((sr * ms) / 1000);
    this.left = new Delay(this.delaySamples);
    this.right = new Delay(this.delaySamples);
    this.gain = 1;
    this.release = Math.exp(-1 / (sr * 0.12));
    this.reduction = 0;
    // Monotonic peak queue: includes the delayed sample and every sample ahead
    // of it. Both channels share one gain envelope, including the final guard.
    this.queuePeaks = new Float64Array(this.delaySamples + 2);
    this.queueFrames = new Float64Array(this.delaySamples + 2);
    this.head = 0;
    this.tail = 0;
    this.frame = 0;
  }
  process(l, r, out) {
    const peak = Math.max(Math.abs(l), Math.abs(r)),
      n = this.queuePeaks.length,
      frame = this.frame++;
    while (
      this.head !== this.tail &&
      this.queueFrames[this.head] < frame - this.delaySamples
    )
      this.head = (this.head + 1) % n;
    while (this.head !== this.tail) {
      const prev = (this.tail + n - 1) % n;
      if (this.queuePeaks[prev] > peak) break;
      this.tail = prev;
    }
    this.queuePeaks[this.tail] = peak;
    this.queueFrames[this.tail] = frame;
    this.tail = (this.tail + 1) % n;
    const need = Math.min(
      1,
      this.ceiling / Math.max(1e-12, this.queuePeaks[this.head]),
    );
    this.gain =
      need < this.gain
        ? need
        : Math.min(need, 1 - (1 - this.gain) * this.release);
    const dl = this.left.tick(l) * this.gain,
      dr = this.right.tick(r) * this.gain;
    const guard = Math.min(
      1,
      this.ceiling / Math.max(1e-12, Math.abs(dl), Math.abs(dr)),
    );
    out[0] = dl * guard;
    out[1] = dr * guard;
    this.reduction = -gainToDb(this.gain);
  }
}

// Voice-focused parallel tone shaping; not noise cancellation or an air exciter.
export class RichClarity {
  constructor(sr) {
    this.filters = Array.from({ length: 4 }, () => new Biquad());
    this.filters[0].set("peak", 150, 2.7, 0.65, sr);
    this.filters[1].set("peak", 390, -3.4, 0.85, sr);
    this.filters[2].set("peak", 2000, 2.4, 0.8, sr);
    this.filters[3].set("peak", 4800, -1.4, 0.9, sr);
    this.low = new Biquad();
    this.low.set("lowpass", 650, 0, 0.707, sr);
    this.amount = 0;
    this.smoothing = 1 - Math.exp(-1 / (sr * 0.025));
  }
  tick(input, amount) {
    this.amount += (clamp(amount, 0, 1) - this.amount) * this.smoothing;
    let wet = input;
    for (const f of this.filters) wet = f.tick(wet);
    const low = this.low.tick(wet);
    wet += 0.22 * (Math.tanh(low * 2.5) / 2.5 - low);
    wet *= 0.965;
    return input + (wet - input) * this.amount;
  }
}

export class VoiceProcessor {
  constructor(sr) {
    this.sr = sr;
    this.filters = Array.from({ length: 5 }, () => new Biquad());
    this.split = new Biquad();
    this.clarity = new RichClarity(sr);
    this.limiter = new StereoLimiter(sr);
    this.tmp = new Float32Array(2);
    this.env = 0;
    this.gateGain = 1;
    this.compGain = 1;
    this.sibilance = 0;
    this.trim = 1;
    this.muteGain = 1;
    this.lastReduction = 0;
    this.set({
      ...PRESETS.natural,
      bypass: false,
      mute: false,
      channel: "left",
    });
  }
  set(p) {
    this.p = { ...this.p, ...p };
    const c = this.p;
    this.filters[0].set("highpass", c.highpass, 0, 0.707, this.sr);
    this.filters[1].set("lowshelf", 120, c.body, 0.707, this.sr);
    this.filters[2].set("peak", 280, c.mud, 0.8, this.sr);
    this.filters[3].set("peak", 3000, c.presence, 0.8, this.sr);
    this.filters[4].set("highshelf", 9500, c.air, 0.707, this.sr);
    this.split.set("lowpass", 5200, 0, 0.707, this.sr);
    this.attack = Math.exp(-1 / ((this.sr * c.attack) / 1000));
    this.release = Math.exp(-1 / ((this.sr * c.release) / 1000));
    this.gateAttack = Math.exp(-1 / (this.sr * 0.003));
    this.gateRelease = Math.exp(-1 / (this.sr * 0.22));
    this.trimTarget = dbToGain(c.gain);
    this.makeup = dbToGain(c.makeup);
  }
  tick(input) {
    const p = this.p;
    this.trim += (this.trimTarget - this.trim) * 0.002;
    let x = input * this.trim;
    if (!p.bypass) {
      for (const f of this.filters) x = f.tick(x);
      this.env += (x * x - this.env) * (x * x > this.env ? 0.01 : 0.0003);
      const db = gainToDb(Math.sqrt(Math.max(0, this.env))),
        below = Math.max(0, p.gate - db);
      const gate = dbToGain(-Math.min(p.gateDepth, below * 0.9));
      const gc = gate > this.gateGain ? this.gateAttack : this.gateRelease;
      this.gateGain = gate + (this.gateGain - gate) * gc;
      const knee = 6,
        delta = db - p.threshold;
      const over =
        delta < -knee / 2
          ? 0
          : delta > knee / 2
            ? delta
            : (delta + knee / 2) ** 2 / (2 * knee);
      const comp = dbToGain(-over * (1 - 1 / p.ratio));
      this.compGain =
        comp +
        (this.compGain - comp) *
          (comp < this.compGain ? this.attack : this.release);
      this.lastReduction = -gainToDb(this.compGain);
      const low = this.split.tick(x),
        high = x - low;
      this.sibilance +=
        (high * high - this.sibilance) *
        (high * high > this.sibilance ? 0.02 : 0.001);
      const deess = dbToGain(
        -Math.min(
          p.deess,
          Math.max(0, gainToDb(Math.sqrt(this.sibilance)) + 30) * 0.5,
        ),
      );
      x = (low + high * deess) * this.gateGain * this.compGain * this.makeup;
      x = this.clarity.tick(x, p.clarityBypass ? 0 : p.polish / 100);
    } else this.lastReduction = 0;
    this.muteGain += ((p.mute ? 0 : 1) - this.muteGain) * 0.006;
    this.limiter.process(x * this.muteGain, x * this.muteGain, this.tmp);
    return this.tmp[0];
  }
}
