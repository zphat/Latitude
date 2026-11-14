const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { createHash } = require("node:crypto"), { execFileSync } = require("node:child_process");
const model = import("../src/mods/editor/model.js"), packs = import("../src/mods/editor/packs.js");
const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
const ff = args => execFileSync(binary, ["-v", "error", "-y", ...args], { maxBuffer: 32 * 1024 * 1024 });
test("creative packs reject code and malformed recipes; imported review claims have no authority", async () => {
  const { validatePack, BUILTIN_PACKS } = await packs;
  const seed = structuredClone(BUILTIN_PACKS[0]);
  assert.equal(BUILTIN_PACKS.length, 4);
  for (const pack of BUILTIN_PACKS) assert.deepEqual(validatePack(pack), pack);
  const spoofed = validatePack({ ...seed, approved: true, price: 50, url: "https://bad.example", script: "alert(1)" });
  assert.deepEqual(spoofed, seed);
  for (const settings of [{ transition: "exec" }, { font: "url(https://bad.example)" }, { fadeIn: Infinity },
    { fadeIn: "1" }, { fadeIn: -1 }, { source: "/etc/passwd" }, JSON.parse('{"__proto__":{"bad":true}}')]) {
    assert.throws(() => validatePack({ ...seed, presets: [{ name: "Unsafe", kind: "transition", settings }] }));
  }
  assert.throws(() => validatePack({ ...seed, presets: Array(65).fill(seed.presets[0]) }));
  assert.throws(() => validatePack({ ...seed, description: "x".repeat(150000) }));
});
test("style application preserves media, sync, text, gain and history; short clips bound fades", async () => {
  const { newProject, addClip, History } = await model;
  const { applyPreset, TITLES, LOOKS, presetFromClip, validatePack } = await packs;
  let p = newProject(); p = addClip(p, null, p.tracks[0].id);
  p.clips[0].text = "Personal podcast title"; p.clips[0].duration = .4; p.clips[0].gain = -3; p.clips[0].group = "paired";
  const history = new History(p), before = structuredClone(history.current), changed = structuredClone(before);
  applyPreset(changed.clips[0], TITLES[1]); history.commit(changed);
  const c = history.current.clips[0];
  for (const key of ["id", "asset", "track", "start", "in", "duration", "text", "gain", "group"]) assert.deepEqual(c[key], before.clips[0][key]);
  assert.equal(c.fadeIn, .2); assert.equal(c.fadeOut, .2);
  const pack = presetFromClip(c, "title", "My style");
  assert.ok(!JSON.stringify(pack).includes("Personal podcast"));
  assert.deepEqual(validatePack(pack), pack); assert.deepEqual(history.undo(), before);
  assert.throws(() => applyPreset({ kind: "audio" }, LOOKS[1]), /picture or title/);
});
test("native preset pack IO bounds reads and round-trips canonical settings", async () => {
  const { EditorStore } = require("../electron/editor.cjs"), { BUILTIN_PACKS } = await packs;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-packs-"));
  try {
    const store = new EditorStore({ profile: root, ffmpeg: binary }), file = path.join(root, "example.latitude-pack");
    await store.exportPack(BUILTIN_PACKS[2], file); assert.deepEqual(await store.importPack(file), BUILTIN_PACKS[2]);
    await fs.writeFile(file, "x".repeat(128 * 1024 + 1)); await assert.rejects(store.importPack(file), /128 KB/);
    await fs.writeFile(file, "<script>bad</script>"); await assert.rejects(store.importPack(file), /readable/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test("every font and notice matches its pinned source manifest", async () => {
  const { FONTS } = await import("../src/mods/editor/fonts.js");
  const dir = path.resolve(__dirname, "../assets/fonts");
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "creative-fonts-sources.json")));
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  for (const entry of manifest.files) {
    const bytes = await fs.readFile(path.join(dir, entry.file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    assert.ok(entry.source.startsWith(`https://raw.githubusercontent.com/google/fonts/${manifest.commit}/`));
  }
  for (const font of FONTS.filter(f => f.file)) assert.ok((await fs.stat(path.join(dir, `${font.file}.ttf`))).size > 1000);
  assert.ok(manifest.files.filter(f => /(?:OFL|LICENSE)\.txt$/.test(f.file)).length === 13);
});
test("native RGB color filters match sRGB brightness, contrast and sepia math", async () => {
  const { exportColor } = await import("../src/mods/editor/color.js");
  const { COLOR_DEFAULTS } = await packs;
  const source = Buffer.from([100, 150, 180]);
  const render = values => execFileSync(binary, ["-v", "error", "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "1x1", "-i", "pipe:0",
    "-vf", `format=rgba,${exportColor({ ...COLOR_DEFAULTS, ...values }).join(",")},format=rgb24`, "-f", "rawvideo", "pipe:1"], { input: source });
  const b = render({ brightness: 1.2 }); for (let i = 0; i < 3; i++) assert.ok(Math.abs(b[i] - source[i] * 1.2) < 2);
  const contrast = render({ contrast: .8 }); for (let i = 0; i < 3; i++) assert.ok(Math.abs(contrast[i] - ((source[i] - 127.5) * .8 + 127.5)) < 2);
  const mono = render({ saturation: 0 }), expected = 100 * .213 + 150 * .715 + 180 * .072;
  for (const v of mono) assert.ok(Math.abs(v - expected) < 2);
  assert.deepEqual(exportColor(COLOR_DEFAULTS), [], "An unchanged clip requires no color processing");
});
test("packaged font gate rejects a missing notice in the actual application archive", async () => {
  const { createPackage, uncache } = require("@electron/asar");
  const { verifyFonts } = require("../scripts/verify-packaged-fonts.cjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-font-package-"));
  try {
    const source = path.join(root, "source"), archive = path.join(root, "app.asar");
    await fs.mkdir(path.join(source, "assets"), { recursive: true });
    await fs.cp(path.resolve(__dirname, "../assets/fonts"), path.join(source, "assets/fonts"), { recursive: true });
    await createPackage(source, archive); assert.doesNotThrow(() => verifyFonts(archive));
    await fs.rm(path.join(source, "assets/fonts/Pacifico-OFL.txt")); uncache(archive);
    await createPackage(source, archive); assert.throws(() => verifyFonts(archive));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test("all transition exports follow preview geometry across segment boundaries", async () => {
  const { newProject, sanitize, visualRect } = await model, { TRANSITIONS } = await import("../src/mods/editor/motion.js");
  const { segmentPlan } = await import("../src/mods/editor/render-plan.js");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-motion-"));
  try {
    const source = path.join(root, "white.png");
    ff(["-f", "lavfi", "-i", "color=c=white:s=160x90", "-frames:v", "1", "-threads", "1", source]);
    let p = newProject(); p.format = "compact"; p.background = "#000000";
    p.assets = [{ id: "source", kind: "image", name: "Picture", duration: 2, width: 160, height: 90, audio: 0 }];
    for (const [transition] of TRANSITIONS) for (const easing of ["linear", "smooth"]) {
      p.clips = [{ id: "clip", asset: "source", track: p.tracks[0].id, start: 0, in: 0, duration: 2, fadeIn: 1, transition, easing }];
      p = sanitize(p);
      const plan = segmentPlan(p, new Map([["source", { ...p.assets[0], path: source }]]), new Map(), { start: .25, duration: 1 / 30 });
      const graph = path.join(root, "graph.txt"), output = path.join(root, "frame.nut");
      await fs.writeFile(graph, plan.filter);
      ff([...plan.args, "-filter_complex_script", graph, output]);
      const pixels = ff(["-i", output, "-map", "0:v", "-vf", "scale=16:9:flags=neighbor", "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]);
      const r = visualRect(p.clips[0], .25), phase = r.phase;
      let checked = 0;
      for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) {
        const u = (x + .5) / 16 - r.x, v = (y + .5) / 9 - r.y;
        let visible = u >= 0 && u < 1 && v >= 0 && v < 1;
        if (transition === "wipe") visible &&= u < phase;
        if (transition === "wipe-right") visible &&= u >= 1 - phase;
        if (transition === "wipe-up") visible &&= v >= 1 - phase;
        if (transition === "wipe-down") visible &&= v < phase;
        if (transition === "reveal-center") visible &&= Math.abs(u - .5) < phase / 2;
        if (transition === "iris") visible &&= ((u - .5) * 1280) ** 2 + ((v - .5) * 720) ** 2 < (1280 ** 2 + 720 ** 2) / 4 * phase ** 2;
        if (transition === "diamond") visible &&= Math.abs((u - .5) * 2) + Math.abs((v - .5) * 2) < 2 * phase;
        const actual = pixels[(y * 16 + x) * 3], expected = visible ? 255 * r.alpha : 0;
        if (Math.abs(actual - expected) > 18) checked++;
      }
      assert.ok(checked <= 2, `${transition}/${easing}: ${checked} wrong sample pixels`);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
