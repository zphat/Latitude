const test = require("node:test");
const assert = require("node:assert/strict");
const harness = require("./worklet-harness.cjs");
test("sync delay survives repeated settings edits without losing buffered samples", async () => {
  const h = await harness();
  h.send({ type: "voice", index: 0, settings: { syncMs: 40 } });
  h.send({ type: "desktop", settings: { syncMs: 75 } });
  const voice = h.processor.syncDelay[0],
    desktop = h.processor.syncDelay[2];
  voice.tick(0.42);
  desktop.tick(0.37);
  h.send({
    type: "voice",
    index: 0,
    settings: { syncMs: 40, mute: true, gain: 2 },
  });
  h.send({ type: "desktop", settings: { syncMs: 75, gain: -3 } });
  assert.equal(h.processor.syncDelay[0], voice);
  assert.equal(h.processor.syncDelay[2], desktop);
  assert.ok(voice.data.some((x) => x > 0.4));
});
test("unused voices sleep, disconnected voices reset, and monitor sum is protected", async () => {
  const h = await harness();
  h.processor.voices.forEach((v) => {
    const original = v.tick.bind(v);
    v.calls = 0;
    v.tick = (x) => {
      v.calls++;
      return original(x);
    };
  });
  h.step();
  assert.deepEqual(
    h.processor.voices.map((v) => v.calls),
    [0, 0],
  );
  const input = [new Float32Array(128).fill(2)];
  h.send({ type: "monitor", enabled: true });
  for (let v = 0; v < 2; v++)
    h.send({ type: "voice", index: v, settings: { bypass: true } });
  let peak = 0;
  for (let i = 0; i < 50; i++) {
    h.step([input, input, []]);
    peak = Math.max(peak, ...h.output[1][0].map(Math.abs));
  }
  assert.ok(peak > 0.5 && peak <= h.dsp.dbToGain(-1.5) + 1e-6);
  h.step();
  assert.equal(h.processor.voices[0].env, 0);
  assert.equal(h.processor.voices[1].env, 0);
});
test("enabled stems keep one clock through pause, resume, and stop", async () => {
  const h = await harness();
  h.send({
    type: "start",
    frame: 0,
    enabled: [true, false, false, true, true, false],
  });
  for (let i = 0; i < 35; i++) h.step();
  h.send({ type: "pause", frame: h.clock.frame });
  for (let i = 0; i < 10; i++) h.step();
  h.send({ type: "resume", frame: h.clock.frame });
  for (let i = 0; i < 20; i++) h.step();
  h.send({ type: "stop", frame: h.clock.frame });
  h.step();
  const samples = [0, 0, 0, 0, 0, 0];
  for (const m of h.messages.filter((m) => m.type === "pcm"))
    m.data.forEach((b, i) => {
      samples[i] += b ? b.length / [1, 1, 2, 2, 1, 1][i] : 0;
    });
  assert.deepEqual(samples, [7040, 0, 0, 7040, 7040, 0]);
  assert.equal(h.messages.filter((m) => m.type === "stopped").length, 1);
});
test("hidden meters reduce messages without stopping processing", async () => {
  const h = await harness();
  h.send({ type: "visibility", visible: false });
  for (let i = 0; i < 375; i++) h.step();
  assert.equal(h.messages.filter((m) => m.type === "meters").length, 1);
});

test("live audio shares the finished mix and clock, survives recording pause, and sleeps when disabled", async () => {
  const h = await harness();
  for (let i = 0; i < 20; i++) h.step();
  assert.equal(h.processor.live, null);
  assert.equal(
    h.messages.some((m) => m.type === "live-pcm"),
    false,
  );
  const first = h.clock.frame;
  h.send({ type: "live-start", id: "test", frame: first });
  h.send({
    type: "start",
    frame: first,
    enabled: [false, false, false, true, false, false],
  });
  const input = new Float32Array(128).fill(0.12),
    expected = [];
  for (let block = 0; block < 64; block++) {
    if (block === 16) h.send({ type: "pause", frame: h.clock.frame });
    if (block === 48) h.send({ type: "resume", frame: h.clock.frame });
    h.step([[input], [], []]);
    for (let i = 0; i < 128; i++)
      expected.push(h.output[0][0][i], h.output[0][1][i]);
  }
  const live = h.messages.filter((m) => m.type === "live-pcm");
  assert.equal(live.length, 4);
  assert.deepEqual(
    live.map((m) => m.frame),
    [first, first + 2048, first + 4096, first + 6144],
  );
  assert.deepEqual(
    live.flatMap((m) => Array.from(m.data)),
    expected,
  );
  h.send({ type: "live-stop", id: "old" });
  assert.ok(h.processor.live);
  h.send({ type: "live-stop", id: "test" });
  for (let i = 0; i < 20; i++) h.step();
  assert.equal(h.processor.live, null);
  assert.equal(h.messages.filter((m) => m.type === "live-pcm").length, 4);
});

