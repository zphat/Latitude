// Run with TAKE_TEST_BROWSER=/path/to/chromium node tests/ui.cjs
// Uses generated signals and a real AudioWorklet/MediaRecorder/FFmpeg pipeline.
const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { RecordingStore, TRACKS } = require("../electron/recording.cjs");
require("../scripts/preview.cjs");
(async () => {
  const root = await fs.mkdtemp(path.resolve(__dirname, "../../qa-session-"));
  const store = new RecordingStore(root);
  const browser = await chromium.launch({
    executablePath: process.env.TAKE_TEST_BROWSER,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1480, height: 960 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("testBridge", async (action, args) => {
    if (action === "info")
      return {
        platform: "win32",
        root,
        encoder: true,
        version: "0.7.0",
        shortcutFailures: [],
      };
    if (action === "begin") return store.begin(args[0]);
    if (action === "chunk")
      return store.append(args[0], args[1], Buffer.from(args[2], "base64"));
    if (action === "end") return store.end(args[0]);
    if (action === "sessions") return store.list();
    if (action === "event") return store.event(...args);
    if (action === "export")
      return store.export(
        args[0],
        args[1],
        process.env.TAKE_FFMPEG || require("ffmpeg-static"),
      );
    if (action === "shortcuts") return [];
    if (action === "sources") return [];
  });
  await page.addInitScript(() => {
    const call = (a, ...v) => window.testBridge(a, v);
    window.take = {
      desktop: true,
      info: () => call("info"),
      begin: (o) => call("begin", o),
      chunk: (id, k, b) => call("chunk", id, k, new Uint8Array(b).toBase64()),
      end: (o) => call("end", o),
      sessions: () => call("sessions"),
      event: (id, o) => call("event", id, o),
      export: (id, o) => call("export", id, o),
      shortcuts: () => call("shortcuts"),
      sources: () => call("sources"),
      onAction: () => {},
      onProgress: () => {},
      onProblem: () => {},
      openFolder: () => {},
      play: () => {},
    };
  });
  await page.addInitScript(
    () =>
      !localStorage.getItem("latitude-v2") &&
      localStorage.setItem(
        "latitude-v2",
        JSON.stringify({
          onboarded: true,
          autoExport: false,
          countdown: false,
          reconnectMic: false,
        }),
      ),
  );
  const shots =
    process.env.LATITUDE_QA_OUTPUT ||
    path.resolve(__dirname, "../../latitude-qa-07");
  await fs.mkdir(shots, { recursive: true });
  await page.goto("http://127.0.0.1:4173/src/index.html?test");
  await page.waitForFunction(() => !!window.__studio);
  await page.evaluate(async () => {
    const { engine, compositor, config } = window.__studio;
    config.name = "Field notes · Episode 01";
    document.querySelector("#session-name").value = config.name;
    await engine.init();
    const canvas = document.createElement("canvas");
    canvas.width = 2560;
    canvas.height = 1440;
    const c = canvas.getContext("2d");
    c.fillStyle = "#e9e9df";
    c.fillRect(0, 0, 2560, 1440);
    c.fillStyle = "#1d302f";
    c.fillRect(1740, 0, 820, 1440);
    c.fillStyle = "#374740";
    c.font = "bold 29px Arial";
    c.fillText("FIELD NOTES  /  EPISODE 01", 150, 170);
    c.fillStyle = "#172723";
    c.font = "bold 130px Arial";
    c.fillText("The good take.", 140, 470);
    c.font = "44px Arial";
    c.fillStyle = "#48554e";
    c.fillText("Make room for a great conversation.", 150, 570);
    const notes = [
      "A little preparation. A lot of presence.",
      "Leave space to listen.",
      "Keep the moments that matter.",
    ];
    notes.forEach((note, i) => {
      c.fillStyle = "#7c8a70";
      c.font = "bold 28px Arial";
      c.fillText(`0${i + 1}`, 150, 825 + i * 140);
      c.fillStyle = "#253c32";
      c.font = "39px Arial";
      c.fillText(note, 240, 825 + i * 140);
    });
    c.strokeStyle = "#899d8d";
    c.lineWidth = 2;
    for (const rx of [285, 200, 100]) {
      c.beginPath();
      c.ellipse(2150, 665, rx, 285, 0, 0, Math.PI * 2);
      c.stroke();
    }
    for (const dy of [-180, 0, 180]) {
      c.beginPath();
      c.ellipse(
        2150,
        665 + dy,
        Math.sqrt(285 ** 2 - dy ** 2),
        58,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
    c.strokeStyle = "#d1ff4a";
    c.lineWidth = 5;
    c.beginPath();
    c.ellipse(2150, 665, 285, 75, 0, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#d1ff4a";
    c.beginPath();
    c.arc(2412, 694, 11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#b6c6b7";
    c.font = "27px Arial";
    c.fillText("A CONVERSATION WORTH KEEPING", 1840, 1170);
    window.sampleCanvas = canvas;
    const stream = canvas.captureStream(0);
    engine.streams.screen = stream;
    compositor.setScreen(stream);
    c.drawImage(canvas, 0, 0);
    stream.getVideoTracks()[0].requestFrame();
    const oscillator = engine.ctx.createOscillator(),
      gain = engine.ctx.createGain(),
      destination = engine.ctx.createMediaStreamDestination();
    oscillator.frequency.value = 170;
    gain.gain.value = 0.1;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    window.sampleOscillator = oscillator;
    await engine.attach("mic1", destination.stream, 0);
    engine.emit("sources", engine.sourceState());
  });
  await page.selectOption("#voice-preset", "broadcast");
  await page.locator("#polish").fill("30");
  await page.locator("#polish").dispatchEvent("input");
  await page.waitForTimeout(700);
  const idlePaints = await page.evaluate(async () => {
    const c = window.__studio.compositor,
      draw = c.draw;
    let paints = 0;
    c.draw = function (...args) {
      paints++;
      return draw.apply(this, args);
    };
    await new Promise((resolve) => setTimeout(resolve, 650));
    c.draw = draw;
    return paints;
  });
  assert.ok(
    idlePaints <= 2,
    `Static live preview repainted ${idlePaints} times`,
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.click("#preview-record");
  await page.waitForFunction(() => window.__studio.engine.recording);
  assert.equal(
    await page.getAttribute("#preview-transport", "data-state"),
    "recording",
  );
  const transport = await page.locator("#preview-transport").boundingBox();
  assert.ok(transport.y >= 0 && transport.y + transport.height <= 720);
  await page.waitForTimeout(1100);
  await page.click("#preview-pause");
  await page.waitForFunction(() => window.__studio.engine.paused);
  assert.equal(await page.textContent("#overlay-record-state"), "PAUSED");
  await page.waitForTimeout(350);
  const pausedTime = await page.evaluate(() => window.__studio.engine.time());
  await page.click('[data-view="mods"]');
  assert.equal(await page.isDisabled("#mods-import"), true);
  await page.waitForTimeout(650);
  const paused = await page.evaluate(() => ({
    time: window.__studio.engine.time(),
    timer: window.__studio.compositor.timer,
    width: window.__studio.compositor.canvas.width,
  }));
  assert.equal(paused.time, pausedTime);
  assert.equal(paused.timer, null);
  assert.equal(paused.width, 1920);
  await page.click('[data-view="studio"]');
  await page.click("#preview-pause");
  await page.waitForFunction(() => !window.__studio.engine.paused);
  await page.setViewportSize({ width: 1600, height: 1080 });
  await page.waitForTimeout(2200);
  await page
    .locator(".toast button")
    .evaluateAll((buttons) => buttons.forEach((b) => b.click()));
  await page.screenshot({ path: path.join(shots, "studio-recording.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: path.join(shots, "studio-compact.png") });
  await page.click("#preview-record");
  await page.waitForFunction(
    () =>
      !window.__studio.engine.recording && !window.__studio.engine.finishing,
    null,
    { timeout: 60000 },
  );
  const session = (await store.list())[0];
  assert.equal(session.status, "recorded");
  const video = path.join(session.dir, session.videoFile || "capture.webm");
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-count_frames",
        "-show_streams",
        "-of",
        "json",
        video,
      ],
      { encoding: "utf8" },
    ),
  ).streams[0];
  assert.equal(probe.width, 1920);
  assert.equal(probe.height, 1080);
  assert.ok(
    Number(probe.nb_read_frames) > session.duration * 20,
    "Unexpected recording frame loss",
  );
  await page.click('[data-view="mods"]');
  await page.setInputFiles(
    "#pack-file",
    path.resolve(__dirname, "../examples/field-notes.json"),
  );
  await page.click("#confirm-pack");
  await page.waitForSelector("#mod-pack-enabled");
  const compositions = await page.evaluate(() =>
    JSON.stringify(window.__studio.compositor.documents),
  );
  await page.uncheck("#mod-pack-enabled");
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.__studio.compositor.documents),
    ),
    compositions,
  );
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => !!window.__studio);
  await page.click('[data-view="mods"]');
  assert.equal(await page.isChecked("#mod-pack-enabled"), false);
  await page.check("#mod-pack-enabled");
  await page.setViewportSize({ width: 1480, height: 960 });
  await page.screenshot({ path: path.join(shots, "mods.png") });
  await page.click("#mod-pack-remove");
  await page.click("#confirm-remove-pack");
  assert.equal(await page.isVisible("#mods-empty"), true);
  await page.click('[data-view="studio"]');
  for (const size of [
    { width: 1100, height: 740 },
    { width: 960, height: 640 },
  ]) {
    await page.setViewportSize(size);
    assert.ok(
      (await page.evaluate(() => document.documentElement.scrollWidth)) <=
        size.width,
      "Horizontal overflow",
    );
  }
  await page.evaluate(() => {
    window.__studio.setScene("break");
    window.__studio.config.countdown = true;
  });
  await page.click("#preview-record");
  await page.waitForTimeout(200);
  await page.click("#preview-record");
  await page.click("#preview-record");
  await page.waitForTimeout(1050);
  assert.equal(
    await page.getAttribute("#preview-transport", "data-state"),
    "countdown",
  );
  assert.equal(await page.textContent("#record-label"), "Cancel countdown");
  await page.click("#preview-record");
  assert.equal(
    await page.getAttribute("#preview-transport", "data-state"),
    "ready",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        idlePaints,
        codec: probe.codec_name,
        frames: Number(probe.nb_read_frames),
        duration: session.duration,
        paused,
        screenshots: shots,
        uiErrors: errors,
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
