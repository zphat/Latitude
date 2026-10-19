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
  await page.goto("http://127.0.0.1:4173/src/index.html?test");
  await page.waitForFunction(() => !!window.__studio);
  await page.evaluate(async () => {
    const { engine, config } = window.__studio;
    await engine.init();
    config.width = 640;
    config.height = 360;
    window.captureRequests = [];
    const make = (color) => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 360;
      const x = c.getContext("2d"),
        draw = () => {
          x.fillStyle = color;
          x.fillRect(0, 0, 640, 360);
          if (color === "#ff0000") {
            x.fillStyle = "#0000ff";
            x.fillRect(320, 0, 320, 360);
            x.fillStyle = "#ff00ff";
            x.fillRect(0, 0, 640, 40);
            x.fillStyle = "#ffffff";
            x.fillRect(0, 340, 640, 20);
          }
        };
      draw();
      setInterval(draw, 50);
      return c;
    };
    window.pictures = {
      a: make("#ff0000"),
      b: make("#00ff00"),
      camera: make("#00ffff"),
    };
    window.take.sources = async () => [
      { id: "a", name: "Screen A", thumbnail: "" },
      { id: "b", name: "Screen B", thumbnail: "" },
    ];
    window.take.chooseSource = async (id) => (window.captureId = id);
    navigator.mediaDevices.getDisplayMedia = async (opts) => {
      window.captureRequests.push(opts.audio);
      const stream = window.pictures[window.captureId].captureStream(30);
      if (opts.audio) {
        const o = engine.ctx.createOscillator(),
          g = engine.ctx.createGain(),
          d = engine.ctx.createMediaStreamDestination();
        g.gain.value = 0.04;
        o.connect(g).connect(d);
        o.start();
        stream.addTrack(d.stream.getAudioTracks()[0]);
      }
      return stream;
    };
  });
  const clickPoint = async (x, y) => {
    const r = await page.locator("#layout-overlay").boundingBox();
    await page.mouse.click(r.x + r.width * x, r.y + r.height * y);
  };
  const drag = async (x, y, dx, dy) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 6 });
    await page.mouse.up();
  };
  const cropA = async () => {
    await clickPoint(0.3, 0.4);
    await page.click("#source-crop");
  };
  console.log("Editor: capture retry and exact crop");
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getDisplayMedia;
    let first = true;
    navigator.mediaDevices.getDisplayMedia = (opts) => {
      if (first) {
        first = false;
        return Promise.reject(Error("Test permission denied"));
      }
      return original(opts);
    };
  });
  await page.click("#screen-source");
  await page.click('[data-source="a"]');
  await page.waitForSelector(".modal-error");
  assert.ok(await page.locator('[data-source="a"]').isEnabled());
  await page.click('[data-source="a"]');
  await page.waitForFunction(() =>
    window.__studio.compositor.ready(window.__studio.compositor.screen),
  );
  await cropA();
  await page.fill("#crop-top", "40");
  await page.fill("#crop-bottom", "20");
  await page.fill("#crop-right", "320");
  assert.equal(
    await page.locator("#crop-size").innerText(),
    "Keep 320 × 300 px",
  );
  await page.click("#crop-apply");
  const crop = await page.evaluate(
    () => window.__studio.compositor.getLayers()[0].crop,
  );
  await cropA();
  await page.click('[data-crop-preset="full"]');
  await page.click("#crop-cancel");
  assert.deepEqual(
    await page.evaluate(() => window.__studio.compositor.getLayers()[0].crop),
    crop,
  );
  console.log("Editor: direct manipulation and undo");
  const handle = await page.locator('[data-handle="se"]').boundingBox();
  await drag(handle.x + 4, handle.y + 4, -55, -30);
  assert.ok(
    await page.evaluate(
      () => window.__studio.compositor.getLayers()[0].w < 0.95,
    ),
  );
  const box = await page.locator("#selection-box").boundingBox();
  await drag(box.x + box.width * 0.5, box.y + box.height * 0.5, 30, 15);
  assert.ok(
    await page.evaluate(() => window.__studio.compositor.getLayers()[0].x > 0),
  );
  await page.click("#undo-edit");
  await page.click("#undo-edit");
  assert.equal(
    await page.evaluate(() => window.__studio.compositor.getLayers()[0].w),
    1,
  );
  console.log("Editor: text, gradient, images and packs");
  await page.click("#add-source");
  await page.click('[data-add-source="text"]');
  await page.fill("#source-text", "Latitude studio");
  await page.locator("#source-text").press("Tab");
  await page.check("#source-gradient");
  await page.fill("#source-color", "#ff9900");
  await page.locator("#source-color").dispatchEvent("change");
  await page.selectOption("#source-font", "Georgia");
  await page.click("#source-duplicate");
  assert.equal(await page.locator(".layer-row").count(), 3);
  await page.click("#undo-edit");
  assert.equal(await page.locator(".layer-row").count(), 2);
  const id = await page.evaluate(
    () =>
      window.__studio.compositor.getLayers().find((l) => l.type === "text").id,
  );
  await page.click(`[data-layer="${id}"]`);
  await page.click(`[data-lock="${id}"]`);
  await clickPoint(0.3, 0.8);
  assert.notEqual(
    await page.evaluate(() => window.__studio.sceneEditor.selected),
    id,
  );
  await page.click(`[data-layer="${id}"]`);
  await page.click(`[data-visible="${id}"]`);
  assert.ok(await page.locator("#selection-box").isHidden());
  await page.click(`[data-visible="${id}"]`);
  await page.click(`[data-lock="${id}"]`);
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "#d1ff4a";
    x.fillRect(0, 0, 64, 64);
    return c.toDataURL().split(",")[1];
  });
  await page.setInputFiles("#image-file", {
    name: "Logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.waitForFunction(
    () => window.__studio.compositor.getLayers().length === 3,
  );
  await page.click('[data-view="settings"]');
  assert.equal(await page.locator("#theme-select option").count(), 5);
  for (const t of ["signal", "dusk", "linen", "latitude", "tide"])
    await page.selectOption("#theme-select", t);
  await page.selectOption("#theme-select", "signal");
  await page.selectOption("#video-size", "2160");
  await page.selectOption("#video-fps", "60");
  assert.deepEqual(
    await page.evaluate(() => [
      window.__studio.compositor.outputWidth,
      window.__studio.compositor.canvas.width,
    ]),
    [3840, 1280],
  );
  await page.evaluate(
    () =>
      (window.take.savePack = async (p) => {
        window.savedPack = p;
        return true;
      }),
  );
  await page.click("#export-layout");
  await page.waitForFunction(() => !!window.savedPack);
  const pack = await page.evaluate(() => window.savedPack);
  assert.equal(pack.templates[0].composition.length, 3);
  assert.equal(Object.keys(pack.assets).length, 1);
  await page.setInputFiles("#pack-file", {
    name: "Scene.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pack)),
  });
  await page.click("#confirm-pack");
  await page.waitForFunction(() => !document.querySelector("#modal").open);
  assert.equal(await page.locator("#theme-select option").count(), 6);
  assert.equal(
    await page.evaluate(() => window.__studio.config.pack.assets),
    undefined,
  );
  await page.selectOption("#video-size", "720");
  await page.selectOption("#video-fps", "30");
  await page.click('[data-view="studio"]');
  await page.click("#templates-button");
  await page.click('[data-template="3"]');
  assert.equal(
    await page.evaluate(() => window.__studio.compositor.getLayers().length),
    3,
  );
  console.log("Editor: camera position and separate captures");
  await page.evaluate(() => {
    const { engine, compositor } = window.__studio;
    engine.streams.camera = window.pictures.camera.captureStream(30);
    compositor.setCamera(engine.streams.camera);
    engine.emit("sources", engine.sourceState());
  });
  await page.click('[data-scene="present"]');
  await page.waitForFunction(() =>
    window.__studio.compositor.ready(window.__studio.compositor.camera),
  );
  await page.waitForTimeout(400);
  await clickPoint(0.83, 0.8);
  assert.equal(
    await page.evaluate(
      () =>
        window.__studio.compositor
          .getLayers()
          .find((l) => l.id === window.__studio.sceneEditor.selected).source,
    ),
    "camera",
  );
  const before = await page.evaluate(() => ({
      ...window.__studio.compositor.facecamRect(),
    })),
    cam = await page.locator("#selection-box").boundingBox();
  await drag(cam.x + cam.width / 2, cam.y + cam.height / 2, -30, -15);
  assert.ok(
    await page.evaluate(
      (x) => window.__studio.compositor.facecamRect().x < x,
      before.x,
    ),
  );
  await page.selectOption("#source-shape", "circle");
  const circle = await page.evaluate(() =>
    window.__studio.compositor.facecamRect(),
  );
  assert.ok(Math.abs(circle.w * 1920 - circle.h * 1080) < 0.01);
  await page.click("#screen-b-source");
  await page.click("#new-b");
  await page.click('[data-source="b"]');
  await page.waitForFunction(() =>
    window.__studio.compositor.ready(window.__studio.compositor.screenB),
  );
  assert.deepEqual(await page.evaluate(() => window.captureRequests), [
    true,
    false,
  ]);
  await page.click("#layout-button");
  await page.selectOption("#secondary-mode", "same");
  await page.click("#layout-done");
  await page.waitForTimeout(400);
  for (const [x, side] of [
    [0.25, "left"],
    [0.75, "right"],
  ]) {
    await clickPoint(x, 0.5);
    await page.click("#source-crop");
    await page.click(`[data-crop-preset="${side}"]`);
    await page.fill("#crop-top", "40");
    await page.fill("#crop-bottom", "20");
    await page.click("#crop-apply");
  }
  console.log("Editor: recorded pixels and stop while paused");
  await page.evaluate(() => {
    const { config } = window.__studio;
    config.width = 640;
    config.height = 360;
  });
  await page.click("#record-button");
  await page.waitForFunction(() => window.__studio.engine.recording);
  assert.ok(await page.locator("#layout-overlay").isHidden());
  await page.waitForTimeout(2400);
  await page.click("#pause-button");
  await page.click("#record-button");
  await page.waitForFunction(
    () =>
      !window.__studio.engine.recording && !window.__studio.engine.finishing,
    null,
    { timeout: 30000 },
  );
  const session = (await store.list())[0],
    bytes = execFileSync(
      (process.env.TAKE_FFMPEG || require("ffmpeg-static")),
      [
        "-v",
        "error",
        "-i",
        path.join(session.dir, session.videoFile || "capture.webm"),
        "-ss",
        "1",
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
  const pixel = (x, y) => [
    ...bytes.subarray((y * 640 + x) * 3, (y * 640 + x) * 3 + 3),
  ];
  assert.ok(pixel(160, 180)[0] > 230 && pixel(160, 180)[2] < 20);
  assert.ok(pixel(480, 180)[2] > 230 && pixel(480, 180)[0] < 20);
  let leaks = 0;
  for (let i = 0; i < bytes.length; i += 3)
    if (bytes[i] > 220 && bytes[i + 2] > 220) leaks++;
  assert.equal(leaks, 0);
  assert.equal((await fs.stat(path.join(session.dir, "voice1.wav"))).size, 80);
  await page.click('[data-view="studio"]');
  await page.setViewportSize({ width: 1100, height: 740 });
  await page.evaluate(() =>
    document.querySelectorAll(".toast").forEach((t) => t.remove()),
  );
  await page.screenshot({
    path: path.resolve(__dirname, "../../qa-editor-compact.png"),
  });
  const bounds = await page.evaluate(() => ({
    mixer: document.querySelector("#mixer").getBoundingClientRect().bottom,
    record: document.querySelector(".record-bar").getBoundingClientRect().top,
    button: document.querySelector("#record-button").getBoundingClientRect()
      .bottom,
  }));
  assert.ok(bounds.mixer <= bounds.record + 1, JSON.stringify(bounds));
  assert.ok(bounds.button < 740);
  console.log("Editor: graphic-only recording and unused camera");
  await page.evaluate(() => {
    const { engine, compositor, setScene } = window.__studio;
    for (const k of Object.keys(engine.streams)) engine.remove(k);
    compositor.setScreen(null);
    compositor.setScreen(null, "b");
    compositor.setCamera(null);
    setScene("screen");
  });
  for (const cam of [false, true]) {
    if (cam) {
      await page.click('[data-view="studio"]');
      await page.evaluate(() => {
        const { engine, compositor } = window.__studio;
        engine.streams.camera = window.pictures.camera.captureStream(30);
        compositor.setCamera(engine.streams.camera);
        engine.emit("sources", engine.sourceState());
      });
    }
    await page.click("#record-button");
    await page.waitForFunction(() => window.__studio.engine.recording);
    assert.equal(
      await page.evaluate(() => window.__studio.compositor.scene),
      "screen",
    );
    await page.waitForTimeout(500);
    await page.click("#record-button");
    await page.waitForFunction(
      () =>
        !window.__studio.engine.finishing && !window.__studio.engine.recording,
    );
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    JSON.stringify(
      {
        ok: true,
        cropLeakPixels: leaks,
        uiErrors: errors,
        compactBounds: bounds,
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
