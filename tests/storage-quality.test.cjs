const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const { RecordingStore, TRACKS, wavHeader, repairWav } = require("../electron/recording.cjs");
const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
const ff = args => execFileSync(binary, ["-v", "error", "-y", ...args], { maxBuffer: 16 * 1024 ** 2 });

test("24-bit originals preserve synchronized samples and float mic safety copies, including recovery", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-storage-quality-"));
  try {
    for (const rate of [44100, 48000]) {
      const store = new RecordingStore(root);
      const s = await store.begin({ name: "24 bit", sampleRate: rate, audioBitDepth: 24 });
      const input = new Map();
      for (const t of TRACKS) {
        const pcm = new Float32Array(rate * t.channels);
        for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i * 0.03) * (t.id.startsWith("raw") ? 1.2 : 0.2);
        input.set(t.id, pcm);
        await store.append(s.id, t.id, pcm.buffer);
      }
      const m = await store.end(); assert.equal(m.duration, 1);
      for (const t of TRACKS) {
        const file = path.join(s.dir, `${t.id}.wav`), bytes = await fs.readFile(file), raw = t.id.startsWith("raw");
        assert.equal(bytes.length, 80 + rate * t.channels * (raw ? 4 : 3));
        assert.equal(bytes.readUInt16LE(56), raw ? 3 : 1);
        const pcm = input.get(t.id);
        for (let i = 0; i < pcm.length; i += 137) {
          const sample = raw ? bytes.readFloatLE(80 + i * 4) : bytes.readIntLE(80 + i * 3, 3) / 8388608;
          assert.ok(Math.abs(sample - pcm[i]) <= (raw ? 0 : 1 / 8388608));
        }
      }
      await fs.appendFile(path.join(s.dir, "mix.wav"), Buffer.from([1, 2]));
      assert.equal(await repairWav(path.join(s.dir, "mix.wav"), 2, rate, 24), rate);
      ff(["-i", path.join(s.dir, "mix.wav"), "-f", "null", "-"]);
    }
    const b = wavHeader(6 * 1024 ** 3, 2, 48000, 24);
    assert.equal(b.toString("ascii", 0, 4), "RF64");
    assert.equal(b.readBigUInt64LE(36), BigInt(1024 ** 3));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("compression actually re-encodes matching H.264, retains source tracks, and creates sample-exact FLAC stems", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-compression-"));
  try {
    const store = new RecordingStore(root);
    const s = await store.begin({ name: "Size", sampleRate: 48000, audioBitDepth: 24, voice1: true, desktop: true, captureMime: "video/webm;codecs=h264,opus" });
    for (const [n, t] of TRACKS.entries()) {
      const pcm = new Float32Array(48000 * 3 * t.channels);
      for (let i = 0; i < pcm.length; i++) pcm[i] = 0.1 * Math.sin(Math.floor(i / t.channels) * 2 * Math.PI * (220 + n * 110) / 48000);
      await store.append(s.id, t.id, pcm.buffer);
    }
    await store.end();
    const capture = path.join(s.dir, "capture.mkv");
    ff(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=3", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16", "-threads", "2", capture]);
    const original = await fs.readFile(capture);
    const copy = await store.export(s.id, { editingFiles: false, normalize: false }, binary);
    const compressed = await store.export(s.id, { videoCompression: "balanced", audioBitrate: 192, stemFormat: "flac", editingFiles: true, normalize: false }, binary);
    assert.match(copy.report.videoMode, /copy/);
    assert.match(compressed.report.videoMode, /balanced compression/);
    assert.equal(compressed.report.embeddedAudioTracks, 3);
    const source = path.join(s.dir, "voice1.wav"), stem = path.join(compressed.dir, "Voice 1.flac");
    const decode = file => ff(["-i", file, "-f", "s24le", "pipe:1"]);
    assert.deepEqual(decode(source), decode(stem));
    assert.equal(compressed.report.duration, 3);
    const a = (await fs.stat(path.join(copy.dir, copy.file))).size;
    const b = (await fs.stat(path.join(compressed.dir, compressed.file))).size;
    assert.ok(b < a * 0.8, `Synthetic high-bitrate source compresses materially: ${a} -> ${b}`);
    const similarity = spawnSync(binary, ["-hide_banner", "-i", capture, "-i", path.join(compressed.dir, compressed.file), "-lavfi", "[0:v][1:v]ssim", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1024 ** 2 });
    assert.equal(similarity.status, 0, similarity.stderr);
    const ssim = Number(similarity.stderr.match(/All:([\d.]+)/)?.[1]);
    assert.ok(ssim >= 0.97, `Balanced fixture keeps picture similarity: SSIM ${ssim}`);
    assert.deepEqual(await fs.readFile(capture), original);
    const { videoEncoding, exportFormat, exportOptions } = await import("../src/export-formats.js");
    assert.equal(videoEncoding(exportFormat("webm"), "vp9", "balanced", "small").copy, false);
    assert.equal(exportOptions({ audioBitrate: 1, videoCompression: "bad" }).audioBitrate, 256);
    console.log(JSON.stringify({ fixture: "3-second 640x360 testsrc2", originalBytes: a, compressedBytes: b, ssim }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("editor timecode round trips and rejects ambiguous invalid positions", async () => {
  const { timecode, parseTimecode } = await import("../src/mods/editor/timecode.js");
  for (const fps of [24, 30, 60]) for (const n of [0, 1, fps - 1, fps, 123456])
    assert.equal(parseTimecode(timecode(n / fps, fps), fps), n / fps);
  for (const bad of ["", "-1", "no", "00:00:60:00", "00:00:01:30", "1:99"]) assert.equal(parseTimecode(bad, 30), null);
});
