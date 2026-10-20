// Linux UI/renderer behavior with generated media. Real audio servers and the
// installed Electron path are covered separately by linux-native and package CI.
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
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  page.setDefaultTimeout(12000);
  page.on("console", (m) => {
    if (m.type() === "error") console.error(m.text());
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    let bridgeLabel, sourceId;
    window.linuxQA = {
      connections: 0,
      disconnections: 0,
      shares: [],
      outputsFail: false,
      cancelShare: false,
    };
    const devices = navigator.mediaDevices.enumerateDevices.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.enumerateDevices = async () => {
      const list = await devices();
      const input = list.find((d) => d.kind === "audioinput");
      return bridgeLabel && input
        ? [
            ...list,
            {
              kind: "audioinput",
              deviceId: input.deviceId,
              label: bridgeLabel,
            },
          ]
        : list;
    };
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      window.linuxQA.shares.push(options);
      if (window.linuxQA.cancelShare)
        throw new DOMException("Sharing canceled", "NotAllowedError");
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      canvas.getContext("2d").fillRect(0, 0, 640, 360);
      return canvas.captureStream(30);
    };
    window.take = {
      desktop: true,
      platform: "linux",
      info: async () => ({
        platform: "linux",
        version: "test",
        root: "Videos/Latitude",
        encoder: true,
        shortcutFailures: [],
        capture: {
          picker: "portal",
          desktopAudio: "pulse",
          session: "wayland",
          flatpak: true,
        },
      }),
      audioOutputs: async () => {
        if (window.linuxQA.outputsFail) throw Error("Server unavailable");
        return [
          {
            name: "speakers",
            description: "Built-in speakers",
            isDefault: true,
          },
          { name: "usb", description: "USB headphones", isDefault: false },
        ];
      },
      connectDesktopAudio: async (sink) => {
        window.linuxQA.connections++;
        window.linuxQA.sink = sink;
        bridgeLabel = "latitude_desktop_test";
        return { label: bridgeLabel };
      },
      disconnectDesktopAudio: async () => {
        window.linuxQA.disconnections++;
        bridgeLabel = undefined;
      },
      sources: async () => [
        {
          id: "portal",
          name: "Choose a screen or window with your desktop…",
          thumbnail: "",
        },
      ],
      chooseSource: async (id) => {
        sourceId = id;
      },
      sessions: async () => [],
      shortcuts: async () => [],
      onAction() {},
      onProgress() {},
      onProblem() {},
      onAudioDisconnect() {},
    };
  });
  await page.goto("http://127.0.0.1:4173/src/index.html?test");
  await page.waitForSelector("#onboard-back");
  await page.click("#onboard-back");
  await page.click("#audio-setup");
  await page.selectOption("#setup-mic1", "off");
  await page.selectOption("#setup-desktop", "linux:usb");
  await page.click("#apply-devices");
  await page
    .waitForFunction(
      () => window.__studio.engine.streams.desktop?.active,
      null,
      { timeout: 12000 },
    )
    .catch(async (e) => {
      console.log(
        await page.evaluate(() => ({
          qa: window.linuxQA,
          toasts: [...document.querySelectorAll(".toast")].map(
            (t) => t.textContent,
          ),
          streams: Object.keys(window.__studio.engine.streams),
        })),
      );
      throw e;
    });
  assert.equal(await page.evaluate(() => window.linuxQA.sink), "usb");
  assert.equal(
    await page.evaluate(() => window.__studio.engine.desktopMode),
    "system",
  );
  await page.click("#audio-setup");
  assert.ok(
    !(await page.locator("#setup-mic1").textContent()).includes(
      "latitude_desktop_",
    ),
  );
  assert.ok(
    !(await page.locator("#modal-content").textContent()).includes("Windows"),
  );
  await page.screenshot({
    path: path.resolve(__dirname, "../../latitude-linux-audio.png"),
  });
  await page.keyboard.press("Escape");
  await page.click("#screen-source");
  await page.click('[data-source="portal"]');
  await page.waitForFunction(() => !!window.__studio.engine.streams.screen);
  assert.equal(
    await page.evaluate(() => window.linuxQA.shares[0].audio),
    false,
  );
  assert.equal(
    await page.evaluate(() => window.linuxQA.connections),
    1,
    "Sharing screen reuses the selected desktop audio bridge",
  );
  await page.click("#screen-source");
  await page.click("#disconnect-screen");
  assert.ok(
    await page.evaluate(() => window.__studio.engine.streams.desktop?.active),
    "Linux desktop audio survives screen disconnect",
  );
  await page.evaluate(() => {
    window.linuxQA.outputsFail = true;
  });
  await page.click("#audio-setup");
  assert.match(
    await page.locator("#modal-content").textContent(),
    /Desktop sound is unavailable/,
  );
  await page.selectOption("#setup-desktop", "off");
  await page.click("#apply-devices");
  await page.waitForFunction(() => !window.__studio.engine.streams.desktop);
  assert.equal(
    await page.evaluate(() => window.__studio.config.desktop),
    "off",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Linux routing UI, independent screen/audio, bridge reuse, server failure and cleanup passed at 1280×800.",
  );
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
