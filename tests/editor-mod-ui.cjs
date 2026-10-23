// Real Electron IPC, local media, timeline, audio preview and exported file.
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const ffmpeg = process.env.TAKE_FFMPEG || require("ffmpeg-static");
const ff = (args) =>
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-edit-ui-"));
  const shots = path.join(root, "shots");
  await fs.mkdir(shots);
  const video = path.join(root, "Episode.mp4"),
    picture = path.join(root, "Sponsor.png");
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x180:r=30:d=2",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=320x180:r=30:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=4",
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1:a=0[v]",
    "-map",
    "[v]",
    "-map",
    "2:a",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    video,
  ]);
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=yellow:s=160x90",
    "-frames:v",
    "1",
    "-threads",
    "1",
    picture,
  ]);
  let app, page;
  try {
    app = await electron.launch({
      executablePath: process.env.TAKE_TEST_ELECTRON || require("electron"),
      args: [
        "--no-sandbox",
        "--disable-gpu",
        ...(process.platform === "linux" ? ["--ozone-platform=headless"] : []),
        path.resolve(__dirname, ".."),
      ],
      env: {
        ...process.env,
        TAKE_STUDIO_TEST: "1",
        LATITUDE_TEST_PROFILE: path.join(root, "profile"),
        TAKE_FFMPEG: ffmpeg,
      },
    });
    page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.addInitScript(() =>
      localStorage.setItem(
        "latitude-v2",
        JSON.stringify({ onboarded: true, reconnectMic: false, mods: {} }),
      ),
    );
    await page.goto("take://app/src/index.html?test");
    await page.click('[data-view="mods"]');
    await page.check('[data-mod-id="latitude-editor"]');
    await page.click('[data-view="editor"]');
    await page.waitForFunction(() => !!window.__editor);
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: files,
        });
      },
      [video, picture],
    );
    await page.click("#edit-import");
    await page.waitForFunction(
      () => window.__editor.project.assets.length === 2,
    );
    await page.click("#edit-add-media");
    await page.waitForFunction(
      () => window.__editor.project.clips.length === 1,
    );
    await page.waitForFunction(
      () => [...window.__editor.preview.items.values()][0]?.el.readyState >= 2,
    );
    const pixel = () =>
      page.evaluate(() => [
        ...document
          .querySelector("#edit-canvas")
          .getContext("2d")
          .getImageData(100, 100, 1, 1).data,
      ]);
    assert.ok((await pixel())[2] > 180, "Beginning is blue");
    await page.evaluate(() => window.__editor.preview.seek(2.6));
    await page.waitForFunction(
      () =>
        document
          .querySelector("#edit-canvas")
          .getContext("2d")
          .getImageData(100, 100, 1, 1).data[0] > 180,
    );
    await page.evaluate(() => window.__editor.preview.seek(0.4));
    await page.click("#edit-play");
    await page.waitForFunction(
      () => document.querySelector("#edit-meter").value > 0.01,
    );
    await page.waitForTimeout(700);
    assert.equal(
      await page.evaluate(() => window.__editor.preview.playing),
      true,
    );
    await page.click("#edit-play");
    await page.waitForFunction(
      () => window.__editor.preview.ctx.state === "suspended",
    );
    await page.evaluate(() => window.__editor.preview.seek(1));
    await page.click("#edit-split");
    assert.equal(
      await page.evaluate(() => window.__editor.project.clips.length),
      2,
    );
    await page.click("#edit-undo");
    await page.evaluate(() => window.__editor.preview.seek(0.5));
    await page.click("#edit-in");
    await page.evaluate(() => window.__editor.preview.seek(1));
    await page.click("#edit-out");
    await page.click("#edit-ripple");
    assert.equal(
      await page.evaluate(() =>
        Math.max(
          ...window.__editor.project.clips.map((c) => c.start + c.duration),
        ),
      ),
      3.5,
    );
    await page.click("#edit-undo");
    // Insert an ad: source offsets and both sides survive, later clips shift together.
    await page.click(".editor-media-item[data-media]:nth-child(2)");
    await page.evaluate(() => window.__editor.preview.seek(1));
    await page.click("#edit-insert-media");
    assert.equal(
      await page.evaluate(() =>
        Math.max(
          ...window.__editor.project.clips.map((c) => c.start + c.duration),
        ),
      ),
      9,
    );
    await page.click("#edit-undo");
    await page.evaluate(() =>
      window.__editor.select(window.__editor.project.clips[0].id),
    );
    await page.click("#clip-detach");
    assert.deepEqual(
      await page.evaluate(() =>
        window.__editor.project.clips.map((c) => [c.kind, c.mute]),
      ),
      [
        ["video", true],
        ["audio", false],
      ],
    );
    await page.click("#edit-copy");
    await page.evaluate(() => window.__editor.preview.seek(4));
    await page.click("#edit-paste");
    assert.equal(
      await page.evaluate(() => window.__editor.project.clips.length),
      4,
    );
    await page.click("#edit-undo");
    const audioTrack = await page.evaluate(
      () => window.__editor.project.tracks.at(-1).id,
    );
    await page.click(`[data-track-select="${audioTrack}"]`);
    await page.fill("#edit-track-gain", "-3");
    await page.locator("#edit-track-gain").blur();
    assert.equal(
      await page.locator("#edit-track-gain").count(),
      1,
      "Layer mixer stays open after adjusting",
    );
    // Lock guards both inspector fields and linked timing edits.
    const videoTrack = await page.evaluate(
      () => window.__editor.project.tracks[0].id,
    );
    await page.click(
      `[data-track="${videoTrack}"][data-track-action="locked"]`,
    );
    await page.evaluate(() =>
      window.__editor.select(window.__editor.project.clips[0].id),
    );
    assert.equal(await page.locator("#clip-start").isDisabled(), true);
    await page.click(
      `[data-track="${videoTrack}"][data-track-action="locked"]`,
    );
    await page.evaluate(() => window.__editor.preview.seek(0.5));
    await page.click("#edit-title");
    await page.fill("#clip-text", "Episode 01\nA clearer conversation");
    await page.locator("#clip-text").blur();
    await page.check("#clip-gradient");
    await page.check("#clip-box");
    await page.fill("#clip-duration", "2");
    await page.locator("#clip-duration").blur();
    const canvas = await page.locator("#edit-canvas").boundingBox();
    const oldX = await page.evaluate(
      () => window.__editor.project.clips.find((c) => c.kind === "title").x,
    );
    await page.mouse.move(
      canvas.x + canvas.width * 0.5,
      canvas.y + canvas.height * 0.82,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvas.x + canvas.width * 0.6,
      canvas.y + canvas.height * 0.7,
      { steps: 8 },
    );
    await page.mouse.up();
    assert.ok(
      await page.evaluate(
        (x) =>
          window.__editor.project.clips.find((c) => c.kind === "title").x >
          x + 0.05,
        oldX,
      ),
    );
    await page.selectOption("#edit-format", "portrait");
    const tall = await page.locator("#edit-canvas").boundingBox();
    assert.ok(Math.abs(tall.width / tall.height - 9 / 16) < 0.03);
    await page.selectOption("#edit-format", "compact");
    await page.setViewportSize({ width: 1480, height: 1000 });
    await page.screenshot({
      path: path.join(shots, "editor.png"),
      fullPage: true,
    });
    const projectFile = path.join(root, "Episode.latitude-edit");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, projectFile);
    await page.click("#edit-save");
    await page.waitForFunction(() =>
      document.body.textContent.includes("Saved Episode.latitude-edit"),
    );
    assert.equal(
      JSON.parse(await fs.readFile(projectFile, "utf8")).schema,
      "latitude-edit",
    );
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, root);
    await page.click("#edit-export");
    await page.check("#edit-export-separate");
    await page.click("#edit-export-confirm");
    await page.waitForFunction(
      () =>
        document
          .querySelector("#edit-dialog")
          .textContent.includes("Your edit is ready"),
      {},
      { timeout: 120000 },
    );
    const output = (await fs.readdir(root)).find((f) =>
      f.startsWith("Untitled edit-"),
    );
    const report = JSON.parse(
      await fs.readFile(path.join(root, output, "Export-report.json"), "utf8"),
    );
    assert.equal(report.tracks.length, 3);
    assert.ok(report.duration >= 4);
    assert.match(report.encodedTruePeak, /Peak:/);
    await page.click("#edit-dialog [data-close]");
    for (const width of [960, 1280, 1480]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "No horizontal page overflow",
      );
    }
    await page.click('[data-view="studio"]');
    assert.equal(
      await page.evaluate(() => window.__editor.preview.items.size),
      0,
    );
    await page.click('[data-view="mods"]');
    await page.uncheck('[data-mod-id="latitude-editor"]');
    await page.waitForFunction(() => !window.__editor);
    assert.equal(await page.locator("#page-editor").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: "passed",
        nativeIPC: true,
        mediaSeek: true,
        audioPreview: true,
        linkedCuts: true,
        insertion: true,
        detachAndPaste: true,
        titleDrag: true,
        projectSave: true,
        realExport: true,
        unloaded: true,
        shots,
        root,
      }),
    );
  } catch (e) {
    if (page) {
      console.error(
        await page.evaluate(() => ({
          time: window.__editor?.preview.time,
          clips: window.__editor?.project.clips,
          toast: document.querySelector("#toast")?.textContent,
        })),
      );
      await page
        .screenshot({ path: path.join(shots, "failure.png"), fullPage: true })
        .catch(() => {});
    }
    console.error("Test artifacts:", root);
    throw e;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
