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
