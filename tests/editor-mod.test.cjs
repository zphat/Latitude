const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { EditorStore, parseProbe } = require("../electron/editor.cjs");
const model = import("../src/mods/editor/model.js");
const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
const ff = (args) =>
  execFileSync(binary, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
const probe = (file) => {
  let log = "";
  try {
    execFileSync(binary, ["-hide_banner", "-i", file], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    log = e.stderr.toString();
  }
  const data = parseProbe(log, file);
  return {
    streams: [
      ...(data.kind === "video" ? [{ codec_type: "video" }] : []),
      ...Array.from({ length: data.audio }, () => ({ codec_type: "audio" })),
    ],
    format: { duration: data.duration },
  };
};
const pcm = (file, stream = 0) =>
  ff([
    "-i",
    file,
    "-map",
    `0:a:${stream}`,
    "-ac",
    "1",
    "-ar",
    "8000",
    "-f",
    "f32le",
    "pipe:1",
  ]);
function stats(bytes) {
  let peak = 0,
    square = 0,
    crossings = 0,
    previous = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const v = bytes.readFloatLE(i);
    assert.ok(Number.isFinite(v));
    peak = Math.max(peak, Math.abs(v));
    square += v * v;
    if (v >= 0 && previous < 0) crossings++;
    previous = v;
  }
  return {
    peak,
    rms: Math.sqrt(square / (bytes.length / 4)),
    frequency: crossings / (bytes.length / 4 / 8000),
  };
}
async function fixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "latitude-editor-test-"),
  );
  const source = path.join(root, "host's original.mkv"),
    audio = path.join(root, "music.wav"),
    image = path.join(root, "image.png");
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=160x90:r=30:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=48000:duration=3",
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-map",
    "2:a",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "pcm_s16le",
    source,
  ]);
  ff([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:sample_rate=48000:duration=3",
    audio,
  ]);
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=80x80",
    "-frames:v",
    "1",
    "-threads",
    "1",
    image,
  ]);
  const store = new EditorStore({
    ffmpeg: binary,
    profile: path.join(root, "profile"),
  });
  const imported = await store.importFiles([source, audio, image]);
  assert.equal(imported.errors.length, 0);
  const m = await model;
  let p = m.newProject();
  p.format = "compact";
  p.normalize = false;
  p.assets = imported.items;
  p = m.addClip(p, p.assets[0], p.tracks[0].id, 0);
  p = m.addClip(p, p.assets[1], p.tracks[1].id, 0);
  return {
    root,
    source,
    audio,
    image,
    store,
    p,
    m,
    cleanup: async () => {
      await store.dispose();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

test("editor schema rejects executable/invalid data and bounds frame-grid geometry", async () => {
  const m = await model,
    p = m.newProject();
  const t = m.newTrack("video");
  p.tracks.push(t);
  let q = m.addClip(p, null, t.id, 0);
  q.clips[0].text = "<script>still just text</script>";
  q.clips[0].x = 99;
  q.clips[0].crop = { x: 0.99, y: 0, w: 1, h: 1 };
  q = m.sanitize(q);
  assert.equal(q.clips[0].x, 1);
  assert.ok(q.clips[0].crop.x + q.clips[0].crop.w <= 1);
  assert.equal(q.clips[0].text, "<script>still just text</script>");
  assert.throws(() => m.sanitize({ ...q, version: 2 }));
  assert.throws(() =>
    m.sanitize({
      ...q,
      clips: [{ ...q.clips[0], asset: "missing", kind: "video" }],
    }),
  );
  assert.throws(() => m.sanitize({ ...q, tracks: [t, t] }));
  assert.equal(q.clips[0].duration, 5);
});
test("linked splits and global ripple cuts retain audio sync, fades and marker timing", async () => {
  const m = await model,
    p = m.newProject(),
    asset = {
      id: m.uid(),
      kind: "video",
      name: "Take",
      duration: 20,
      audio: 1,
    },
    group = m.uid();
  p.assets = [asset];
  p.clips = p.tracks.map((t) => ({
    id: m.uid(),
    track: t.id,
    asset: asset.id,
    kind: "video",
    group,
    start: 0,
    in: 0,
    duration: 20,
    audioIn: 0.2,
    audioOut: 0.2,
  }));
  const q = m.ripple(m.sanitize(p), 4, 7);
  assert.equal(m.duration(q), 17);
  for (const t of q.tracks) {
    const clips = q.clips
      .filter((c) => c.track === t.id)
      .sort((a, b) => a.start - b.start);
    assert.equal(clips[0].duration, 4);
    assert.equal(clips[1].in, 7);
    assert.equal(clips[1].start, 4);
    assert.equal(clips[1].audioIn, 0.004);
  }
  assert.equal(m.selectedGroup(q, q.clips[0].id).length, 2);
  assert.equal(p.clips.length, 2);
  q.tracks[0].locked = true;
  assert.throws(() => m.ripple(q, 0, 2), /Unlock/);
});
test("history restores project states and snap uses clip edges", async () => {
  const m = await model,
    p = m.newProject();
  const q = m.addClip(p, null, p.tracks[0].id, 0),
    h = new m.History(q);
  const next = structuredClone(q);
  next.clips[0].start = 3;
  h.commit(next);
  assert.equal(h.undo().clips[0].start, 0);
  assert.equal(h.redo().clips[0].start, 3);
  assert.equal(m.snap(q, 4.95, [], 0.1), 5);
  const seg = m.segments({ ...q, clips: [{ ...q.clips[0], duration: 65 }] });
  assert.deepEqual(
    seg.map((x) => x.duration),
    [30, 30, 5],
  );
});
test("probe identifies images and multiple audio tracks without a bundled ffprobe dependency", () => {
  const result = parseProbe(
    "Duration: 00:01:02.50\n Stream #0:0: Video: h264, yuv420p, 1920x1080 [SAR 1:1]\n Stream #0:1: Audio: aac\n Stream #0:2: Audio: pcm_s16le",
    "movie.mkv",
  );
  assert.equal(result.duration, 62.5);
  assert.equal(result.audio, 2);
  assert.equal(result.width, 1920);
  assert.throws(
    () => parseProbe("Duration: N/A\n Stream #0:0: Video: h264", "file.mkv"),
    /known duration/,
  );
});
test("real editor export preserves layers, selected source audio, range timing, original files and separate stems", async () => {
  const f = await fixture();
  try {
    let { p, m } = f;
    const before = await fs.readFile(f.source);
    p.clips[0].audio = 1;
    p.clips[0].gain = 12;
    p.clips[1].gain = -12;
    p.clips[1].audioIn = 0.3;
    p.clips[1].audioOut = 0.3;
    const overlay = m.newTrack("video", "Screenshot");
    p.tracks.push(overlay);
    p = m.addClip(p, p.assets[2], overlay.id, 0);
    Object.assign(p.clips.at(-1), {
      duration: 3,
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.5,
      fit: "cover",
      fadeIn: 0.25,
    });
    p.range = { in: 0.5, out: 1.5 };
    const out = await f.store.export(
      p,
      { format: "mp4", separate: true, range: true },
      f.root,
      {},
    );
    const meta = probe(out.file);
    assert.equal(
      meta.streams.filter((s) => s.codec_type === "audio").length,
      3,
    );
    assert.ok(Math.abs(Number(meta.format.duration) - 1) < 0.08);
    const encoded = pcm(out.file, 1);
    // AAC padding and low-level edge ringing vary between encoder builds.
    // Measure pitch in the steady signal, but retain the full-file peak check.
    const dominant = stats(encoded.subarray(800 * 4, -800 * 4));
    assert.ok(Math.abs(dominant.frequency - 880) < 5, JSON.stringify(dominant));
    assert.ok(stats(encoded).peak <= 0.86);
    const stem = (await fs.readdir(out.folder)).find((name) =>
      name.startsWith("Audio-1-") && name.endsWith(".wav"),
    );
    assert.ok(stem, "The selected source also exports a lossless stem");
    const isolated = pcm(path.join(out.folder, stem));
    assert.ok(Math.abs(isolated.length / 4 / 8000 - 1) < 0.02);
    assert.ok(Math.abs(stats(isolated).frequency - 880) < 2);
    const pixel = ff([
      "-ss",
      "0.5",
      "-i",
      out.file,
      "-vf",
      "crop=2:2:1000:600,format=rgb24",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    assert.ok(
      pixel[0] > 200 && pixel[2] < 40,
      `overlay pixel ${[...pixel.slice(0, 3)]}`,
    );
    assert.equal(
      (await fs.readdir(out.folder)).filter((n) => n.endsWith(".wav")).length,
      2,
    );
    assert.deepEqual(await fs.readFile(f.source), before);
    assert.ok(stats(pcm(out.file)).peak <= 1);
    assert.match(out.report.encodedTruePeak, /Peak:/);
    assert.equal(
      (await fs.readdir(f.root)).filter((n) => n.startsWith(".latitude-edit-"))
        .length,
      0,
    );
  } finally {
    await f.cleanup();
  }
});
test("saved edit and autosaved draft restore missing media with relink, never rewrite sources", async () => {
  const f = await fixture();
  try {
    const file = path.join(f.root, "podcast.latitude-edit");
    await f.store.save(f.p, file);
    await f.store.draft(f.p);
    assert.equal((await f.store.draftInfo()).name, "Untitled edit");
    const other = new EditorStore({
      ffmpeg: binary,
      profile: path.join(f.root, "other"),
    });
    const opened = await other.open(file);
    assert.equal(opened.project.clips.length, 2);
    await fs.rename(f.audio, f.audio + ".bak");
    const missing = await other.open(file);
    assert.equal(missing.project.assets.filter((a) => a.missing).length, 1);
    await fs.rename(f.audio + ".bak", f.audio);
    const relinked = await other.relink(f.p.assets[1].id, f.audio);
    assert.equal(relinked.kind, "audio");
    await other.dispose();
  } finally {
    await f.cleanup();
  }
});
test("waveforms and selected-track previews are bounded and cancel removes unfinished exports", async () => {
  const f = await fixture();
  try {
    const peaks = await f.store.waveform(f.p.assets[0].id, 1);
    assert.equal(peaks.length, 4096);
    assert.ok(peaks.some((p) => p > 0.05));
    const preview = await f.store.prepare(f.p.assets[0].id, 1, false);
    assert.ok(
      f.store.mediaPath(new URL(preview.url).pathname.split("/").at(-1)),
    );
    assert.equal(f.store.mediaPath("../../anything"), null);
    f.store.onProgress = (s) => {
      if (s.percent === 0) f.store.cancel();
    };
    await assert.rejects(
      f.store.export(f.p, { format: "mkv" }, f.root, {}),
      /Canceled/,
    );
    assert.equal(f.store.busy, false);
    assert.equal(
      (await fs.readdir(f.root)).filter((n) => n.startsWith(".latitude-edit-"))
        .length,
      0,
    );
  } finally {
    await f.cleanup();
  }
});
test("audio-only mix stays continuous across bounded render segments and loudness normalization", async () => {
  const f = await fixture();
  try {
    const source = path.join(f.root, "long.wav");
    ff([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:sample_rate=48000:duration=31.2",
      source,
    ]);
    const result = await f.store.importFiles([source]);
    let p = f.m.newProject();
    p.assets = result.items;
    p = f.m.addClip(p, p.assets[0], p.tracks[1].id, 0);
    const out = await f.store.export(p, { format: "wav" }, f.root, {});
    const meta = probe(out.file);
    assert.equal(meta.streams.length, 1);
    assert.ok(Math.abs(Number(meta.format.duration) - 31.2) < 0.02);
    const level = stats(pcm(out.file));
    assert.ok(level.peak < 0.85 && level.rms > 0.05);
    assert.match(out.report.encodedTruePeak, /Peak:/);
  } finally {
    await f.cleanup();
  }
});

test("inserting an ad, detaching and pasting preserve linked offsets and respect locks", async () => {
  const m = await model;
  let p = m.newProject();
  p.assets = [
    { id: m.uid(), kind: "video", name: "Interview", duration: 20, audio: 1 },
  ];
  p = m.addClip(p, p.assets[0], p.tracks[0].id, 0);
  p = m.detachAudio(p, p.clips[0].id);
  assert.equal(p.clips[0].mute, true);
  assert.equal(p.clips[1].kind, "audio");
  assert.equal(m.selectedGroup(p, p.clips[0].id).length, 2);
  p.markers = [{ time: 8, name: "Chapter" }];
  const q = m.insertSpace(p, 5, 3);
  assert.equal(m.duration(q), 23);
  assert.equal(q.markers[0].time, 11);
  const right = q.clips.filter((c) => c.start === 8);
  assert.equal(right.length, 2);
  assert.deepEqual(
    right.map((c) => c.in),
    [5, 5],
  );
  assert.equal(right[0].group, right[1].group);
  const pasted = m.pasteClips(q, right, 23);
  assert.deepEqual(
    pasted.clips.slice(-2).map((c) => c.start),
    [23, 23],
  );
  assert.notEqual(pasted.clips.at(-1).group, right[0].group);
  q.tracks[0].locked = true;
  assert.throws(() => m.insertSpace(q, 0, 2), /Unlock/);
  assert.throws(() => m.pasteClips(q, right, 0), /locked/);
  assert.throws(() => m.addClip(q, q.assets[0], q.tracks[0].id, 0), /unlocked/);
});
test("simultaneous layers and history have explicit resource bounds", async () => {
  const m = await model;
  let p = m.newProject();
  for (let i = 0; i < 8; i++) p = m.addClip(p, null, p.tracks[0].id, 0);
  assert.throws(
    () => m.addClip(structuredClone(p), null, p.tracks[0].id, 0),
    /at most 8/,
  );
  const q = m.addClip(structuredClone(p), null, p.tracks[0].id, 5);
  assert.equal(q.clips.length, 9);
  const h = new m.History(q);
  for (let i = 0; i < 90; i++) h.commit({ ...q, name: `Edit ${i}` });
  assert.ok(h.undoStack.length <= 60);
  assert.equal(h.undo().name, "Edit 88");
});
test("local media server serves real bounded byte ranges and rejects invalid ranges", async () => {
  const { mediaResponse } = require("../electron/editor-media.cjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-range-")),
    file = path.join(root, "sample.mp4");
  try {
    await fs.writeFile(file, "0123456789");
    const request = (range, method = "GET") =>
      new Request("https://local/media", {
        method,
        headers: range ? { Range: range } : {},
      });
    let response = await mediaResponse(request("bytes=3-5"), file);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Content-Range"), "bytes 3-5/10");
    assert.equal(await response.text(), "345");
    response = await mediaResponse(request("bytes=-3"), file);
    assert.equal(await response.text(), "789");
    response = await mediaResponse(request("bytes=8-99"), file);
    assert.equal(await response.text(), "89");
    response = await mediaResponse(request(undefined, "HEAD"), file);
    assert.equal(response.headers.get("Content-Length"), "10");
    assert.equal(await response.text(), "");
    for (const range of [
      "bytes=10-",
      "bytes=4-2",
      "bytes=-0",
      "bytes=0-1,5-6",
      "bytes=foo-",
    ])
      assert.equal((await mediaResponse(request(range), file)).status, 416);
    assert.equal(
      (await mediaResponse(request(undefined, "POST"), file)).status,
      405,
    );
    assert.equal(
      (await mediaResponse(request(), file + "missing")).status,
      404,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("dialogue compression stays continuous across render sections and isolated stems", async () => {
  const f = await fixture();
  try {
    const source = path.join(f.root, "voice.wav");
    ff([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:sample_rate=48000:duration=31.2",
      "-af",
      "volume=5",
      source,
    ]);
    const imported = await f.store.importFiles([source]);
    let p = f.m.newProject();
    p.assets = imported.items;
    p.normalize = false;
    p = f.m.addClip(p, p.assets[0], p.tracks[1].id, 0);
    p.tracks[1].voice = true;
    p.tracks[1].pan = 0.3;
    const out = await f.store.export(p, { format: "wav" }, f.root, {});
    const samples = pcm(out.file),
      before = stats(
        samples.subarray(
          Math.floor(29.8 * 8000) * 4,
          Math.floor(29.9 * 8000) * 4,
        ),
      ),
      after = stats(
        samples.subarray(30 * 8000 * 4, Math.floor(30.1 * 8000) * 4),
      );
    assert.ok(
      Math.abs(20 * Math.log10(after.rms / before.rms)) < 0.1,
      JSON.stringify({ before, after }),
    );
    assert.equal(out.report.normalized, false);
    // Exercise the same continuous path with embedded stems over a short range.
    p.range = { in: 1, out: 2 };
    const separate = await f.store.export(
      p,
      { format: "mkv", separate: true, range: true },
      f.root,
      {},
    );
    assert.equal(
      probe(separate.file).streams.filter((x) => x.codec_type === "audio")
        .length,
      2,
    );
    assert.ok(stats(pcm(separate.file, 1)).peak < 0.85);
  } finally {
    await f.cleanup();
  }
});

test("opening a Latitude take ignores empty disabled input files and retains source metadata", async () => {
  const f = await fixture();
  try {
    await fs.copyFile(f.audio, path.join(f.root, "voice1.wav"));
    await fs.writeFile(path.join(f.root, "voice2.wav"), Buffer.alloc(80));
    await fs.writeFile(path.join(f.root, "desktop.wav"), Buffer.alloc(80));
    const take = await f.store.importTake({
      dir: f.root,
      videoFile: path.basename(f.source),
      duration: 3,
      name: "Interview",
      markers: [{ time: 1, label: "Highlight" }],
    });
    assert.deepEqual(
      take.items.map((a) => a.name),
      ["Picture", "Voice 1"],
    );
    assert.equal(take.items[0].audio, 2);
    assert.equal(take.markers.length, 1);
    await assert.rejects(
      f.store.relink(take.items[1].id, f.image),
      /same kind/,
    );
  } finally {
    await f.cleanup();
  }
});
test("slide and wipe exports reveal the incoming picture at the expected time", async () => {
  const f = await fixture();
  try {
    let p = f.p;
    const t = f.m.newTrack("video", "Overlay");
    p.tracks.push(t);
    p = f.m.addClip(p, p.assets[2], t.id, 0);
    Object.assign(p.clips.at(-1), {
      duration: 1,
      fadeIn: 0.5,
      transition: "wipe",
    });
    p.range = { in: 0, out: 1 };
    const wipe = await f.store.export(
      p,
      { format: "mp4", range: true },
      f.root,
      {},
    );
    const pixel = (file, at, x) => [
      ...ff([
        "-ss",
        String(at),
        "-i",
        file,
        "-vf",
        `crop=2:2:${x}:360,format=rgb24`,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "pipe:1",
      ]).subarray(0, 3),
    ];
    const left = pixel(wipe.file, 0.1, 400),
      right = pixel(wipe.file, 0.1, 900),
      late = pixel(wipe.file, 0.7, 900);
    // The square overlay fits inside the 16:9 frame (x=280..1000).
    assert.ok(left[2] > 150 && right[2] > 150); // reveal has not reached the centered picture
    assert.ok(late[0] > 180 && late[2] < 50);
    p.clips.at(-1).transition = "slide-left";
    const slide = await f.store.export(
      p,
      { format: "mp4", range: true },
      f.root,
      {},
    );
    const entering = pixel(slide.file, 0.3, 300),
      outside = pixel(slide.file, 0.3, 1000);
    assert.ok(entering[0] > 180 && entering[2] < 50);
    assert.ok(outside[2] > 150);
  } finally {
    await f.cleanup();
  }
});
