// Integration test against a real PulseAudio-compatible server, not a mock.
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const path = require("node:path");
const { LinuxAudio } = require("../electron/linux-audio.cjs");
const pactl = (...args) => execFileSync("pactl", args, { encoding: "utf8" }).trim();
const bridge = new LinuxAudio(path.resolve("vendor/latitude-audio"));
const modules = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  modules.push(pactl("load-module", "module-null-sink", "sink_name=latitude_test_a", "rate=48000", "channels=2"));
  modules.push(pactl("load-module", "module-null-sink", "sink_name=latitude_test_b", "rate=48000", "channels=2"));
  pactl("set-default-sink", "latitude_test_a");
  pactl("set-default-source", "latitude_test_a.monitor");
  const beforeSink = pactl("get-default-sink"), beforeSource = pactl("get-default-source");
  const outputs = await bridge.outputs();
  assert.ok(outputs.some(o => o.name === "latitude_test_a" && o.isDefault));
  assert.ok(outputs.some(o => o.name === "latitude_test_b" && !o.isDefault));
  const source = await bridge.connect("latitude_test_b");
  assert.deepEqual(await bridge.connect("latitude_test_b"), source, "Reuse one bridge for one output");
  assert.equal(pactl("get-default-sink"), beforeSink);
  assert.equal(pactl("get-default-source"), beforeSource, "Never switch the user's microphone");
  assert.ok(pactl("list", "short", "sources").includes(source.label));
  const capture = spawn("parec", ["--device", source.label, "--format=float32le", "--rate=48000", "--channels=2"], { stdio: ["ignore", "pipe", "pipe"] });
  const chunks = []; let bytes = 0;
  capture.stdout.on("data", b => { bytes += b.length; if (bytes < 8e6) chunks.push(b); });
  capture.stderr.on("data", () => {});
  const closed = new Promise(resolve => capture.once("close", resolve));
  await wait(300);
  const samples = Buffer.alloc(48000 * 3 * 8);
  for (let i = 0; i < 48000 * 3; i++) {
    samples.writeFloatLE(Math.sin(i * 2 * Math.PI * 500 / 48000) * 0.2, i * 8);
    samples.writeFloatLE(Math.sin(i * 2 * Math.PI * 1000 / 48000) * 0.1, i * 8 + 4);
  }
  const player = spawn("paplay", ["--device=latitude_test_b", "--raw", "--format=float32le", "--rate=48000", "--channels=2"]);
  player.stdin.end(samples);
  assert.equal(await new Promise(resolve => player.once("close", resolve)), 0);
  await wait(300);
  capture.kill("SIGTERM"); await closed;
  const pcm = Buffer.concat(chunks);
  let peakL = 0, peakR = 0, sumL = 0, sumR = 0;
  for (let i = 0; i + 8 <= pcm.length; i += 8) {
    const l = pcm.readFloatLE(i), r = pcm.readFloatLE(i + 4);
    assert.ok(Number.isFinite(l) && Number.isFinite(r));
    peakL = Math.max(peakL, Math.abs(l)); peakR = Math.max(peakR, Math.abs(r)); sumL += l*l; sumR += r*r;
  }
  assert.ok(peakL > 0.15 && peakL < 0.23, `Left channel amplitude ${peakL}`);
  assert.ok(peakR > 0.07 && peakR < 0.12, `Right channel amplitude ${peakR}`);
  assert.ok(sumL / sumR > 3.8 && sumL / sumR < 4.2, "Stereo channels stay independent");
  await bridge.stop();
  assert.ok(!pactl("list", "short", "sources").includes(source.label), "Temporary source removed");
  await assert.rejects(bridge.connect("latitude_missing_output"));
  const again = await bridge.connect("default");
  await bridge.stop();
  assert.ok(!pactl("list", "short", "sources").includes(again.label));
  // Killing the parent closes stdin; simulate that separately from normal stop.
  const label = "latitude_desktop_crashtest";
  const child = spawn(path.resolve("vendor/latitude-audio"), ["bridge", "default", label]);
  child.stderr.on("data", () => {});
  await new Promise((resolve, reject) => { child.stdout.once("data", resolve); child.once("error", reject); child.once("exit", code => { if (code) reject(Error(`Helper exited ${code}`)); }); });
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.stdin.end();
  assert.equal(await exited, 0);
  assert.ok(!pactl("list", "short", "sources").includes(label));
  console.log(JSON.stringify({ passed: true, server: pactl("info").split("\n").find(l => l.includes("Server Name")), pcmBytes: pcm.length, peakL, peakR, energyRatio: sumL/sumR }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await bridge.stop();
  for (const id of modules.reverse()) { try { pactl("unload-module", id); } catch {} }
});
