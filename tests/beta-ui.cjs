const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
require("../scripts/preview.cjs");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.TAKE_TEST_BROWSER,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 740 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "latitude-v2",
      JSON.stringify({ onboarded: true, reconnectMic: false }),
    ),
  );
  await page.goto("http://127.0.0.1:4173/src/index.html?test");
  await page.waitForFunction(() => !!window.__studio);
  await page.evaluate(() => window.__studio.engine.init());
  await page.waitForFunction(
    () => window.__studio.engine.ctx.state === "suspended",
  );
  assert.equal(
    await page.evaluate(() => window.__studio.compositor.timer),
    null,
  );
  await page.evaluate(async () => {
    const e = window.__studio.engine;
    await Promise.all([e.mic(0, ""), e.mic(1, "")]);
  });
  assert.equal(
    await page.evaluate(() => Object.keys(window.__studio.engine.nodes).length),
    2,
  );
  await page.evaluate(() => {
    const e = window.__studio.engine;
    e.remove("mic1");
    e.remove("mic2");
  });
  await page.waitForFunction(
    () => window.__studio.engine.ctx.state === "suspended",
  );
  const meters = {
    peaks: [0, 0, 0, 0],
    rms: [0, 0, 0, 0],
    inputPeaks: [1, 0],
    inputRms: [0.2, 0],
    clips: [1, 0],
    reduction: [0, 0],
    limiting: 0,
  };
  await page.evaluate((m) => window.__studio.engine.emit("meters", m), meters);
  assert.match(await page.textContent("#status-voice1"), /INPUT CLIP/);
  meters.clips = [0, 0];
  meters.inputPeaks = [0, 0];
  await page.evaluate((m) => window.__studio.engine.emit("meters", m), meters);
  assert.match(await page.textContent("#status-voice1"), /INPUT CLIP/);
  await page
    .locator(".toast button")
    .evaluateAll((buttons) => buttons.forEach((b) => b.click()));
  await page.click("#reset-peaks");
  await page.evaluate((m) => window.__studio.engine.emit("meters", m), meters);
  assert.doesNotMatch(await page.textContent("#status-voice1"), /INPUT CLIP/);
  await page.click('[data-view="settings"]');
  await page.click("#diagnostics-button");
  const details = JSON.parse(await page.inputValue("#diagnostics-text"));
  assert.equal(details.application, "Latitude");
  assert.ok(!("root" in details));
  await page.screenshot({
    path: path.resolve(__dirname, "../../latitude-beta-diagnostics.png"),
  });
  await page.click("#close-modal");
  await page.click('[data-view="studio"]');
  await page
    .locator(".toast button")
    .evaluateAll((buttons) => buttons.forEach((b) => b.click()));
  await page.screenshot({
    path: path.resolve(__dirname, "../../latitude-beta-studio.png"),
  });
  for (const size of [
    { width: 1100, height: 740 },
    { width: 960, height: 640 },
  ]) {
    await page.setViewportSize(size);
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    assert.ok(
      width <= size.width,
      `Horizontal overflow at ${size.width}: ${width}`,
    );
    await page.locator("#record-button").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#record-button").isVisible(), true);
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        idlePreview: "stopped",
        idleAudio: "suspended",
        inputs: "concurrently connected and released",
        clipWarning: "held until reset",
        diagnostics: "reviewable",
        widths: [1100, 960],
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
