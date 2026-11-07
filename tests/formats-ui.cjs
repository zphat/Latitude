const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
require("../scripts/preview.cjs");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.TAKE_TEST_BROWSER,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 740 },
  });
  const errors = [],
    exports = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("captureExport", async (id, options) => {
    exports.push({ id, options });
    return { report: { measuredLUFS: -16, truePeakDBTP: -1.5 } };
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("latitude-v2"))
      localStorage.setItem(
        "latitude-v2",
        JSON.stringify({
          onboarded: true,
          reconnectMic: false,
          quality: "high",
          normalize: false,
          target: -18,
        }),
      );
    window.take = {
      desktop: true,
      info: async () => ({
        platform: "win32",
        root: "Test recordings",
        encoder: true,
        version: "test",
        shortcutFailures: [],
      }),
      sessions: async () => [
        {
          id: "format-test",
          name: "Format test",
          created: new Date().toISOString(),
          status: "recorded",
          duration: 30,
        },
      ],
      shortcuts: async () => [],
      onAction() {},
      onProgress() {},
      onProblem() {},
      export: (id, options) => window.captureExport(id, options),
    };
  });
  await page.goto("http://127.0.0.1:4173/src/index.html?test");
  await page.waitForFunction(() => !!window.__studio);
  // Recording choices stay in sync between Studio and Settings and survive a
  // restart. The raw-mic switch is an explicit choice, not a side effect of size.
  assert.equal(await page.inputValue("#studio-video-quality"), "high");
  await page.selectOption("#studio-video-quality", "compact");
  await page.click('[data-view="settings"]');
  assert.equal(await page.inputValue("#video-quality"), "compact");
  assert.match(await page.textContent("#quality-estimate"), /3.5 Mbps/);
  assert.equal(await page.inputValue("#audio-storage"), "24");
  assert.equal(await page.locator("#keep-raw").isChecked(), true);
  await page.uncheck("#keep-raw");
  await page.selectOption("#audio-storage", "32");
  await page.selectOption("#video-quality", "high");
  assert.equal(await page.inputValue("#default-format"), "mp4");
  assert.equal(await page.locator("#default-separate").isChecked(), true);
  assert.equal(await page.locator("#default-format option").count(), 8);
  assert.equal(
    await page
      .locator(
        '#default-format optgroup[label="Suggested video formats"] option',
      )
      .count(),
    3,
  );
  for (const format of [
    "mp4",
    "mkv",
    "mov",
    "webm",
    "wav",
    "flac",
    "mp3",
    "m4a",
  ]) {
    await page.selectOption("#default-format", format);
    assert.ok((await page.textContent("#default-guide")).includes("Space:"));
    assert.ok(
      (await page.textContent("#default-guide")).includes("Export speed:"),
    );
    assert.equal(
      await page.locator("#default-video-options").isVisible(),
      ["mp4", "mkv", "mov", "webm"].includes(format),
    );
    assert.equal(await page.locator("#default-audio-bitrate").isDisabled(), ["mkv", "mov", "wav", "flac"].includes(format));
  }
  await page.selectOption("#default-format", "mkv");
  await page.uncheck("#default-separate");
  assert.equal(await page.locator("#default-copies").isDisabled(), true);
  await page.check("#default-separate");
  await page.check("#default-copies");
  await page.uncheck("#default-wav");
  await page.click("#default-compact");
  assert.equal(await page.locator("#default-separate").isChecked(), true, "Compact preset preserves isolated audio");
  assert.equal(await page.locator("#default-copies").isChecked(), false);
  assert.equal(await page.locator("#default-stems").isDisabled(), true);
  await page.check("#default-copies");
  await page.check("#default-wav");
  await page.selectOption("#default-stems", "flac");
  await page.uncheck("#default-wav");
  await page.waitForFunction(() => {
    const c = JSON.parse(localStorage.getItem("latitude-v2"));
    return (
      c.format === "mkv" && c.separateTracks && c.editorClips && !c.editingFiles
    );
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__studio);
  await page.click('[data-view="settings"]');
  assert.equal(await page.inputValue("#default-format"), "mkv");
  assert.equal(await page.inputValue("#target-loudness"), "-18");
  assert.equal(await page.locator("#normalize").isChecked(), false);
  assert.equal(await page.inputValue("#video-quality"), "high");
  assert.equal(await page.inputValue("#audio-storage"), "32");
  assert.equal(await page.locator("#keep-raw").isChecked(), false);
  assert.equal(await page.inputValue("#default-compression"), "balanced");
  assert.equal(await page.inputValue("#default-audio-bitrate"), "192");
  assert.equal(await page.inputValue("#default-stems"), "flac");
  await page.click('[data-view="recordings"]');
  await page.click('[data-export-take="format-test"]');
  assert.equal(await page.inputValue("#export-format"), "mkv");
  await page.selectOption("#export-format", "mp4");
  await page.uncheck("#export-separate");
  await page.check("#export-remember");
  // Both the form and its final action must remain reachable in small windows.
  for (const size of [
    { width: 1100, height: 740 },
    { width: 960, height: 640 },
  ]) {
    await page.setViewportSize(size);
    assert.ok(
      await page.evaluate(() => {
        const d = document.querySelector("#modal");
        return (
          d.scrollWidth <= d.clientWidth + 1 &&
          d.getBoundingClientRect().width <= innerWidth
        );
      }),
    );
    await page.locator("#start-export").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#start-export").isVisible(), true);
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.selectOption("#export-format", "mp4");
  await page.check("#export-separate");
  await page.check("#export-wav");
  await page.screenshot({
    path: path.resolve(__dirname, "../../latitude-formats-export.png"),
  });
  await page.uncheck("#export-separate");
  await page.uncheck("#export-wav");
  await page.click("#start-export");
  await page.waitForFunction(
    () => document.querySelector("#export-progress").hidden,
  );
  assert.equal(exports.length, 1);
  assert.deepEqual(exports[0].options, {
    quality: "high",
    videoCompression: "balanced",
    audioBitrate: 192,
    stemFormat: "flac",
    format: "mp4",
    separateTracks: false,
    editingFiles: false,
    editorClips: false,
    normalize: false,
    target: -18,
  });
  await page.click('[data-view="settings"]');
  assert.equal(await page.inputValue("#default-format"), "mp4");
  assert.equal(await page.locator("#default-separate").isChecked(), false);
  await page.click('[data-view="recordings"]');
  await page.click('[data-export-take="format-test"]');
  await page.selectOption("#export-format", "flac");
  await page.check("#export-separate");
  await page.click("#start-export");
  await page.waitForFunction(
    () => document.querySelector("#export-progress").hidden,
  );
  assert.equal(exports[1].options.format, "flac");
  assert.equal(exports[1].options.separateTracks, true);
  assert.equal(exports[1].options.editorClips, false);
  await page.click('[data-view="settings"]');
  assert.equal(
    await page.inputValue("#default-format"),
    "mp4",
    "one-off export must not overwrite defaults",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        formats: 8,
        suggested: 3,
        defaults: "persisted",
        singleExport: "independent",
        layout: [1100, 960],
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