test("meter captures a one-sample input overload, clears next window, and reports actual peaks", async () => {
  const h = await harness();
  const input = new Float32Array(128).fill(0.25);
  input[7] = 1;
  h.step([[input], [], []]);
  input[7] = 0.25;
  for (let i = 0; i < 9; i++) h.step([[input], [], []]);
  const first = h.messages.filter((m) => m.type === "meters").at(-1);
  assert.equal(first.clips[0], 1);
  assert.equal(first.inputPeaks[0], 1);
  assert.ok(first.windowMs <= 30 && first.windowMs >= 25);
  for (let i = 0; i < 10; i++) h.step([[input], [], []]);
  const next = h.messages.filter((m) => m.type === "meters").at(-1);
  assert.equal(next.clips[0], 0);
  assert.equal(next.inputPeaks[0], 0.25);
  assert.ok(Math.abs(h.dsp.gainToDb(next.inputPeaks[0]) + 12.0412) < 0.001);
  input.fill(0.999);
  for (let i = 0; i < 10; i++) h.step([[input], [], []]);
  assert.equal(
    h.messages.filter((m) => m.type === "meters").at(-1).clips[0],
    0,
  );
});

test("blended channels cannot hide a full-scale device input and restored meters discard hidden history", async () => {
  const h = await harness();
  h.send({ type: "voice", index: 0, settings: { channel: "mix" } });
  const stereo = [
    new Float32Array(128).fill(1),
    new Float32Array(128).fill(-1),
  ];
  for (let i = 0; i < 10; i++) h.step([stereo, [], []]);
  const m = h.messages.filter((m) => m.type === "meters").at(-1);
  assert.equal(m.inputPeaks[0], 1);
  assert.equal(m.clips[0], 1280);
  assert.equal(m.peaks[0], 0);
  h.send({ type: "visibility", visible: false });
  h.step([stereo, [], []]);
  h.send({ type: "visibility", visible: true });
  for (let i = 0; i < 10; i++) h.step();
  assert.equal(
    h.messages.filter((m) => m.type === "meters").at(-1).clips[0],
    0,
  );
});

test("recorded mic stems and mix retain always-on protection under extreme gain and processing bypass", async () => {
  const h = await harness();
  for (let i = 0; i < 2; i++)
    h.send({
      type: "voice",
      index: i,
      settings: { gain: 24, makeup: 24, polish: 100, bypass: i === 1 },
    });
  h.send({ type: "desktop", settings: { gain: 12 } });
  h.send({ type: "master", settings: { gain: 12 } });
  h.send({ type: "start", frame: 0 });
  const signal = Float32Array.from(
    { length: 128 },
    (_, i) => Math.sin(i * 0.37) * 2,
  );
  for (let i = 0; i < 100; i++) h.step([[signal], [signal], [signal, signal]]);
  h.send({ type: "stop", frame: h.clock.frame });
  h.step();
  const peaks = [0, 0, 0, 0, 0, 0];
  for (const m of h.messages.filter((m) => m.type === "pcm")) {
    for (let track = 0; track < 6; track++) {
      for (const sample of m.data[track]) {
        assert.ok(Number.isFinite(sample));
        peaks[track] = Math.max(peaks[track], Math.abs(sample));
        if (track < 4)
          assert.ok(Math.abs(sample) <= h.dsp.dbToGain(-1.5) + 1e-6);
      }
    }
  }
  assert.ok(
    peaks.slice(0, 4).every((p) => p > 0.1),
    JSON.stringify(peaks),
  );
  assert.ok(
    peaks[4] > 1 && peaks[5] > 1,
    "raw backups preserve input, not a falsely protected copy",
  );
  assert.ok(
    h.messages.some(
      (m) =>
        m.type === "meters" &&
        m.limiterReduction[0] > 0.1 &&
        m.limiterReduction[1] > 0.1,
    ),
  );
});
