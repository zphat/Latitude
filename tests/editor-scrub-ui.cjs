// Actual mouse gestures + decoded frame IDs, including long-GOP and unindexed
// recordings. A changed time label alone is deliberately not a passing result.
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-scrub-ui-"));
  const video = path.join(root, "Frame counter with a long GOP.mp4");
  const original = path.join(root, "capture.mkv");
  const highFPS = path.join(root, "60 fps.mp4");
  const ff = args => execFileSync(binary, ["-v", "error", "-y", ...args]);
  // Eight black/white bars encode the exact frame number in binary.
  ff(["-f", "lavfi", "-i", "nullsrc=s=320x180:r=30:d=6",
    "-vf", "geq=lum='if(bitand(N,pow(2,floor(X/40))),235,16)':cb=128:cr=128",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-g", "150", "-bf", "3", video]);
  ff(["-i", video, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=6", "-c:v", "copy", "-c:a", "libopus", "-f", "matroska", "-live", "1", original]);
  ff(["-f", "lavfi", "-i", "nullsrc=s=320x180:r=60:d=3",
    "-vf", "geq=lum='if(bitand(N,pow(2,floor(X/40))),235,16)':cb=128:cr=128",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-g", "150", highFPS]);
  const { RecordingStore, TRACKS } = require("../electron/recording.cjs");
  const profile = path.join(root, "profile"), recordings = path.join(root, "takes");
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, "settings.json"), JSON.stringify({ root: recordings }));
  const store = new RecordingStore(recordings);
  const take = await store.begin({ name: "Unindexed capture", sampleRate: 48000, audioBitDepth: 24, voice1: true, captureMime: "video/webm;codecs=h264,opus" });
  for (const t of TRACKS) await store.append(take.id, t.id, new Float32Array(6 * 48000 * t.channels).buffer);
  await store.end(); await fs.copyFile(original, path.join(take.dir, "capture.mkv"));
  let app, page;
  try {
    app = await electron.launch({ executablePath: process.env.TAKE_TEST_ELECTRON || require("electron"),
      args: ["--no-sandbox", "--disable-gpu", ...(process.platform === "linux" ? ["--ozone-platform=headless"] : []), path.resolve(__dirname, "..")],
      env: { ...process.env, TAKE_STUDIO_TEST: "1", LATITUDE_TEST_PROFILE: path.join(root, "profile"), TAKE_FFMPEG: binary } });
    page = await app.firstWindow();
    page.on("crash", () => console.error("Renderer crashed"));
    const errors = []; page.on("pageerror", e => { errors.push(e.message); console.error("Renderer error:", e.message); });
    page.on("dialog", d => d.accept().catch(() => {}));
    await page.waitForURL("take://app/src/index.html", { waitUntil: "load" });
    await page.addInitScript(() => localStorage.setItem("latitude-v2", JSON.stringify({ onboarded: true, reconnectMic: false, mods: {} })));
    await page.goto("take://app/src/index.html?test");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.click('[data-view="mods"]');
    await page.check('[data-mod-id="latitude-editor"]');
    await page.click('[data-view="editor"]');
    await page.waitForFunction(() => !!window.__editor);
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, video);
    await page.click("#edit-import");
    await page.waitForFunction(() => window.__editor.project.assets.length === 1);
    await page.click("#edit-add-media");
    await page.waitForFunction(() => window.__editor.preview.presentedTime === 0);
    await page.evaluate(() => {
      window.frameId = () => {
        const c = document.querySelector("#edit-canvas"), ctx = c.getContext("2d");
        let id = 0;
        for (let bit = 0; bit < 8; bit++)
          if (ctx.getImageData((bit + 0.5) * c.width / 8, c.height / 2, 1, 1).data[0] > 128) id |= 1 << bit;
        return id;
      };
    });
    const expectFrame = async n => {
      await page.waitForFunction(n => window.frameId() === n && document.querySelector("#edit-canvas").getAttribute("aria-busy") === "false", n, { timeout: 5000 });
      assert.ok(Math.abs(await page.evaluate(() => window.__editor.preview.time) - n / 30) < 0.001);
    };
    const slider = page.locator("#edit-scrub");
    // This fails in 0.9.5: pause() overwrites the new range value before it is read.
    await slider.focus(); await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight"); await expectFrame(1);
    await page.keyboard.press("ArrowRight"); await expectFrame(2);
    const snapshot = () => page.evaluate(() => JSON.stringify({ p: window.__editor.project, history: window.__editor.history }));
    const initial = await snapshot();
    await page.evaluate(() => { window.player = [...window.__editor.preview.items.values()][0].el; });
    const rulerPoint = async seconds => page.evaluate(seconds => {
      const t = document.querySelector("#edit-timeline"), r = t.getBoundingClientRect();
      const y = document.querySelector("#edit-ruler").getBoundingClientRect().y + 16;
      return { x: r.x + 150 + seconds * Number(document.querySelector("#edit-zoom").value) - t.scrollLeft, y };
    }, seconds);
    const dragRuler = async (a, b) => {
      const start = await rulerPoint(a), end = await rulerPoint(b);
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 12 });
    };
    await dragRuler(0.3, 3.2); await expectFrame(96); // while held, not only on release
    await page.mouse.up();
    await dragRuler(3.2, 0.7); await expectFrame(21); await page.mouse.up();
    // Rapid direction changes must settle at the latest target, with one decoder.
    const start = await rulerPoint(1); await page.mouse.move(start.x, start.y); await page.mouse.down();
    for (const second of [5.5, 0.2, 4.7, 1.4, 3.1, 0.9, 5.1]) { const pt = await rulerPoint(second); await page.mouse.move(pt.x, pt.y); }
    await page.mouse.up(); await expectFrame(153);
    assert.equal(await snapshot(), initial, "Scrubbing never edits or adds undo entries");
    assert.equal(await page.evaluate(() => [...window.__editor.preview.items.values()][0].el === window.player), true);
    // Grab the playhead itself with a horizontally scrolled, zoomed timeline.
    await page.evaluate(() => {
      const z = document.querySelector("#edit-zoom"); z.value = 240; z.dispatchEvent(new Event("input"));
      document.querySelector("#edit-timeline").scrollLeft = 300;
      window.__editor.preview.seek(3);
    });
    await expectFrame(90);
    const grip = await page.locator("#edit-playhead").boundingBox(), atFour = await rulerPoint(4);
    await page.mouse.move(grip.x + 7, grip.y + 8); await page.mouse.down();
    await page.mouse.move(atFour.x, grip.y + 8, { steps: 10 }); await expectFrame(120); await page.mouse.up();
    await page.locator("#edit-timeline").focus(); await page.keyboard.press("End");
    await page.waitForFunction(() => window.frameId() === 179 && window.__editor.preview.time === 6);
    await page.keyboard.press("Home"); await expectFrame(0);
    await page.click("#edit-fit");
    await page.click("#edit-scrub-tool");
    const clip = await page.locator("[data-clip]").boundingBox();
    const target = await rulerPoint(2.4);
    await page.mouse.move(clip.x + 40, clip.y + 25); await page.mouse.down();
    await page.mouse.move(target.x, clip.y + 25, { steps: 8 });
    await expectFrame(72); await page.mouse.up();
    assert.equal(await snapshot(), initial);
    await page.click("#edit-select-tool");
    await page.fill("#edit-time", "00:00:03:07"); await page.locator("#edit-time").press("Enter"); await expectFrame(97);
    await page.locator("#edit-timeline").focus(); await page.keyboard.press("ArrowRight"); await expectFrame(98);
    await page.keyboard.press("Shift+ArrowLeft"); await expectFrame(88);
    await page.click("#edit-split");
    const clips = await page.evaluate(() => window.__editor.project.clips);
    assert.equal(clips.length, 2); assert.equal(clips[1].in, 88 / 30);
    for (const n of [89, 87, 88, 100]) {
      await page.fill("#edit-time", String(n / 30)); await page.locator("#edit-time").press("Enter"); await expectFrame(n);
    }
    await page.click("#edit-undo");
    await page.click("#edit-fit");
    // Real small-window and scaling layout: scrubbing survives the changed geometry.
    for (const [width, height, zoom] of [[960, 640, 1], [1280, 720, 1.25], [1480, 1000, 1.5]]) {
      await app.evaluate(({ BrowserWindow }, z) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z), zoom);
      await page.setViewportSize({ width, height }); await page.click("#edit-fit");
      await dragRuler(0.6, 4); await expectFrame(120); await page.mouse.up();
      await page.screenshot({ path: path.join(root, `scrub-${width}-${zoom}.png`) });
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    // Play/stop the same decoder and verify real advancing picture, not just clock.
    await page.fill("#edit-time", "1"); await page.locator("#edit-time").press("Enter"); await expectFrame(30);
    await page.click("#edit-play");
    await page.waitForFunction(() => window.frameId() >= 45 && window.frameId() < 75);
    await page.click("#edit-play");
    // Model with an offset after a cut: displayed source frame must include clip.in.
    await page.evaluate(() => { const p = structuredClone(window.__editor.project); p.clips[0].in = 2; p.clips[0].duration = 3; window.__editor.commit(p); window.__editor.preview.seek(1); });
    await page.waitForFunction(() => window.frameId() === 90);
    // Preview and real rendered export agree at the same source frame after trimming.
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, root);
    await page.click("#edit-export"); await page.selectOption("#edit-export-quality", "small");
    await page.click("#edit-export-confirm");
    await page.waitForFunction(() => document.querySelector("#edit-dialog").textContent.includes("Your edit is ready"), {}, { timeout: 120000 });
    const finished = (await fs.readdir(root, { withFileTypes: true })).find(x => x.isDirectory() && x.name.startsWith("Untitled edit"));
    assert.ok(finished);
    const pixels = ff(["-ss", "1", "-i", path.join(root, finished.name, "Finished.mp4"), "-frames:v", "1", "-vf", "scale=320:180", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    let renderedFrame = 0;
    for (let bit = 0; bit < 8; bit++) if (pixels[(90 * 320 + bit * 40 + 20) * 3] > 128) renderedFrame |= 1 << bit;
    assert.equal(renderedFrame, 90, "Export frame matches the preview's trimmed source offset");
    await page.click("#edit-dialog [data-close]");
    // Chromium's native confirm needs a display on headless Linux. Stub only
    // the confirmation; take loading, indexing and decoding still use real IPC.
    await page.evaluate(() => { window.confirm = message => { window.confirmation = message; return true; }; });
    await page.evaluate(async id => window.__editor.openTake(id), take.id);
    assert.match(await page.evaluate(() => window.confirmation), /Replace this timeline/);
    await page.waitForFunction(() => !![...window.__editor.media.values()].find(a => a.kind === "video")?.videoUrl);
    const indexed = await page.evaluate(() => [...window.__editor.media.values()].find(a => a.kind === "video").videoUrl);
    assert.match(indexed, /editor-media\/[a-f0-9]{64}$/);
    for (const frame of [150, 15, 90]) {
      await page.fill("#edit-time", String(frame / 30)); await page.locator("#edit-time").press("Enter"); await expectFrame(frame);
    }
    assert.deepEqual(await fs.readFile(path.join(take.dir, "capture.mkv")), await fs.readFile(original), "Indexing never alters the original");
    await page.selectOption("#edit-format", "compact");
    await page.click("#edit-export"); await page.selectOption("#edit-export-quality", "small"); await page.click("#edit-export-confirm");
    await page.waitForFunction(() => document.querySelector("#edit-dialog").textContent.includes("Your edit is ready"), {}, { timeout: 120000 });
    const rawExport = (await fs.readdir(root, { withFileTypes: true })).find(x => x.isDirectory() && x.name.startsWith("Unindexed capture"));
    assert.ok(rawExport);
    const rawPixels = ff(["-ss", "5", "-i", path.join(root, rawExport.name, "Finished.mp4"), "-frames:v", "1", "-vf", "scale=320:180", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    let rawFrame = 0;
    for (let bit = 0; bit < 8; bit++) if (rawPixels[(90 * 320 + bit * 40 + 20) * 3] > 128) rawFrame |= 1 << bit;
    assert.equal(rawFrame, 150, "Raw capture export and indexed preview agree despite Opus encoder delay");
    await page.click("#edit-dialog [data-close]");
    // Mixed source/project frame rates, including a cut between source frames.
    await page.click("#edit-new");
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, highFPS);
    await page.click("#edit-import");
    await page.waitForFunction(() => window.__editor.project.assets.length === 1);
    await page.click("#edit-add-media");
    for (const fps of [24, 30, 60]) {
      await page.selectOption("#edit-fps", String(fps));
      for (const n of [1, 2, 5, 11, 18]) {
        await page.fill("#edit-time", String(n / fps)); await page.locator("#edit-time").press("Enter");
        await page.waitForFunction(id => window.frameId() === id && document.querySelector("#edit-canvas").getAttribute("aria-busy") === "false", Math.floor(n * 60 / fps));
      }
    }
    await page.selectOption("#edit-fps", "24");
    await page.evaluate(() => { const p = structuredClone(window.__editor.project); p.name = "Mixed frame rate cut"; p.format = "compact"; p.clips[0].in = 25 / 24; p.clips[0].duration = 1; window.__editor.commit(p); window.__editor.preview.seek(1 / 24); });
    await page.waitForFunction(() => window.frameId() === 65);
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, root);
    await page.click("#edit-export"); await page.click("#edit-export-confirm");
    await page.waitForFunction(() => document.querySelector("#edit-dialog").textContent.includes("Your edit is ready"), {}, { timeout: 120000 });
    const mixed = (await fs.readdir(root, { withFileTypes: true })).find(x => x.isDirectory() && x.name.startsWith("Mixed frame rate cut"));
    assert.ok(mixed);
    const rendered = ff(["-i", path.join(root, mixed.name, "Finished.mp4"), "-frames:v", "4", "-vf", "scale=320:180", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    for (let n = 0; n < 4; n++) {
      let id = 0;
      for (let bit = 0; bit < 8; bit++) if (rendered[(n * 320 * 180 + 90 * 320 + bit * 40 + 20) * 3] > 128) id |= 1 << bit;
      assert.equal(id, Math.floor((25 + n) * 60 / 24), `Mixed-rate exported frame ${n} matches preview source instant`);
    }
    await page.click("#edit-dialog [data-close]");
    // Mod teardown cancels pending seeks and releases all media handlers.
    await page.evaluate(() => { window.oldPreview = window.__editor.preview; window.__editor.preview.seek(2.7); });
    await page.click('[data-view="mods"]'); await page.uncheck('[data-mod-id="latitude-editor"]');
    await page.waitForFunction(() => !window.__editor);
    assert.equal(await page.evaluate(() => window.oldPreview.items.size), 0);
    assert.equal(await page.evaluate(() => window.oldPreview.destroyed), true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", exactFrameIDs: true, dragWhileHeld: true, latestSeekWins: true, decoderReuse: true, cutsAndOffsets: true, root }));
  } catch (error) {
    console.error("Original failure:", error);
    if (page && !page.isClosed()) { console.error(await page.evaluate(() => ({ frame: window.frameId?.(), time: window.__editor?.preview.time, presented: window.__editor?.preview.presentedTime, seek: document.querySelector("#edit-seek-state")?.textContent, errors: document.querySelector("#toast")?.textContent }))); await page.screenshot({ path: path.join(root, "failure.png") }).catch(() => {}); }
    console.error(root); throw error;
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
