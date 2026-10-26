// Real AudioWorklet -> renderer meter timing, with known input levels.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
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
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1480, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() =>
      !localStorage.getItem("latitude-v2") && localStorage.setItem(
        "latitude-v2",
        JSON.stringify({ onboarded: true, reconnectMic: false }),
      ),
    );
    await page.goto("http://127.0.0.1:4173/src/index.html?test");
    await page.waitForFunction(() => !!window.__studio);
    await page.evaluate(async () => {
      const { engine } = window.__studio;
      await engine.init();
      const oscillator = engine.ctx.createOscillator(),
        gain = engine.ctx.createGain(),
        dest = engine.ctx.createMediaStreamDestination();
      oscillator.frequency.value = 375;
      gain.gain.value = 0.25;
      oscillator.connect(gain).connect(dest);
      oscillator.start();
      await engine.attach("mic1", dest.stream, 0);
      engine.emit("sources", engine.sourceState());
      window.testGain = gain;
      window.testOscillator = oscillator;
      window.meterChecks = [];
      engine.addEventListener("meters", ({ detail: m }) => {
        window.meterChecks.push({
          clip: m.clips[0] > 0,
          flash: document
            .querySelector('[data-mixer="0"]')
            .classList.contains("input-clipping"),
          input: m.inputPeaks[0],
          output: m.peaks[0],
          limiter: m.limiterReduction[0],
        });
        if (window.meterChecks.length > 400) window.meterChecks.shift();
      });
    });
    await page.waitForFunction(() => window.meterChecks.length >= 5);
    assert.match(
      await page.textContent("#input-peak-voice1"),
      /−?\-?12\.0 dBFS/,
    );
    assert.match(await page.textContent("#status-voice1"), /12\.0 dB to clip/);
    const normal = await page.evaluate(() => window.meterChecks.at(-1));
    assert.equal(normal.flash, false);
    await page.evaluate(() => {
      window.testGain.gain.value = 1.2;
    });
    await page.waitForFunction(() =>
      document
        .querySelector('[data-mixer="0"]')
        .classList.contains("input-clipping"),
    );
    assert.match(await page.textContent("#status-voice1"), /INPUT CLIP.*now/);
    const shots = process.env.LATITUDE_QA_SHOTS || "/tmp/latitude-audio-meters";
    await fs.mkdir(shots, { recursive: true });
    await page
      .locator("#mixer")
      .screenshot({ path: path.join(shots, "input-clipping.png") });
    await page.click("#reset-peaks");
    assert.equal(
      await page
        .locator('[data-mixer="0"]')
        .evaluate((el) => el.classList.contains("input-clipping")),
      true,
    );
    await page.evaluate(() => {
      window.testGain.gain.value = 0.1;
    });
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[data-mixer="0"]')
          .classList.contains("input-clipping"),
    );
    assert.match(await page.textContent("#status-voice1"), /Clipped earlier/);
    await page.click("#reset-peaks");
    await page.waitForFunction(() =>
      document
        .querySelector("#status-voice1")
        .textContent.includes("dB to clip"),
    );
    // A clean device with excessive software gain is limited, not falsely marked as input clipping.
    await page.evaluate(() => {
      window.testGain.gain.value = 0.5;
      window.__studio.engine.setVoice(0, { bypass: true, gain: 24 });
    });
    await page.waitForFunction(() =>
      document.querySelector("#safety-voice1").textContent.includes("catching"),
    );
    assert.equal(
      await page
        .locator('[data-mixer="0"]')
        .evaluate((el) => el.classList.contains("input-clipping")),
      false,
    );
    await page
      .locator("#mixer")
      .screenshot({ path: path.join(shots, "limiter-active.png") });
    const checks = await page.evaluate(() => window.meterChecks);
    assert.ok(checks.some((x) => x.clip) && checks.some((x) => !x.clip));
    assert.ok(
      checks.every((x) => x.clip === x.flash),
      "red outline must follow the current worklet window without a hold",
    );
    assert.ok(checks.every((x) => x.output <= Math.pow(10, -1.5 / 20) + 1e-6));
    await page.evaluate(() => {
      window.testGain.gain.value = 0.2;
      window.testOscillator.frequency.value = 6500;
      window.__studio.engine.setVoice(0, { bypass: false, gain: 0, deess: 3.5 });
    });
    await page.waitForFunction(() => parseFloat(document.querySelector("#deesser-gr").textContent) > 1);
    await page.evaluate(() => { window.testOscillator.frequency.value = 1500; });
    await page.waitForFunction(() => parseFloat(document.querySelector("#deesser-gr").textContent) < 0.2);
    await page.evaluate(() => window.__studio.engine.ctx.suspend());
    await page.waitForFunction(
      () =>
        document.querySelector("#status-voice1").textContent === "Meter paused",
    );
    for (const width of [960, 1280, 1480]) {
      await page.setViewportSize({ width, height: 640 });
      await page.evaluate(() => {
        const w = document.querySelector("#workspace");
        w.scrollTop = w.scrollHeight;
      });
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll(".mixer-card")].some(
          (el) => el.scrollWidth > el.clientWidth,
        ),
      }));
      assert.ok(layout.scroll <= layout.width);
      assert.equal(layout.overflow, false);
      const mixer = await page.locator("#mixer").boundingBox(),
        controls = await page.locator(".record-bar").boundingBox();
      assert.ok(
        mixer.y + mixer.height <= controls.y + 1,
        "record controls must not cover the meter or mute/gain controls",
      );
    }
    await page.screenshot({
      path: path.join(shots, "compact-meter-layout.png"),
    });
    // Simulate a saved 0.9.2 profile. Startup must preserve its numeric tone.
    await page.evaluate(() => {
      const { engine, config } = window.__studio;
      config.preset[0] = "broadcast";
      engine.setVoice(0, { air: 0.5, polish: 35, gain: -3, channel: "right", syncMs: 35, bypass: true });
      const saved = JSON.parse(localStorage.getItem("latitude-v2"));
      saved.preset = ["broadcast", "natural"];
      saved.voices = engine.voiceSettings;
      localStorage.setItem("latitude-v2", JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForFunction(() => !!window.__studio);
    const old = await page.evaluate(() => window.__studio.engine.voiceSettings[0]);
    assert.equal(old.air, 0.5);
    assert.equal(old.polish, 35);
    await page.evaluate(() => window.__studio.engine.setVoice(0, { mute: true }));
    await page.click("#reapply-preset");
    const updated = await page.evaluate(() => window.__studio.engine.voiceSettings[0]);
    assert.equal(updated.air, 0);
    assert.equal(updated.polish, 25);
    assert.equal(updated.gain, -3);
    assert.equal(updated.channel, "right");
    assert.equal(updated.syncMs, 35);
    assert.equal(updated.mute, true);
    assert.equal(updated.bypass, false);
    assert.equal(updated.clarityBypass, false);
    await page.selectOption("#voice-preset", "custom");
    assert.equal(await page.textContent("#reapply-preset"), "Use Natural");
    await page.click("#reapply-preset");
    assert.equal(await page.inputValue("#voice-preset"), "natural");
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: "passed",
        meterWindows: checks.length,
        inputLevelDb: -12.04,
        noHeldClipFlash: true,
        protectedOutput: true,
        shots,
      }),
    );
  } finally {
    await browser.close();
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
