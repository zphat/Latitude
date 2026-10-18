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
      return store.export(args[0], args[1], require("ffmpeg-static"));
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
  await page.addInitScript(() =>
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
  const height = Number(process.env.LATITUDE_TEST_HEIGHT) || 2160,
    fps = Number(process.env.LATITUDE_TEST_FPS) || 60;
  await page.goto("http://127.0.0.1:4173/src/index.html?test");
  await page.waitForFunction(() => !!window.__studio);
  await page.evaluate(async () => {
    const { engine, compositor } = window.__studio;
    await engine.init();
    const c = document.createElement("canvas");
    c.width = 1920;
    c.height = 1080;
    const ctx = c.getContext("2d");
    let i = 0;
    window.qualityCanvas = c;
    setInterval(() => {
      ctx.fillStyle = "#18342a";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#c8ef60";
      ctx.fillRect((i++ * 8) % 1920, 400, 180, 180);
    }, 16);
    const stream = c.captureStream(60);
    engine.streams.screen = stream;
    compositor.setScreen(stream);
    engine.emit("sources", engine.sourceState());
  });
  await page.click("#add-source");
  await page.click('[data-add-source="text"]');
  await page.fill("#source-text", "Latitude · crystal clear");
  await page.locator("#source-text").press("Tab");
  await page.check("#source-gradient");
  await page.fill("#source-color", "#ff8800");
  await page.locator("#source-color").dispatchEvent("change");
  await page.fill("#source-color2", "#ffcc99");
  await page.locator("#source-color2").dispatchEvent("change");
  await page.click('[data-view="settings"]');
  await page.selectOption("#video-size", String(height));
  await page.selectOption("#video-fps", String(fps));
  await page.selectOption("#video-quality", "efficient");
  assert.equal(
    await page.evaluate(() => window.__studio.compositor.canvas.width),
    1280,
  );
  await page.click('[data-view="studio"]');
  await page.click("#record-button");
  await page.waitForFunction(() => window.__studio.engine.recording);
  assert.equal(
    await page.evaluate(() => window.__studio.compositor.canvas.width),
    (height * 16) / 9,
  );
  await page.evaluate(async () => {
    const { engine } = window.__studio;
    engine.outputs.register({
      id: "test-output",
      start: async ({ stream }) => {
        window.outputClone = stream;
        window.outputStarted = true;
      },
      stop: async () => {
        window.outputStopped = true;
      },
    });
    await engine.outputs.start("test-output");
  });
  assert.equal(
    await page.evaluate(() => window.outputClone.getTracks().length),
    2,
  );
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.__studio.engine.outputs.stop("test-output"));
  assert.equal(
    await page.evaluate(() =>
      window.outputClone.getTracks().every((t) => t.readyState === "ended"),
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => window.__studio.engine.canvasStream.getVideoTracks()[0].readyState,
    ),
    "live",
  );
  await page.waitForTimeout(4200);
  const measured = await page.evaluate(() => ({
    compositorFps: window.__studio.compositor.measuredFps,
    drawMs: window.__studio.compositor.drawMs,
  }));
  await page.click("#record-button");
  await page.waitForFunction(
    () =>
      !window.__studio.engine.recording && !window.__studio.engine.finishing,
    null,
    { timeout: 60000 },
  );
  const session = (await store.list())[0],
    video = path.join(session.dir, session.videoFile || "capture.webm");
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
  assert.equal(probe.width, (height * 16) / 9);
  assert.equal(probe.height, height);
  assert.ok(Number(probe.nb_read_frames) > 0);
  const frame = execFileSync(
    require("ffmpeg-static"),
    [
      "-v",
      "error",
      "-i",
      video,
      "-ss",
      "1",
      "-frames:v",
      "1",
      "-vf",
      "scale=640:360",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  let textPixels = 0;
  for (let i = 640 * 260 * 3; i < frame.length; i += 3)
    if (
      frame[i] > 170 &&
      frame[i + 1] > 70 &&
      frame[i + 1] < 230 &&
      frame[i + 2] < 170
    )
      textPixels++;
  assert.ok(textPixels > 200, `Missing gradient text: ${textPixels}`);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    JSON.stringify(
      {
        ok: true,
        requested: { height, fps },
        codec: probe.codec_name,
        frames: Number(probe.nb_read_frames),
        audioDuration: session.duration,
        decodedFramesPerSecond: Number(probe.nb_read_frames) / session.duration,
        ...measured,
        textPixels,
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
