// Worklet microbenchmark; excludes capture, IPC, disk, video and UI.
// Point LATITUDE_BENCH_ROOT at another source checkout to compare on the same host.
import { performance } from "node:perf_hooks";
import harness from "../tests/worklet-harness.cjs";
const sr = 48000,
  frames = sr * 20,
  block = 128,
  reports = [];
for (const [name, count, preset] of [
  ["idle worklet (before suspension)", 0, "natural"],
  ["one natural voice", 1, "natural"],
  ["two podcast voices + desktop", 3, "broadcast"],
]) {
  const times = [];
  for (let trial = 0; trial < 5; trial++) {
    const h = await harness(process.env.LATITUDE_BENCH_ROOT, sr);
    h.processor.port.postMessage = () => {};
    for (let i = 0; i < 2; i++)
      h.send({ type: "voice", index: i, settings: h.dsp.PRESETS[preset] });
    const input = Array.from({ length: 3 }, (_, i) =>
      i < count
        ? [
            Float32Array.from(
              { length: block },
              (_, j) => 0.18 * Math.sin(j * (i + 1) * 0.045),
            ),
          ]
        : [],
    );
    for (let i = 0; i < 1000; i++) h.step(input);
    const start = performance.now();
    for (let frame = 0; frame < frames; frame += block) h.step(input);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  reports.push({
    scenario: name,
    audioSeconds: 20,
    medianMs: Math.round(times[2]),
    realtimePercent: +(times[2] / 200).toFixed(2),
  });
}
console.log(
  JSON.stringify(
    { node: process.version, platform: process.platform, reports },
    null,
    2,
  ),
);
