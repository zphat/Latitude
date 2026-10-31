const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { RecordingStore, TRACKS } = require("../electron/recording.cjs");
const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");

function decode(file, stream = 0) {
  return execFileSync(
    binary,
    [
      "-v",
      "error",
      "-i",
      file,
      "-map",
      `0:a:${stream}`,
      "-ac",
      "1",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { maxBuffer: 4 * 1024 ** 2 },
  );
}
function probe(file) {
  // Use the shipped encoder for these tests, so the same suite runs on Windows
  // without downloading a second FFprobe binary.
  const p = spawnSync(
    binary,
    ["-hide_banner", "-i", file, "-map", "0", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  assert.equal(p.status, 0, p.stderr);
  const input = p.stderr.split("Stream mapping:")[0];
  return {
    audio: [...input.matchAll(/Stream #0:\d+[^\n]*Audio: (\w+)/g)].map(
      (m) => m[1],
    ),
    video: [...input.matchAll(/Stream #0:\d+[^\n]*Video: (\w+)/g)].map(
      (m) => m[1],
    ),
    input,
  };
}
function dominant(pcm) {
  // Every source has a distinct test tone. Count central zero crossings to
  // verify actual routing, not just metadata or the number of containers.
  let crossings = 0;
  const start = 4800,
    end = Math.min(24000, pcm.length / 4 - 4800);
  for (let i = start; i < end; i++)
    if (pcm.readFloatLE(i * 4) > 0 && pcm.readFloatLE((i - 1) * 4) <= 0)
      crossings++;
  return (crossings * 48000) / (end - start);
}
async function fixture(rate = 48000) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-formats-"));
  const store = new RecordingStore(root);
  const s = await store.begin({
    name: "Formats",
    sampleRate: rate,
    voice1: true,
    voice2: true,
    desktop: true,
    width: 160,
    height: 90,
    captureMime: "video/webm;codecs=h264,opus",
  });
  for (const [j, track] of TRACKS.entries()) {
    const pcm = new Float32Array(rate * track.channels);
    for (let i = 0; i < pcm.length; i++)
      pcm[i] =
        Math.sin(
          (Math.floor(i / track.channels) * Math.PI * 2 * (220 + j * 110)) /
            rate,
        ) * 0.15;
    await store.append(s.id, track.id, pcm.buffer);
  }
  await store.end();
  execFileSync(binary, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x90:rate=30",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    path.join(s.dir, "capture.mkv"),
  ]);
  return { root, store, s };
}

test("every format exports real separated sources and mix-only files with the shipped codecs", async (t) => {
  const { EXPORT_FORMATS } = await import("../src/export-formats.js");
  const { root, store, s } = await fixture();
  const originals = await fs.readFile(path.join(s.dir, "voice1.wav"));
  try {
    for (const f of EXPORT_FORMATS)
      await t.test(f.label, async () => {
        for (const separateTracks of [true, false]) {
          const progress = [];
          const out = await store.export(
            s.id,
            {
              format: f.id,
              separateTracks,
              editingFiles: false,
              normalize: false,
            },
            binary,
            (p) => progress.push(p.percent),
          );
          const primary = path.join(out.dir, out.file);
          const info = probe(primary);
          const video = f.kind === "video";
          const codec =
            { libopus: "opus", libmp3lame: "mp3" }[f.audio] || f.audio;
          assert.deepEqual(
            info.audio,
            Array(video && separateTracks ? 4 : 1).fill(codec),
          );
          assert.deepEqual(info.video, video ? [f.video] : []);
          assert.equal(out.report.tracks.length, separateTracks ? 4 : 1);
          assert.equal(
            out.report.embeddedAudioTracks,
            video && separateTracks ? 4 : 1,
          );
          assert.equal(await store.playbackPath(s.id), primary);
          assert.ok(
            Math.abs(dominant(decode(primary)) - 550) < 4,
            "full mix must be the first stream",
          );
          if (separateTracks)
            for (const [i, name] of [
              "Voice 1",
              "Voice 2",
              "Desktop",
            ].entries()) {
              const samples = decode(
                video ? primary : path.join(out.dir, `${name}.${f.extension}`),
                video ? i + 1 : 0,
              );
              assert.ok(
                Math.abs(dominant(samples) - (220 + 110 * i)) < 4,
                `${f.id} ${name} routing`,
              );
              assert.ok(
                Math.abs(samples.length / 4 / 48000 - 1) < 0.08,
                "audio duration stays aligned",
              );
            }
          if (video)
            assert.equal(
              out.report.editingFiles.length,
              0,
              "compact export must not write hidden WAV copies",
            );
          for (let i = 1; i < progress.length; i++)
            assert.ok(
              progress[i] >= progress[i - 1],
              `progress went backwards: ${progress}`,
            );
          assert.equal(progress.at(-1), 100);
          await assert.rejects(fs.stat(path.join(out.dir, "INCOMPLETE.txt")), {
            code: "ENOENT",
          });
          assert.deepEqual(
            await fs.readFile(path.join(s.dir, "voice1.wav")),
            originals,
          );
        }
      });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("lossless audio has identical 24-bit samples, and 44.1 kHz sources export to Opus correctly", async () => {
  const { root, store, s } = await fixture(44100);
  try {
    let reference;
    for (const format of ["wav", "flac", "mkv", "mov", "webm"]) {
      const out = await store.export(
        s.id,
        { format, normalize: false, editingFiles: false },
        binary,
      );
      const video = ["mkv", "mov", "webm"].includes(format);
      const pcm = decode(
        path.join(out.dir, video ? out.file : `Voice 1.${format}`),
        video ? 1 : 0,
      );
      if (!reference) reference = pcm;
      if (format !== "webm")
        assert.deepEqual(pcm, reference, `${format} preserves 24-bit samples`);
      else assert.ok(Math.abs(pcm.length / 4 / 48000 - 1) < 0.05);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("non-MP4 editor copies keep their source audio and audio-only recovery needs no video", async () => {
  const { root, store, s } = await fixture();
  try {
    for (const format of ["mkv", "mov", "webm"]) {
      const out = await store.export(
        s.id,
        { format, editorClips: true, editingFiles: false, normalize: true },
        binary,
      );
      const copy = path.join(out.dir, `Voice 2 only.${format}`);
      assert.equal(probe(copy).audio.length, 1);
      assert.ok(Math.abs(dominant(decode(copy)) - 330) < 4);
      assert.ok(Math.abs(Number(out.report.measuredLUFS) + 16) < 1);
      assert.ok(Number(out.report.truePeakDBTP) <= -1);
    }
    await fs.unlink(path.join(s.dir, "capture.mkv"));
    const out = await store.export(
      s.id,
      { format: "flac", editorClips: true, separateTracks: false },
      binary,
    );
    assert.equal(probe(path.join(out.dir, out.file)).audio.length, 1);
    assert.equal(out.report.exportOptions.editorClips, false);
    const before = (await fs.readdir(s.dir)).length;
    await assert.rejects(
      store.export(s.id, { format: "../../bad" }, binary),
      /Unsupported export format/,
    );
    assert.equal((await fs.readdir(s.dir)).length, before);
    assert.equal(store.exporting, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("playback opens legacy MP4 exports and rejects a manifest path outside the take", async () => {
  const store = new RecordingStore("unused");
  const dir = path.resolve(os.tmpdir(), "latitude-playback");
  const m = { id: "one", dir, exports: [{ path: path.join(dir, "Export") }] };
  store.resolve = async () => m;
  assert.equal(
    await store.playbackPath("one"),
    path.join(dir, "Export", "Recording.mp4"),
  );
  m.exports[0].file = "../../outside.mp4";
  await assert.rejects(store.playbackPath("one"), /Invalid recording path/);
});

test("shared video/WAV export keeps normalized stereo, sample-aligned stems and independent raw backups", async () => {
  for (const rate of [44100, 48000]) {
    const { root, store, s } = await fixture(rate);
    try {
      const out = await store.export(s.id, { format: "mp4", normalize: true, editingFiles: true }, binary);
      assert.equal(out.report.embeddedAudioTracks, 4);
      assert.equal(out.report.videoMode, "H.264 stream copy");
      const wav = path.join(out.dir, "Mix.wav");
      assert.match(probe(wav).input, new RegExp(`${rate} Hz, stereo`));
      assert.ok(Math.abs(decode(wav).length / 4 / 48000 - 1) < 0.002);
      assert.ok(Math.abs(dominant(decode(wav)) - 550) < 4);
      assert.ok(Math.abs(Number(out.report.measuredLUFS) + 16) < 1);
      assert.ok(Number(out.report.truePeakDBTP) <= -1);
      const pcm24 = (file) => execFileSync(binary, ["-v", "error", "-i", file,
        "-c:a", "pcm_s24le", "-f", "s24le", "pipe:1"]);
      for (const [id, name] of [["voice1", "Voice 1"], ["voice2", "Voice 2"], ["desktop", "Desktop"]])
        assert.deepEqual(pcm24(path.join(out.dir, `${name}.wav`)), pcm24(path.join(s.dir, `${id}.wav`)));
      const original = await fs.readFile(path.join(s.dir, "raw1.wav"));
      const backup = path.join(out.dir, "Voice 1 original.wav");
      assert.deepEqual(await fs.readFile(backup), original);
      await fs.writeFile(backup, Buffer.from("Edit the copied file"));
      assert.deepEqual(await fs.readFile(path.join(s.dir, "raw1.wav")), original, "editing a backup never changes the original");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  }
});
