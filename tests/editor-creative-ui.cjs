// Native optional-mod lifecycle, offline fonts, real pack dialogs and preview/export colors.
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict"), fs = require("node:fs/promises");
const path = require("node:path"), os = require("node:os"), { execFileSync } = require("node:child_process");
const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-creative-ui-"));
  const source = path.join(root, "A long guest name - episode still - sources stay unchanged.png");
  execFileSync(binary, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180", "-frames:v", "1", "-threads", "1", source]);
  const packPath = path.join(root, "My preset.latitude-pack");
  let app, page;
  const inline = async label => {
    if (!page || process.env.LATITUDE_QA_INLINE_IMAGES !== "1") return;
    const bytes = await page.screenshot({ animations: "disabled", type: "jpeg", quality: 68 });
    const data = bytes.toString("base64");
    console.log("LATITUDE_QA_BEGIN " + label);
    for (let offset = 0; offset < data.length; offset += 8000) console.log("LATITUDE_QA_DATA " + data.slice(offset, offset + 8000));
    console.log("LATITUDE_QA_END " + label);
  };
  try {
    app = await electron.launch({ executablePath: process.env.TAKE_TEST_ELECTRON || require("electron"),
      args: ["--no-sandbox", "--disable-gpu", ...(process.platform === "linux" ? ["--ozone-platform=headless"] : []), path.resolve(__dirname, "..")],
      env: { ...process.env, TAKE_STUDIO_TEST: "1", LATITUDE_TEST_PROFILE: path.join(root, "profile"), TAKE_FFMPEG: binary } });
    page = await app.firstWindow();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const remote = []; page.on("request", r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
    await page.addInitScript(() => localStorage.setItem("latitude-v2", JSON.stringify({ onboarded: true, reconnectMic: false, mods: {} })));
    await page.goto("take://app/src/index.html?test"); await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await page.evaluate(async () => {
      const faces = await document.fonts.load('400 13px "Latitude UI"');
      return faces.length === 1 && faces[0].status === "loaded";
    }), true, "The bundled UI fallback loads offline on systems without Inter or Segoe UI");
    await page.click('[data-view="mods"]'); await page.check('[data-mod-id="latitude-editor"]'); await page.click('[data-view="editor"]');
    await page.waitForFunction(() => !!window.__editor);
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, source);
    await page.click("#edit-import"); await page.waitForFunction(() => window.__editor.project.assets.length === 1);
    await page.click("#edit-add-media"); await page.waitForFunction(() => window.__editor.project.clips.length === 1);
    await page.evaluate(() => window.__editor.preview.seek(1));
    const original = await page.evaluate(() => JSON.stringify(window.__editor.project));
    await page.click("#edit-library-open"); await page.waitForSelector("#edit-library[open]");
    assert.equal(await page.locator(".library-card").count(), 12);
    await page.fill("#library-search", "circle"); assert.equal(await page.locator(".library-card").count(), 1);
    await page.click('[data-favorite="builtin-0:10"]');
    await page.fill("#library-search", ""); await page.click('[data-location="favorites"]'); assert.equal(await page.locator(".library-card").count(), 1);
    await page.click('[data-location="included"]');
    // Preview details retain the exact query, browse position and project state.
    const browseState = await page.evaluate(() => ({ project: JSON.stringify(window.__editor.project),
      selected: window.__editor.selected, time: window.__editor.preview.time, undo: window.__editor.undoStack.length }));
    await page.click('[data-category="all"]'); await page.fill("#library-search", "Latitude");
    assert.equal(await page.locator(".library-card").count(), 52);
    const previewButton = page.locator('[data-detail="builtin-0:4"]');
    await previewButton.scrollIntoViewIfNeeded();
    const browseScroll = await page.locator("#library-body").evaluate(el => el.scrollTop);
    await previewButton.click();
    assert.equal(await page.locator("#library-detail-canvas").isVisible(), true);
    await inline("style-detail");
    await page.keyboard.press("Escape");
    await page.waitForFunction(top => Math.abs(document.querySelector("#library-body").scrollTop - top) <= 1, browseScroll);
    assert.equal(await page.locator("#library-search").inputValue(), "Latitude");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.detail), "builtin-0:4");
    assert.deepEqual(await page.evaluate(() => ({ project: JSON.stringify(window.__editor.project),
      selected: window.__editor.selected, time: window.__editor.preview.time, undo: window.__editor.undoStack.length })), browseState);
    await page.keyboard.press("ControlOrMeta+f");
    assert.equal(await page.evaluate(() => document.activeElement.id), "library-search");
    await page.fill("#library-search", "");
    await page.click('[data-location="library"]');
    assert.match(await page.locator("#library-grid").textContent(), /Make this library yours/);
    await page.click('[data-location="included"]');
    assert.equal(await page.locator('[data-category="all"]').getAttribute("aria-pressed"), "true");
    await page.click('[data-category="look"]'); await page.click('[data-apply="builtin-1:6"]');
    await page.waitForFunction(() => window.__editor.project.clips[0].sepia === .3);
    await page.click("#library-close"); await page.click("#edit-undo");
    assert.equal(await page.evaluate(() => JSON.stringify(window.__editor.project)), original, "One Undo restores a style application exactly");
    // Inspector sections and scroll survive a numeric change. Name is independent of source.
    await page.locator('#edit-inspector summary').filter({ hasText: "Simple color effects" }).click();
    await page.fill("#clip-sepia", "35"); await page.locator("#clip-sepia").press("Tab");
    await page.waitForFunction(() => window.__editor.project.clips[0].sepia === .35);
    assert.equal(await page.locator("#clip-sepia").isVisible(), true);
    await page.fill("#clip-name", "Opening shot"); await page.locator("#clip-name").press("Tab");
    await page.waitForFunction(() => window.__editor.project.clips[0].name === "Opening shot");
    assert.match(await page.evaluate(() => window.__editor.project.assets[0].name), /long guest/);
    await page.click("#edit-library-open"); await page.click('[data-location="library"]'); await page.click("#library-save summary");
    await page.fill("#library-pack-name", "My warm style"); await page.click("#library-save-clip");
    await page.waitForFunction(() => document.querySelectorAll(".library-pack").length === 1);
    const local = await page.locator("[data-export]").last().getAttribute("data-export");
    assert.match(await page.locator(".library-pack").last().textContent(), /Local · not reviewed/);
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, packPath);
    await page.click(`[data-export="${local}"]`); await page.waitForFunction(() => document.querySelector("#library-status").textContent.includes("Pack exported"));
    const exported = JSON.parse(await fs.readFile(packPath)); assert.equal(exported.presets[0].settings.sepia, .35);
    const projectBeforeRemove = await page.evaluate(() => JSON.stringify(window.__editor.project));
    await page.click(`[data-remove="${local}"]`);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__editor.project)), projectBeforeRemove);
    await fs.writeFile(packPath, JSON.stringify({ ...exported, approved: true, price: 999, script: "danger()" }));
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, packPath);
    await page.click("#library-import"); await page.waitForFunction(() => document.querySelectorAll(".library-pack").length === 1);
    assert.match(await page.locator(".library-pack").last().textContent(), /Local · not reviewed/);
    // Removing a selected mixer layer via Undo must not leave an invalid inspector.
    await page.click("#library-close");
    await page.click("#edit-audio-layer");
    await page.locator(".editor-track-name").last().click();
    await page.click("#edit-undo");
    assert.equal(await page.locator("#edit-track-name").count(), 0);
    await page.evaluate(() => window.__editor.select(window.__editor.project.clips[0].id));
    await page.click("#edit-library-open");
    // Load each bundled font offline; only the editor owns the decoded faces.
    await page.click('[data-location="included"]'); await page.click('[data-category="font"]');
    const fonts = await page.evaluate(async () => {
      const { FONTS, fontSpec } = await import("./mods/editor/fonts.js");
      for (const f of FONTS) await window.__editor.preview.fonts.ensure(f.name);
      return FONTS.map(f => ({ name: f.name, loaded: document.fonts.check(fontSpec(f.name)) }));
    });
    assert.equal(fonts.length, 16); assert.ok(fonts.every(f => f.loaded), JSON.stringify(fonts));
    await page.click('[data-add="builtin-3:13"]');
    await page.waitForFunction(() => window.__editor.project.clips.some(c => c.font === "Pacifico"));
    await page.click("#library-close");
    await page.waitForFunction(() => document.querySelector("#edit-canvas").getAttribute("aria-busy") === "false");
    await page.screenshot({ animations: "disabled", path: path.join(root, "editor-title.png") });
    // Compare Chromium canvas filters to native RGB math using independent known input pixels.
    const { LOOKS } = await import("../src/mods/editor/packs.js"), { exportColor } = await import("../src/mods/editor/color.js");
    const input = Buffer.from([100, 150, 180]);
    for (const look of LOOKS) {
      const expected = await page.evaluate(async settings => {
        const { cssColor } = await import("./mods/editor/color.js");
        const source = document.createElement("canvas"), target = document.createElement("canvas");
        source.width = target.width = 4; source.height = target.height = 4;
        const a = source.getContext("2d"), b = target.getContext("2d"); a.fillStyle = "rgb(100,150,180)"; a.fillRect(0, 0, 4, 4);
        b.filter = cssColor(settings); b.drawImage(source, 0, 0); return [...b.getImageData(2, 2, 1, 1).data].slice(0, 3);
      }, look.settings);
      const filters = exportColor(look.settings);
      const actual = execFileSync(binary, ["-v", "error", "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "1x1", "-i", "pipe:0", "-vf",
        ["format=rgba", ...filters, "format=rgb24"].join(","), "-f", "rawvideo", "pipe:1"], { input });
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(actual[i] - expected[i]) <= 3, `${look.name} channel ${i}: preview ${expected[i]}, export ${actual[i]}`);
    }
    const state = await page.evaluate(() => ({ project: JSON.stringify(window.__editor.project), selected: window.__editor.selected, time: window.__editor.preview.time }));
    for (const [width, height, scale] of [[960, 640, 1], [1280, 720, 1], [1280, 720, 1.25], [1480, 1000, 1.5]]) {
      await page.setViewportSize({ width, height });
      await app.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor), scale);
      await page.click("#edit-library-open"); await page.click('[data-category="title"]');
      await page.screenshot({ animations: "disabled", path: path.join(root, `creative-${width}-${scale}.png`) });
      if ((width === 960 && scale === 1) || scale === 1.5) await inline("library-" + width + "-" + scale);
      const overflow = await page.evaluate(() => { const d = document.querySelector("#edit-library"); return d.scrollWidth > d.clientWidth + 1; });
      assert.equal(overflow, false, `Library horizontal overflow at ${width}/${scale}`);
      await page.evaluate(() => { const d = document.querySelector("#library-body"); d.scrollTop = d.scrollHeight; });
      const close = await page.locator("#library-close").boundingBox();
      assert.ok(close.y >= 0 && close.y + close.height < height, "Done remains reachable when scrolled");
      await page.keyboard.press("Escape");
      assert.equal(await page.isVisible("#edit-library"), false);
      assert.deepEqual(await page.evaluate(() => ({ project: JSON.stringify(window.__editor.project), selected: window.__editor.selected, time: window.__editor.preview.time })), state);
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    await page.setViewportSize({ width: 1280, height: 900 });
    const preview = await page.evaluate(() => { window.oldPreview = window.__editor.preview; return document.fonts.size; });
    await page.click('[data-view="mods"]'); await page.uncheck('[data-mod-id="latitude-editor"]');
    await page.waitForFunction(() => !window.__editor);
    assert.equal(await page.locator("#edit-library").count(), 0);
    assert.equal(await page.evaluate(() => window.oldPreview.destroyed), true);
    assert.ok(await page.evaluate(n => document.fonts.size <= n - 15, preview));
    assert.equal(await page.evaluate(() => document.fonts.check('400 13px "Latitude UI"')), true,
      "Disabling the editor keeps the core UI fallback available");
    await page.click('[data-view="studio"]');
    await page.screenshot({ animations: "disabled", path: path.join(root, "studio-after-editor.png") });
    await page.click('[data-view="mods"]');
    await page.check('[data-mod-id="latitude-editor"]'); await page.click('[data-view="editor"]'); await page.waitForFunction(() => !!window.__editor);
    await page.click("#edit-library-open"); await page.click('[data-category="packs"]');
    assert.equal(await page.locator(".library-pack").count(), 1, "Local packs survive disable/re-enable");
    await page.click('[data-location="favorites"]');
    assert.equal(await page.locator(".library-card").count(), 1, "Favorites survive disable/re-enable");
    await page.click('[data-location="discover"]');
    assert.match(await page.locator("#library-discover").textContent(), /purchases are not enabled/);
    assert.equal(await page.locator("#library-controls").isVisible(), false);
    await inline("discover");
    assert.ok(!remote.some(url => /fonts\.(?:googleapis|gstatic)\.com/.test(url)), "No font network requests");
    assert.deepEqual(remote, [], "Browsing every destination makes no network request");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", fonts: fonts.length, packsRoundTrip: true, colorsMatchNative: true, responsive: true, cleanup: true, root }));
  } catch (error) {
    if (page) await page.screenshot({ animations: "disabled", path: path.join(root, "failure.png") }).catch(() => {});
    await inline("failure").catch(() => {});
    console.error("QA artifacts:", root); throw error;
  } finally { if (app) await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
