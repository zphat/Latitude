// Accelerated AudioWorklet soak. No devices, video, IPC or disk are simulated.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import harness from "../tests/worklet-harness.cjs";
const minutes = Number(process.env.LATITUDE_SOAK_MINUTES || 90);
assert.ok(Number.isFinite(minutes) && minutes >= 1 && minutes <= 180);
const sr = 48000, block = 128, frames = Math.floor(minutes * 60 * sr / block) * block;
const h = await harness(undefined, sr), counts = Array(6).fill(0), peaks = Array(6).fill(0);
const channels = [1, 1, 2, 2, 1, 1];
let liveFrames = 0, chunks = 0, expectedLive = 0;
const startMemory = process.memoryUsage();
let maxRSS = startMemory.rss, maxBuffers = startMemory.arrayBuffers;
h.processor.port.postMessage = (m) => {
  if (m.type === "pcm") {
    chunks++;
    m.data.forEach((data, track) => {
      counts[track] += data.length / channels[track];
      // Sample each packet; exhaustive ceiling checks live in unit tests.
      for (let i = 0; i < data.length; i += 127) {
        assert.ok(Number.isFinite(data[i]));
        peaks[track] = Math.max(peaks[track], Math.abs(data[i]));
        if (track < 4) assert.ok(Math.abs(data[i]) <= h.dsp.dbToGain(-1.5) + 1e-6);
      }
    });
  } else if (m.type === "live-pcm") {
    assert.equal(m.frame, expectedLive);
    liveFrames += m.data.length / 2;
    expectedLive = m.frame + m.data.length / 2;
  }
};
for (let i = 0; i < 2; i++) h.send({type:"voice", index:i, settings:h.dsp.PRESETS.broadcast});
h.send({type:"desktop", settings:{duck:true}});
h.send({type:"start", frame:0});
h.send({type:"live-start", id:"soak", frame:0});
const signals = [0, 0.02, 0.18, 1.2, 0.2].map((amplitude, mode) =>
  Float32Array.from({length:block}, (_, i) => amplitude * Math.sin(i * (mode === 4 ? 0.85 : 0.045))));
const desktop = Float32Array.from({length:block}, (_, i) => 0.12 * Math.sin(i * 0.07));
const pauseAt = Math.floor(frames / 2 / block) * block, pauseFrames = sr * 2;
const started = performance.now();
for (let frame = 0; frame < frames; frame += block) {
  if (frame === pauseAt) h.send({type:"pause", frame});
  if (frame === pauseAt + pauseFrames) h.send({type:"resume", frame});
  const mode = Math.floor(frame / sr) % signals.length;
  if (frame % (sr * 60) === 0) {
    h.send({type:"voice", index:1, settings:{bypass:(frame / (sr * 60)) % 2 === 1}});
    const memory = process.memoryUsage();
    maxRSS = Math.max(maxRSS, memory.rss);
    maxBuffers = Math.max(maxBuffers, memory.arrayBuffers);
    console.error(`Audio clock: ${Math.round(frame / sr / 60)}/${minutes} minutes`);
  }
  h.step([[signals[mode]], mode === 0 ? [] : [signals[(mode + 1) % signals.length]], [desktop, desktop]]);
}
h.send({type:"stop", frame:frames});
h.send({type:"live-stop", id:"soak"});
h.step();
assert.ok(counts.every(n => n === frames - pauseFrames), JSON.stringify(counts));
assert.equal(liveFrames, Math.floor(frames / 2048) * 2048);
assert.ok(maxBuffers - startMemory.arrayBuffers < 64 * 1024 * 1024);
assert.ok(maxRSS - startMemory.rss < 256 * 1024 * 1024);
console.log(JSON.stringify({result:"passed", audioMinutes:minutes, elapsedSeconds:+((performance.now()-started)/1000).toFixed(2), recordedFrames:counts, completeLiveFrames:liveFrames, pcmChunks:chunks, sampledPeaks:peaks, maxSampledArrayBufferGrowthMiB:+((maxBuffers-startMemory.arrayBuffers)/1048576).toFixed(2), maxSampledRSSGrowthMiB:+((maxRSS-startMemory.rss)/1048576).toFixed(2), scope:"Accelerated worklet clock only; no capture, IPC, disk, video or real microphone. Partial live tail excluded."},null,2));
