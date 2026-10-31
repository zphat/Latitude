// Native IPC + generated media. No physical devices or private recordings.
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { RecordingStore, TRACKS } = require("../electron/recording.cjs");
const ffmpeg = process.env.TAKE_FFMPEG || require("ffmpeg-static");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-names-ui-"));
  const profile = path.join(root, "profile"), recordings = path.join(root, "takes"), shots = path.join(root, "shots");
  await fs.mkdir(profile); await fs.mkdir(shots);
  await fs.writeFile(path.join(profile, "settings.json"), JSON.stringify({ root: recordings }));
  const store = new RecordingStore(recordings);
  const waitForTake = async (predicate) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const take = (await store.list()).find(predicate);
      if (take) return take;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error("Timed out waiting for saved take metadata");
  };
  const take = await store.begin({ name: "Untitled session", sampleRate: 48000, voice1: true, desktop: true,
    width: 320, height: 180, captureMime: "video/webm;codecs=h264,opus" });
  for (const [j, track] of TRACKS.entries()) {
    const pcm = new Float32Array(48000 * 3 * track.channels);
    for (let i = 0; i < pcm.length; i++) pcm[i] = 0.08 * Math.sin(Math.floor(i / track.channels) * 2 * Math.PI * (220 + j * 110) / 48000);
    await store.append(take.id, track.id, pcm.buffer);
  }
  await store.end();
  execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=3",
    "-c:v", "libx264", "-threads", "1", path.join(take.dir, "capture.mkv")]);
  let app;
  try {
    app = await electron.launch({ executablePath: process.env.TAKE_TEST_ELECTRON || require("electron"),
      args: ["--no-sandbox", "--disable-gpu", ...(process.platform === "linux" ? ["--ozone-platform=headless"] : []), path.resolve(__dirname, "..")],
      env: { ...process.env, TAKE_STUDIO_TEST: "1", LATITUDE_TEST_PROFILE: profile, TAKE_FFMPEG: ffmpeg } });
    const page = await app.firstWindow(), errors = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error("Renderer:", error.message); });
    await page.addInitScript(() => {
      if (!localStorage.getItem("latitude-v2")) localStorage.setItem("latitude-v2", JSON.stringify({
        name: "Untitled session", onboarded: true, reconnectMic: false, countdown: false, autoExport: false,
      }));
    });
    await page.goto("take://app/src/index.html?test");
    await page.waitForSelector('[data-scene="break"]');
    assert.equal(await page.inputValue("#studio-session-name"), "");
    await page.fill("#studio-session-name", "Podcast: episode 12 / Q&A");
    await page.locator("#studio-session-name").press("Enter");
    assert.equal(await page.inputValue("#session-name"), "Podcast: episode 12 / Q&A");
    await page.selectOption("#after-recording", "save");
    await page.click('[data-view="settings"]');
    assert.equal(await page.isChecked("#auto-export"), false);
    await page.check("#auto-export");
    await page.click('[data-view="studio"]');
    assert.equal(await page.inputValue("#after-recording"), "export");
    await page.selectOption("#after-recording", "save");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("latitude-v2")).name === "Podcast: episode 12 / Q&A");
    await page.reload();
    await page.waitForSelector('[data-scene="break"]');
    assert.equal(await page.inputValue("#studio-session-name"), "Podcast: episode 12 / Q&A");
    assert.equal(await page.inputValue("#after-recording"), "save");

    await page.click('[data-view="recordings"]');
    const card = page.locator(".take-card").filter({ has: page.locator(`[data-export-take="${take.id}"]`) });
    await card.locator(".take-title").click();
    await page.fill("#rename-take-name", "Discard this");
    await page.locator("#rename-take-name").press("Escape");
    assert.equal((await store.resolve(take.id)).name, take.name);
    await card.locator(".take-heading .button").click();
    await page.fill("#rename-take-name", "   ");
    await page.locator("#rename-take-name").press("Enter");
    assert.equal(await page.locator("#modal").evaluate((el) => el.open), true);
    const longName = 'Episode 12: a longer conversation about sound, games & café <test>';
    await page.fill("#rename-take-name", longName);
    await page.locator("#rename-take-name").press("Enter");
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    assert.equal(await card.locator(".take-title").innerText(), longName);
    for (const [width, height] of [[960, 640], [1280, 720], [1480, 1000]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: path.join(shots, `takes-${width}.png`) });
      for (const selector of [".take-title", ".take-heading .button", "[data-export-take]"])
        assert.ok(await card.locator(selector).isVisible());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.setViewportSize({ width: 960, height: 640 });
    for (const zoom of [1.25, 1.5]) {
      await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(value), zoom);
      await card.locator(".take-heading .button").click();
      await page.fill("#rename-take-name", longName);
      await page.locator("#rename-save").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(shots, `rename-zoom-${zoom}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.click("#rename-cancel");
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    await card.locator("[data-export-take]").click();
    await page.selectOption("#export-target", "-18");
    await page.fill("#export-take-name", "Podcast ready for editing");
    await page.locator("#export-take-name").press("Enter");
    await page.waitForFunction(() => document.querySelector("#export-rename").disabled && !document.querySelector("#export-take-name").disabled);
    assert.equal(await page.inputValue("#export-target"), "-18", "rename preserves export choices");
    await page.click("#start-export");
    const exported = await waitForTake((s) => s.id === take.id && s.status === "exported");
    assert.equal(exported.name, "Podcast ready for editing");
    assert.equal(exported.dir, take.dir);
    assert.equal(exported.exports[0].report.targetLUFS, -18);
    assert.equal(exported.exports[0].report.embeddedAudioTracks, 3);

    await page.click('[data-view="studio"]');
    await page.setViewportSize({ width: 960, height: 640 });
    await page.fill("#studio-session-name", "");
    await page.locator("#studio-session-name").press("Enter");
    await page.locator("#record-button").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, "studio-name-960.png") });
    await page.click('[data-scene="break"]');
    await page.click("#record-button");
    await page.waitForFunction(() => document.body.classList.contains("recording-mode"));
    assert.match(await page.inputValue("#studio-session-name"), /^Recording \d{4}-/);
    await page.fill("#studio-session-name", "Named while recording");
    await page.locator("#studio-session-name").press("Enter");
    // This external store labels another process's active take "interrupted";
    // its title is still read from the actual atomic manifest on disk.
    await waitForTake((s) => s.name === "Named while recording");
    await page.waitForFunction(() => document.querySelector("#timer").textContent !== "00:00:00");
    await page.click("#record-button");
    await waitForTake((s) => s.name === "Named while recording" && s.status === "recorded");
    const takes = await store.list();
    assert.ok(takes.some((s) => s.name === "Named while recording" && s.duration > 0.1 && s.status === "recorded"));
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(`Session naming, persistence, native recording/rename/export and small-window checks passed. Screenshots: ${shots}`);
  } finally { if (app) await app.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
