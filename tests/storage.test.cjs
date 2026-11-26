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
test("simultaneous starts create one take and export cannot overlap recording", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-race-"));
  const store = new RecordingStore(root);
  try {
    const starts = await Promise.allSettled([
      store.begin({ name: "One" }),
      store.begin({ name: "Two" }),
    ]);
    assert.equal(starts.filter((x) => x.status === "fulfilled").length, 1);
    await assert.rejects(
      store.export("another-take", {}, "ffmpeg"),
      /Stop the recording/,
    );
    const [one, two] = await Promise.all([store.end(), store.end()]);
    assert.equal(one.id, two.id);
    store.exporting = true;
    await assert.rejects(
      store.begin({ name: "While exporting" }),
      /cancel the export/,
    );
  } finally {
    await store.end();
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("canceling export preserves originals and earlier exports", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-cancel-"));
  const store = new RecordingStore(root);
  try {
    const take = await store.begin({ name: "Cancel test", sampleRate: 48000 });
    await store.append(take.id, "mix", new Float32Array(96000).buffer);
    await store.end();
    const before = await fs.readFile(path.join(take.dir, "mix.wav"));
    await fs.mkdir(path.join(take.dir, "Export"));
    await fs.writeFile(
      path.join(take.dir, "Export", "keep.txt"),
      "Earlier export",
    );
    await assert.rejects(
      store.export(
        take.id,
        {},
        process.env.TAKE_FFMPEG || require("ffmpeg-static"),
        () => store.cancelExport(),
      ),
      /canceled/,
    );
    assert.equal(store.exporting, false);
    assert.deepEqual(await fs.readFile(path.join(take.dir, "mix.wav")), before);
    assert.equal(
      await fs.readFile(path.join(take.dir, "Export", "keep.txt"), "utf8"),
      "Earlier export",
    );
    await assert.rejects(fs.stat(path.join(take.dir, "Export 2")), {
      code: "ENOENT",
    });
    assert.equal((await store.list())[0].status, "recorded");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("cancel waits for the encoder process to close", async () => {
  const { runFFmpeg } = require("../electron/recording.cjs");
  const controller = new AbortController();
  const started = Date.now();
  const operation = runFFmpeg(
    process.env.TAKE_FFMPEG || require("ffmpeg-static"),
    [
      "-re",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "60",
      "-f",
      "null",
      "-",
    ],
    undefined,
    controller.signal,
  );
  const timer = setTimeout(() => controller.abort(), 150);
  try {
    await assert.rejects(operation, /canceled/);
    assert.ok(Date.now() - started < 5000);
  } finally {
    clearTimeout(timer);
  }
});
test("a zero-byte disk write fails instead of looping forever", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-zero-"));
  const store = new RecordingStore(root);
  try {
    const take = await store.begin({ name: "Disk failure" });
    store.active.handles.mix.write = async () => ({ bytesWritten: 0 });
    await assert.rejects(
      store.append(take.id, "mix", new ArrayBuffer(8)),
      /stopped accepting/,
    );
    assert.equal((await store.end()).status, "interrupted");
  } finally {
    await store.end();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a failed marker checkpoint does not poison the final save, and Stop drains only accepted chunks", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-checkpoint-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new RecordingStore(root), s = await store.begin({ name: "Interview" });
  const temp = path.join(s.dir, "session.json.tmp");
  await fs.mkdir(temp);
  await assert.rejects(store.event(s.id, { type: "marker", time: 0, label: "Opening" }));
  await fs.rmdir(temp);
  const pending = store.append(s.id, "mix", new Float32Array(64).buffer);
  const stop = store.end();
  await assert.rejects(store.append(s.id, "mix", new Float32Array(64).buffer), /no longer active/);
  await store.event(s.id, { type: "marker", time: 9, label: "Too late" });
  await pending;
  const saved = await stop;
  assert.equal(saved.status, "recorded");
  assert.equal(saved.duration, 32 / 48000);
  const [persisted] = await store.list();
  assert.deepEqual(persisted.markers.map(m => m.label), ["Opening"]);
});

test("a missing or shortened isolated track never reports a clean recording; intact tracks still finalize", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-finalize-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const missing of [false, true]) {
    const store = new RecordingStore(root), s = await store.begin({ voice1: true, desktop: true });
    await store.append(s.id, "voice1", new Float32Array(64).buffer);
    await store.append(s.id, "mix", new Float32Array(128).buffer);
    const file = path.join(s.dir, "voice1.wav");
    if (missing) { await store.active.handles.voice1.close(); await fs.unlink(file); }
    else await fs.truncate(file, 80 + 32 * 4);
    const saved = await store.end();
    assert.equal(saved.status, "interrupted");
    assert.match(saved.error, /Voice 1/i);
    assert.equal((await store.resolve(s.id)).status, "interrupted");
    assert.equal((await fs.readFile(path.join(s.dir, "mix.wav"))).readUInt32LE(76), 128 * 4);
  }
});

test("a damaged date or unrelated manifest cannot hide other takes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-list-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new RecordingStore(root), s = await store.begin({}); await store.end();
  for (const [dir, meta] of [["legacy", { id: "legacy", name: "Recover me", created: 4, status: "recorded" }], ["unrelated", { created: null }]]) {
    await fs.mkdir(path.join(root, dir));
    await fs.writeFile(path.join(root, dir, "session.json"), JSON.stringify(meta));
  }
  const list = await store.list();
  assert.deepEqual(new Set(list.map(m => m.id)), new Set([s.id, "legacy"]));
  assert.ok(Number.isFinite(Date.parse(list.find(m => m.id === "legacy").created)));
  assert.equal(JSON.parse(await fs.readFile(path.join(root, "legacy", "session.json"))).created, 4);
});

test("odd-length 24-bit mono stems have a zero RIFF pad, correct sample count and idempotent recovery", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-riff-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new RecordingStore(root), s = await store.begin({ audioBitDepth: 24, voice1: true });
  const file = path.join(s.dir, "voice1.wav");
  await store.append(s.id, "voice1", Float32Array.of(0.25, -0.25, 0.5).buffer); await store.end();
  const bytes = await fs.readFile(file);
  assert.equal(bytes.length, 90); assert.equal(bytes.readUInt32LE(4), 82);
  assert.equal(bytes.readUInt32LE(76), 9); assert.equal(bytes[89], 0);
  assert.equal(await repairWav(file, 1, 48000, 24), 3);
  assert.deepEqual(await fs.readFile(file), bytes);
  const rfBytes = 0x100000001 + 4; // divisible by three and odd
  const header = wavHeader(rfBytes, 1, 48000, 24);
  assert.equal(header.readBigUInt64LE(20), BigInt(rfBytes + 73));
  assert.equal(header.readBigUInt64LE(28), BigInt(rfBytes));
  assert.equal(header.readBigUInt64LE(36), BigInt(rfBytes / 3));
});

test("mix-only export leaves intact originals untouched and does not require an unused or damaged stem", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-preserve-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new RecordingStore(root), s = await store.begin({ voice1: true, audioBitDepth: 24 });
  await store.append(s.id, "mix", new Float32Array(48000).buffer);
  await store.append(s.id, "voice1", new Float32Array(24000).buffer);
  await store.end();
  const mix = path.join(s.dir, "mix.wav"), old = new Date("2020-05-05T01:00:00Z");
  await fs.utimes(mix, old, old); const original = await fs.readFile(mix);
  await fs.unlink(path.join(s.dir, "voice1.wav"));
  const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
  const options = { format: "flac", normalize: false, separateTracks: false };
  const ok = await store.export(s.id, options, binary);
  assert.deepEqual(ok.report.tracks, ["Full mix"]);
  assert.equal((await fs.stat(mix)).mtimeMs, old.getTime()); assert.deepEqual(await fs.readFile(mix), original);
  await assert.rejects(store.export(s.id, { ...options, separateTracks: true }, binary), /prepare Voice 1/);
  assert.equal((await store.resolve(s.id)).exports.length, 1, "a failed isolated export leaves the good mix alone");
});
