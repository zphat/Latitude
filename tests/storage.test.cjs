const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  RecordingStore,
  TRACKS,
  wavHeader,
  repairWav,
  safeName,
} = require("../electron/recording.cjs");
test("WAV header supports float PCM and upgrades to RF64 for long takes", () => {
  const small = wavHeader(96000 * 4, 1);
  assert.equal(small.toString("ascii", 0, 4), "RIFF");
  assert.equal(small.readUInt16LE(56), 3);
  assert.equal(small.readUInt32LE(76), 384000);
  const large = wavHeader(5 * 1024 ** 3, 2);
  assert.equal(large.toString("ascii", 0, 4), "RF64");
  assert.equal(large.readBigUInt64LE(28), BigInt(5 * 1024 ** 3));
});
test("file naming strips path traversal and reserved characters", () => {
  assert.equal(safeName("../../hello:*?"), "....hello");
  assert.equal(safeName("   ..."), "Untitled session");
});
test("disk writing finalizes synchronized tracks and supports interrupted recovery", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "take-test-"));
  const store = new RecordingStore(root);
  try {
    const s = await store.begin({
      name: "A test",
      sampleRate: 48000,
      voice1: true,
      desktop: true,
    });
    await assert.rejects(store.begin({ name: "Duplicate" }));
    const frames = 4096;
    for (const t of TRACKS)
      await store.append(
        s.id,
        t.id,
        new Float32Array(frames * t.channels).buffer,
      );
    await assert.rejects(store.append("wrong", "mix", new ArrayBuffer(8)));
    await store.event(s.id, {
      type: "marker",
      time: 0.02,
      label: 'A "quoted" marker',
    });
    const done = await store.end();
    assert.equal(done.duration, frames / 48000);
    assert.equal((await store.list())[0].markers.length, 1);
    const header = await fs.readFile(path.join(s.dir, "mix.wav"));
    assert.equal(header.readUInt32LE(76), frames * 8);
    const file = path.join(s.dir, "voice1.wav");
    await fs.appendFile(file, Buffer.from([0, 0, 0, 0, 0, 0, 0]));
    assert.equal(await repairWav(file, 1, 48000), frames + 1);
    assert.equal((await fs.stat(file)).size, 80 + (frames + 1) * 4);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("actual FFmpeg export keeps separate audio streams, stems, and editor copies", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "take-export-"));
  const store = new RecordingStore(root);
  const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
  try {
    const s = await store.begin({
      name: "Export proof",
      sampleRate: 48000,
      voice1: true,
      voice2: true,
      desktop: true,
      width: 320,
      height: 180,
    });
    for (const [j, t] of TRACKS.entries()) {
      const pcm = new Float32Array(48000 * 3 * t.channels);
      for (let i = 0; i < pcm.length; i++)
        pcm[i] =
          Math.sin(
            (((i / t.channels) | 0) * 2 * Math.PI * (220 + j * 110)) / 48000,
          ) * 0.15;
      await store.append(s.id, t.id, pcm.buffer);
    }
    await store.end();
    execFileSync(binary, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-t",
      "3",
      "-c:v",
      "libvpx",
      "-b:v",
      "200k",
      path.join(s.dir, "capture.webm"),
    ]);
    const result = await store.export(
      s.id,
      { target: -16, normalize: true, editorClips: true },
      binary,
    );
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          path.join(result.dir, "Recording.mp4"),
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(
      probe.streams.filter((s) => s.codec_type === "audio").length,
      4,
    );
    assert.equal(probe.streams[0].codec_name, "h264");
    for (const name of [
      "Voice 1.wav",
      "Voice 2.wav",
      "Desktop.wav",
      "Voice 1 original.wav",
      "Voice 1 only.mp4",
      "Desktop only.mp4",
      "Audio report.json",
      "Markers.csv",
    ])
      assert.ok((await fs.stat(path.join(result.dir, name))).size > 0, name);
    assert.ok(Math.abs(Number(result.report.measuredLUFS) + 16) < 1);
    assert.ok(Number(result.report.truePeakDBTP) < 0);
    const iso = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          path.join(result.dir, "Voice 1 only.mp4"),
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(iso.streams.filter((s) => s.codec_type === "audio").length, 1);
    for (const stream of probe.streams)
      assert.ok(Math.abs(Number(stream.duration) - 3) < 0.05);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("silent interrupted sessions repair and export without invalid loudness values", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "take-recovery-"));
  const store = new RecordingStore(root);
  const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
  try {
    const s = await store.begin({
      name: "Silent screen take",
      sampleRate: 48000,
      voice1: false,
      voice2: false,
      desktop: false,
      width: 160,
      height: 90,
    });
    await store.append(s.id, "mix", new Float32Array(48000 * 2).buffer);
    // Simulate a process exit: handles close, but headers/manifest never finalize.
    for (const h of Object.values(store.active.handles)) await h.close();
    store.active = null;
    execFileSync(binary, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=size=160x90:rate=30",
      "-t",
      "1",
      "-c:v",
      "libvpx",
      path.join(s.dir, "capture.webm"),
    ]);
    const recovered = new RecordingStore(root);
    assert.equal((await recovered.list())[0].status, "interrupted");
    const out = await recovered.export(
      s.id,
      { target: -16, normalize: true },
      binary,
    );
    assert.equal(out.report.duration, 1);
    assert.equal(out.report.tracks.length, 1);
    assert.equal(out.report.measuredLUFS, "-inf");
    assert.equal(
      (await fs.readFile(path.join(s.dir, "mix.wav"))).readUInt32LE(76),
      48000 * 8,
    );
    const again = await recovered.export(s.id, { normalize: false }, binary);
    assert.notEqual(again.dir, out.dir);
    assert.ok((await fs.stat(path.join(out.dir, "Recording.mp4"))).size > 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("failed final metadata write releases the recorder and preserves finalized WAV data", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-finalize-"));
  const store = new RecordingStore(dir);
  try {
    const s = await store.begin({
      name: "Finalization failure",
      sampleRate: 48000,
    });
    await store.append(s.id, "mix", new Float32Array(960).buffer);
    store.saveManifest = async () => {
      throw Error("Simulated metadata write failure");
    };
    await assert.rejects(store.end(), /Simulated metadata/);
    assert.equal(store.active, null);
    const data = await fs.readFile(path.join(s.dir, "mix.wav"));
    assert.equal(data.length, 3920);
    assert.equal(data.readUInt32LE(76), 3840);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
