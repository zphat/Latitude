// Real Chromium AudioWorklet + H.264 -> Matroska -> bundled FFmpeg -> RTMP receiver.
// No platform account or external service is contacted.
const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { StreamPublisher } = require("../electron/stream-publisher.cjs");
const { RecordingStore } = require("../electron/recording.cjs");
require("../scripts/preview.cjs");
const height = Number(process.env.LATITUDE_STREAM_HEIGHT) || 720;
const fps = Number(process.env.LATITUDE_STREAM_FPS) || 30;
const ffmpeg = process.env.TAKE_FFMPEG || require("ffmpeg-static");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-stream-"));
  const store = new RecordingStore(root);
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const received = path.join(root, "received.flv");
  const receiver = spawn(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-listen",
      "1",
      "-i",
      `rtmp://127.0.0.1:${port}/live/test-stream-key`,
      "-c",
      "copy",
      "-y",
      received,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let receiverLog = "";
  receiver.stderr.on("data", (d) => {
    receiverLog += d;
  });
  const receiverDone = new Promise((r) => receiver.on("close", r));
  const browser = await chromium.launch({
    executablePath: process.env.TAKE_TEST_BROWSER,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  let publisher;
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [],
      states = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const loaded = [];
    page.on("request", (r) => loaded.push(r.url()));
    publisher = new StreamPublisher({
      ffmpeg,
      onState: (state) => {
        states.push(state);
        page
          .evaluate((data) => window.streamListener?.(data), state)
          .catch(() => {});
      },
    });
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
      if (action === "event") return store.event(...args);
      if (action === "sessions") return store.list();
      if (action === "streamStart") return publisher.start(args[0]);
      if (action === "streamWrite") {
        const b = Buffer.from(args[1], "base64");
        await fs.appendFile(path.join(root, "source.mkv"), b);
        return publisher.write(args[0], b);
      }
      if (action === "streamStop") return publisher.stop(args[0]);
      if (["sources", "shortcuts"].includes(action)) return [];
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
        shortcuts: () => call("shortcuts"),
        sources: () => call("sources"),
        onAction() {},
        onProgress() {},
        onProblem() {},
        streamStart: (o) => call("streamStart", o),
        streamWrite: (id, b) =>
          call("streamWrite", id, new Uint8Array(b).toBase64()),
        streamStop: (id) => call("streamStop", id),
        onStreamState: (fn) => {
          window.streamListener = fn;
          return () => {
            window.streamListener = null;
          };
        },
      };
      localStorage.setItem(
        "latitude-v2",
        JSON.stringify({
          onboarded: true,
          autoExport: false,
          countdown: false,
          reconnectMic: false,
        }),
      );
    });
    await page.goto("http://127.0.0.1:4173/src/index.html?test");
    await page.waitForFunction(() => !!window.__studio);
    assert.equal(
      loaded.some((url) => url.includes("/mods/streaming/")),
      false,
      "disabled mod imports no encoder/muxer",
    );
    assert.equal(publisher.active, false);
    await page.evaluate(async () => {
      const { engine, compositor } = window.__studio;
      await engine.init();
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext("2d");
      let frame = 0;
      window.testDrawing = setInterval(() => {
        ctx.fillStyle = "#0b0e10";
        ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = "#d1ff4a";
        ctx.fillRect((frame++ * 6) % 1100, 380, 180, 100);
        ctx.font = "bold 50px sans-serif";
        ctx.fillText("Latitude · streaming test", 70, 160);
        ctx.font = "26px sans-serif";
        ctx.fillText(
          "Processed audio. One picture encode. Your studio, on air.",
          70,
          220,
        );
      }, 16);
      const stream = c.captureStream(30);
      engine.streams.screen = stream;
      compositor.setScreen(stream);
      const tone = engine.ctx.createOscillator(),
        gain = engine.ctx.createGain(),
        audio = engine.ctx.createMediaStreamDestination();
      tone.frequency.value = 440;
      gain.gain.value = 0.16;
      tone.connect(gain).connect(audio);
      tone.start();
      window.testTone = tone;
      await engine.attach("mic1", audio.stream, 0);
      engine.emit("sources", engine.sourceState());
    });
    await page.click('[data-view="settings"]');
    await page.selectOption("#video-size", String(height));
    await page.selectOption("#video-fps", String(fps));
    await page.click('[data-view="mods"]');
    await page.check('[data-mod-id="latitude-streaming"]');
    await page.click('[data-view="stream"]');
    await page.fill("#stream-server", `rtmp://127.0.0.1:${port}/live`);
    await page.fill("#stream-key", "test-stream-key");
    await page.fill("#stream-video", "3500");
    await page.click("#stream-toggle");
    await page.waitForFunction(
      () =>
        document.querySelector("#stream-state").textContent ===
        "Sending to platform",
      null,
      { timeout: 25000 },
    );
    assert.equal(
      await page.evaluate(() => window.__studio.engine.recording),
      false,
      "streaming does not require disk recording",
    );
    await wait(1800);
    await page.screenshot({ path: path.join(root, "streaming.png") });
    await page.click("#stream-studio");
    await page.setViewportSize({ width: 960, height: 640 });
    await page.screenshot({ path: path.join(root, "compact-live.png") });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.ok((await page.locator("#preview-record").boundingBox()).y < 640);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click("#record-button");
    await page.waitForFunction(() => window.__studio.engine.recording);
    await wait(1700);
    await page.click("#pause-button");
    const before =
      states.filter((s) => s.state === "sending").at(-1)?.seconds || 0;
    await wait(1600);
    const after =
      states.filter((s) => s.state === "sending").at(-1)?.seconds || 0;
    assert.ok(
      after > before + 0.8,
      "pausing disk recording keeps live audio and video flowing",
    );
    assert.equal(
      await page.evaluate(
        () => window.__studio.engine.paused && window.__studio.compositor.live,
      ),
      true,
    );
    await page.click("#pause-button");
    await wait(1800);
    await page.click("#record-button");
    await page.waitForFunction(
      () =>
        !window.__studio.engine.finishing && !window.__studio.engine.recording,
    );
    assert.equal(
      publisher.active,
      true,
      "stopping the local take preserves the stream",
    );
    await page.click('[data-view="stream"]');
    await wait(1300);
    const measurements = await page.evaluate(() => ({
      fps: window.__studio.compositor.measuredFps,
      drawMs: window.__studio.compositor.drawMs,
      dropped: document.querySelector("#stream-dropped").textContent,
    }));
    await page.click("#stream-toggle");
    await page.waitForFunction(
      () =>
        !window.__studio.engine.live &&
        document.querySelector("#stream-toggle").textContent ===
          "Start streaming",
    );
    assert.equal(publisher.active, false);
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(localStorage).includes("test-stream-key"),
      ),
      false,
      "no persisted stream key",
    );
    await Promise.race([receiverDone, wait(4000)]);
    if (receiver.exitCode === null) receiver.kill();
    const probe = JSON.parse(
      execFileSync(
        process.env.TAKE_FFPROBE || "ffprobe",
        [
          "-v",
          "error",
          "-show_streams",
          "-show_packets",
          "-of",
          "json",
          received,
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      ),
    );
    const video = probe.streams.find((s) => s.codec_type === "video"),
      audio = probe.streams.find((s) => s.codec_type === "audio");
    assert.equal(video.codec_name, "h264");
    assert.equal(video.width, (height * 16) / 9);
    assert.equal(video.height, height);
    assert.equal(audio.codec_name, "aac");
    assert.equal(audio.channels, 2);
    assert.equal(audio.sample_rate, "48000");
    const vp = probe.packets.filter((p) => p.stream_index === video.index),
      ap = probe.packets.filter((p) => p.stream_index === audio.index);
    const keys = vp
      .filter((p) => p.flags.includes("K"))
      .map((p) => Number(p.pts_time));
    const gaps = keys.slice(1).map((v, i) => v - keys[i]);
    assert.ok(Math.max(...gaps) <= 2.15, `keyframe spacing ${gaps}`);
    const duration = Number(vp.at(-1).pts_time) - Number(vp[0].pts_time);
    const measuredFps = (vp.length - 1) / duration;
    assert.ok(
      measuredFps > fps * 0.85 && measuredFps <= fps + 1,
      `received fps ${measuredFps}`,
    );
    const drift = Math.abs(
      Number(vp.at(-1).pts_time) - Number(ap.at(-1).pts_time),
    );
    assert.ok(drift < 0.15, `A/V end skew ${drift}`);
    const decoded = execFileSync(
      ffmpeg,
      ["-v", "error", "-i", received, "-map", "0:a", "-f", "f32le", "pipe:1"],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    let peak = 0,
      sum = 0;
    for (let i = 0; i < decoded.length; i += 4) {
      const n = decoded.readFloatLE(i);
      assert.ok(Number.isFinite(n));
      peak = Math.max(peak, Math.abs(n));
      sum += n * n;
    }
    assert.ok(
      peak < 1 && Math.sqrt(sum / (decoded.length / 4)) > 0.01,
      "audible unclipped processed audio arrives",
    );
    const takes = await store.list();
    assert.equal(takes.length, 1);
    assert.equal(takes[0].status, "recorded");
    assert.equal(errors.length, 0, errors.join("\n"));
    const receivers = [];
    const launchReceiver = (suffix) => {
      const child = spawn(
        ffmpeg,
        [
          "-v",
          "error",
          "-listen",
          "1",
          "-i",
          `rtmp://127.0.0.1:${port}/live/test-stream-key`,
          "-c",
          "copy",
          "-y",
          path.join(root, `reconnect-${suffix}.flv`),
        ],
        { stdio: "ignore" },
      );
      receivers.push(child);
      return child;
    };
    try {
      const interrupted = launchReceiver("first");
      await wait(300);
      await page.click("#stream-toggle");
      await page.waitForFunction(
        () =>
          document.querySelector("#stream-state").textContent ===
          "Sending to platform",
        null,
        { timeout: 25000 },
      );
      await page.click("#stream-studio");
      await page.click("#record-button");
      await page.waitForFunction(() => window.__studio.engine.recording);
      await wait(1200);
      interrupted.kill();
      await page.click('[data-view="stream"]');
      await page.waitForFunction(
        () =>
          document.querySelector("#stream-state").textContent ===
          "Connection interrupted",
        null,
        { timeout: 20000 },
      );
      assert.equal(
        await page.evaluate(() => window.__studio.engine.recording),
        true,
      );
      launchReceiver("second");
      await page.waitForFunction(
        () =>
          document.querySelector("#stream-state").textContent ===
          "Sending to platform",
        null,
        { timeout: 25000 },
      );
      await wait(1300);
      await page.click("#stream-toggle");
      await page.waitForFunction(
        () =>
          document.querySelector("#stream-toggle").textContent ===
          "Start streaming",
      );
      assert.equal(
        await page.evaluate(() => window.__studio.engine.recording),
        true,
        "ending broadcast preserves local take",
      );
      await page.click("#stream-studio");
      await page.click("#record-button");
      await page.waitForFunction(
        () =>
          !window.__studio.engine.finishing &&
          !window.__studio.engine.recording,
      );
      const allTakes = await store.list();
      assert.equal(allTakes.length, 2);
      assert.ok(allTakes.every((t) => t.status === "recorded"));
      await page.click('[data-view="stream"]');
      await page.click("#stream-toggle");
      await page.click("#stream-toggle");
      await page.waitForFunction(
        () =>
          document.querySelector("#stream-toggle").textContent ===
          "Start streaming",
      );
      await wait(2300);
      assert.equal(publisher.active, false);
      assert.equal(
        await page.evaluate(() => !!window.__studio.engine.live),
        false,
      );
    } finally {
      receivers.forEach((child) => child.kill());
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.click('[data-view="mods"]');
    await page.uncheck('[data-mod-id="latitude-streaming"]');
    assert.equal(await page.locator('[data-view="stream"]').count(), 0);
    assert.equal(await page.evaluate(() => !!window.streamListener), false);
    console.log(
      JSON.stringify(
        {
          root,
          measurements,
          received: {
            duration,
            measuredFps,
            avEndSkew: drift,
            maxKeyframeGap: Math.max(...gaps),
            audioPeak: peak,
          },
          reconnection: "passed; local take unaffected",
          cancelledConnection: "no restart",
          states: [...new Set(states.map((s) => s.state))],
          localTake: takes[0].status,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error({ root, receiverLog });
    throw error;
  } finally {
    await publisher?.stop();
    receiver.kill();
    await browser.close();
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
