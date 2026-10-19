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
        version: "test",
        shortcutFailures: [],
      };
    if (action === "begin") return store.begin(args[0]);
    if (action === "chunk")
      return store.append(args[0], args[1], Buffer.from(args[2], "base64"));
    if (action === "end") return store.end(args[0]);
    if (action === "sessions") return store.list();
    if (action === "event") return store.event(...args);
    if (action === "export")
      return store.export(args[0], args[1], (process.env.TAKE_FFMPEG || require("ffmpeg-static")));
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
  console.log("UI: opening");
  await page.goto("http://127.0.0.1:4173/src/index.html?test");
  await page.waitForFunction(() => !!window.__studio);
  await page.waitForTimeout(500);
  await page.waitForSelector("#onboard-mic");
  await page.click("#onboard-connect");
  await page.waitForFunction(() => !!window.__studio.engine.streams.mic1);
  await page.click("#onboard-next");
  assert.equal(await page.locator("#modal").evaluate((d) => d.open), false);
  assert.equal(
    await page.evaluate(() => window.__studio.compositor.scene),
    "screen",
  );
  await page.evaluate(() =>
    document.querySelectorAll(".toast").forEach((t) => t.remove()),
  );
  await page.screenshot({
    path: path.resolve(__dirname, "../../latitude-preview.png"),
  });
  assert.equal(await page.locator(".scene-card").count(), 5);
  assert.equal(await page.locator(".mixer-card").count(), 4);
  console.log("UI: layout and controls");
  // Visible interactions and persisted values.
  await page.selectOption("#voice-preset", "broadcast");
  await page.locator("#polish").fill("12");
  await page.locator("#polish").dispatchEvent("input");
  await page.click('[data-voice="1"]');
  await page.selectOption("#voice-preset", "soft");
  await page.click('[data-voice="0"]');
  assert.equal(await page.inputValue("#polish"), "12");
  await page.click("#templates-button");
  await page.click('[data-template="0"]');
  assert.equal(
    await page.locator(".scene-card.active").getAttribute("data-scene"),
    "present",
  );
  await page.click('[data-view="settings"]');
  await page.uncheck("#auto-export");
  await page.uncheck("#use-countdown");
  await page.click('[data-view="studio"]');
  console.log("UI: inputs");
  // Exercise getUserMedia and device selection before adding synthetic inputs.
  await page.click("#audio-setup");
  await page.click("#apply-devices");
  await page.waitForFunction(() => !!window.__studio.engine.streams.mic1);
  console.log("UI: synthetic signals");
  await page.evaluate(async () => {
    const { engine, compositor, config } = window.__studio;
    await engine.init();
    config.autoExport = false;
    config.countdown = false;
    config.width = 640;
    config.height = 360;
    const ctx = engine.ctx;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        dest = ctx.createMediaStreamDestination();
      osc.frequency.value = [330, 550, 770][i];
      gain.gain.value = [0.12, 0.09, 0.15][i];
      osc.connect(gain).connect(dest);
      osc.start();
      await engine.attach(i === 2 ? "desktop" : `mic${i + 1}`, dest.stream, i);
    }
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const c = canvas.getContext("2d");
    let n = 0;
    setInterval(() => {
      c.fillStyle = "#22363c";
      c.fillRect(0, 0, 640, 360);
      c.fillStyle = "#c9e7bf";
      c.fillRect((n++ * 4) % 640, 130, 60, 60);
      c.font = "28px sans-serif";
      c.fillText("RECORDING ENGINE TEST", 65, 80);
    }, 30);
    const stream = canvas.captureStream(30);
    engine.streams.screen = stream;
    compositor.setScreen(stream);
    engine.streams.camera = stream.clone();
    compositor.setCamera(engine.streams.camera);
    engine.emit("sources", engine.sourceState());
  });
  console.log("UI: recording");
  await page.click("#record-button");
  await page.waitForFunction(() => window.__studio.engine.recording);
  await page.waitForTimeout(1800);
  await page.click('[data-scene="split"]');
  await page.click("#marker-button");
  await page.click("#pause-button");
  const paused = await page.evaluate(() => window.__studio.engine.time());
  await page.waitForTimeout(1000);
  assert.equal(
    await page.evaluate(() => window.__studio.engine.time()),
    paused,
  );
  await page.click("#pause-button");
  await page.click('[data-mute="0"]');
  const mutedAt = await page.evaluate(() => window.__studio.engine.time());
  await page.waitForTimeout(1400);
  await page.click('[data-mute="0"]');
  await page.waitForTimeout(1600);
  await page.screenshot({
    path: path.resolve(__dirname, "../../qa-recording.png"),
  });
  console.log("UI: stopping");
  await page.click("#record-button");
  console.log(
    await page.evaluate(() => ({
      recording: window.__studio.engine.recording,
      finishing: window.__studio.engine.finishing,
      pending: window.__studio.engine.pendingBytes,
      errors: [...document.querySelectorAll(".toast.error")].map(
        (x) => x.innerText,
      ),
    })),
  );
  await page.waitForFunction(
    () =>
      !window.__studio.engine.recording && !window.__studio.engine.finishing,
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(200);
  console.log("UI: validating files");
  const s = (await store.list())[0];
  assert.ok(s.duration > 4.5 && s.duration < 20, `duration ${s.duration}`);
  assert.equal(s.markers.length, 1);
  assert.equal(s.scenes.length, 1);
  const lengths = await Promise.all(
    TRACKS.map(
      async (t) =>
        ((await fs.stat(path.join(s.dir, `${t.id}.wav`))).size - 80) /
        (t.channels * 4),
    ),
  );
  assert.ok(
    lengths.every((x) => x === lengths[0]),
    String(lengths),
  );
  const raw = await fs.readFile(path.join(s.dir, "raw1.wav"));
  const samples = new Float32Array(
    raw.buffer,
    raw.byteOffset + 80,
    (raw.length - 80) / 4,
  );
  let muteRms = 0,
    count = 0;
  for (
    let i = Math.floor((mutedAt + 0.3) * 48000);
    i < Math.min(samples.length, Math.floor((mutedAt + 0.9) * 48000));
    i++
  ) {
    muteRms += samples[i] ** 2;
    count++;
  }
  assert.ok(
    Math.sqrt(muteRms / count) < 0.001,
    "original backup must also mute",
  );
  console.log("UI: exporting");
  await page.click("[data-export-take]");
  await page.check("#export-copies");
  await page.click("#start-export");
  await page.waitForFunction(
    () => document.querySelector("#export-progress").hidden,
    { timeout: 60000 },
  );
  const exported = (await store.list())[0];
  assert.equal(exported.status, "exported");
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        path.join(exported.exports[0].path, "Recording.mp4"),
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(probe.streams.filter((s) => s.codec_type === "audio").length, 4);
  // Actual raw video must have no extra paused second relative to audio.
  const rawProbe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_packets",
        "-select_streams",
        "v:0",
        "-of",
        "json",
        path.join(s.dir, s.videoFile || "capture.webm"),
      ],
      { encoding: "utf8" },
    ),
  );
  const packets = rawProbe.packets;
  const videoDuration =
    Number(packets.at(-1).pts_time) +
    Number(packets.at(-1).duration_time || 0.033);
  assert.ok(
    Math.abs(videoDuration - s.duration) < 0.2,
    `video ${videoDuration}, audio ${s.duration}`,
  );
  await page.click('[data-view="studio"]');
  await page.setViewportSize({ width: 1100, height: 740 });
  await page.screenshot({
    path: path.resolve(__dirname, "../../qa-compact.png"),
  });
  assert.ok(await page.locator("#record-button").isVisible());
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    JSON.stringify(
      {
        ok: true,
        duration: s.duration,
        frames: lengths[0],
        videoDuration,
        isolatedTracks: probe.streams.filter((s) => s.codec_type === "audio")
          .length,
        uiErrors: errors,
        export: exported.exports[0].report,
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
