const test = require("node:test");
const assert = require("node:assert/strict");
test("every voice preset stays finite, preserves silence, and enforces the sample ceiling", async () => {
  const { VoiceProcessor, PRESETS, dbToGain } = await import("../audio/dsp.js");
  for (const [name, preset] of Object.entries(PRESETS)) {
    const p = new VoiceProcessor(48000);
    p.set({ ...preset, gain: 24, polish: 100 });
    let max = 0;
    for (let i = 0; i < 48000; i++) {
      const y = p.tick(i < 12000 ? 0 : Math.sin(i * 0.11) * 4);
      assert.ok(Number.isFinite(y), name);
      max = Math.max(max, Math.abs(y));
      if (i < 12000) assert.equal(y, 0);
    }
    assert.ok(max <= dbToGain(-1.5) + 1e-6, `${name}: ${max}`);
  }
});
test("stereo limiting is linked and preserves channel balance", async () => {
  const { StereoLimiter, dbToGain } = await import("../audio/dsp.js");
  const l = new StereoLimiter(48000);
  const out = new Float32Array(2);
  for (let i = 0; i < 48000; i++) {
    const x = 2 * Math.sin(i * 0.12);
    l.process(x, x * 0.25, out);
    assert.ok(Math.abs(out[0]) <= dbToGain(-1.5) + 1e-6);
    assert.ok(Math.abs(out[1] - out[0] * 0.25) < 1e-6);
  }
});
test("bypass retains the limiter, and mute converges to silence", async () => {
  const { VoiceProcessor, dbToGain } = await import("../audio/dsp.js");
  const p = new VoiceProcessor(48000);
  p.set({ bypass: true, gain: 12 });
  for (let i = 0; i < 10000; i++)
    assert.ok(Math.abs(p.tick(3)) <= dbToGain(-1.5) + 1e-6);
  p.set({ mute: true });
  let y;
  for (let i = 0; i < 10000; i++) y = p.tick(3);
  assert.ok(Math.abs(y) < 1e-6);
});
test("soft compression reduces sustained dynamic range", async () => {
  const { VoiceProcessor, gainToDb } = await import("../audio/dsp.js");
  function rms(amplitude) {
    const p = new VoiceProcessor(48000);
    p.set({
      threshold: -30,
      ratio: 4,
      makeup: 0,
      gateDepth: 0,
      deess: 0,
      body: 0,
      mud: 0,
      presence: 0,
      air: 0,
      polish: 0,
    });
    let sum = 0;
    for (let i = 0; i < 96000; i++) {
      const y = p.tick(Math.sin((i * 2 * Math.PI * 440) / 48000) * amplitude);
      if (i >= 48000) sum += y * y;
    }
    return Math.sqrt(sum / 48000);
  }
  const difference = gainToDb(rms(0.4) / rms(0.04));
  assert.ok(difference < 9 && difference > 3, `compressed delta ${difference}`);
});
test("Rich clarity adds body and presence, cuts boxiness, and avoids airy lift", async () => {
  const { RichClarity } = await import("../audio/dsp.js");
  const response = (hz) => {
    const p = new RichClarity(48000);
    let dry = 0,
      wet = 0;
    for (let i = 0; i < 72000; i++) {
      const x = 0.1 * Math.sin((i * 2 * Math.PI * hz) / 48000),
        y = p.tick(x, 0.35);
      if (i > 24000) {
        wet += y * y;
        dry += x * x;
      }
    }
    return 10 * Math.log10(wet / dry);
  };
  assert.ok(response(150) > 0.4);
  assert.ok(response(390) < -0.6);
  assert.ok(response(2000) > 0.4);
  assert.ok(response(9500) < 0.1);
});
test("Rich clarity bypass converges smoothly to the unenhanced signal", async () => {
  const { RichClarity } = await import("../audio/dsp.js");
  const p = new RichClarity(48000);
  let error = 0;
  for (let i = 0; i < 96000; i++) {
    const x = 0.12 * Math.sin(i * 0.08),
      y = p.tick(x, i < 48000 ? 0.8 : 0);
    if (i > 90000) error = Math.max(error, Math.abs(x - y));
  }
  assert.ok(error < 1e-8);
});
test("invalid settings stay finite at 44.1 and 48 kHz", async () => {
  const { VoiceProcessor, dbToGain } = await import("../audio/dsp.js");
  for (const rate of [44100, 48000]) {
    const p = new VoiceProcessor(rate);
    p.set({
      gain: NaN,
      ratio: 0,
      attack: 0,
      release: -5,
      threshold: Infinity,
      polish: 300,
      highpass: -200,
      body: NaN,
    });
    for (let i = 0; i < rate; i++) {
      const y = p.tick(i % 6000 === 0 ? 5 : Math.sin(i * 0.3) * 0.15);
      assert.ok(Number.isFinite(y));
      assert.ok(Math.abs(y) <= dbToGain(-1.5) + 1e-6);
    }
  }
});
test("disabled Rich clarity sleeps and resumes smoothly", async () => {
  const { RichClarity } = await import("../audio/dsp.js");
  const p = new RichClarity(48000);
  let calls = 0;
  for (const f of p.filters) {
    const tick = f.tick.bind(f);
    f.tick = (x) => {
      calls++;
      return tick(x);
    };
  }
  for (let i = 0; i < 1000; i++) assert.equal(p.tick(0.1, 0), 0.1);
  assert.equal(calls, 0);
  assert.ok(Math.abs(p.tick(0.1, 0.5) - 0.1) < 0.001);
});
test("processing bypass crossfades instead of switching abruptly", async () => {
  const { VoiceProcessor } = await import("../audio/dsp.js");
  const p = new VoiceProcessor(48000);
  p.set({ gain: 0, makeup: 12, gateDepth: 0, ratio: 1, deess: 0 });
  for (let i = 0; i < 48000; i++) p.tick(Math.sin(i * 0.01) * 0.08);
  p.set({ bypass: true });
  p.tick(0.01);
  assert.ok(p.wet > 0.99 && p.wet < 1);
  for (let i = 0; i < 12000; i++) p.tick(0);
  assert.equal(p.wet, 0);
});
