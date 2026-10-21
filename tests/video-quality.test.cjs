const test = require("node:test");
const assert = require("node:assert/strict");
const quality = import("../src/video-quality.js");

test("screen capture preserves native pixels before composition cropping", async () => {
  const { captureConstraints } = await quality;
  assert.deepEqual(captureConstraints("screen", 1920, 1080, 30), {
    resizeMode: "none",
    frameRate: { ideal: 30, max: 30 },
  });
  assert.deepEqual(captureConstraints("camera", 1920, 1080, 60), {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 60, max: 60 },
  });
});

test("frame deadlines do not accumulate timer jitter or burst after a stall", async () => {
  const { FrameClock } = await quality;
  const clock = new FrameClock();
  let now = 0;
  for (let i = 0; i < 300; i++) {
    clock.advance(now, 30);
    now += clock.delay(now) + 1;
  }
  assert.ok(Math.abs(now - 10000) < 4, `Drift: ${now - 10000}`);
  now += 3000;
  clock.advance(now, 30);
  assert.ok(clock.delay(now) >= 16 && clock.delay(now) <= 50);
  clock.advance(now, 60);
  assert.ok(clock.delay(now) >= 8 && clock.delay(now) <= 25);
  clock.reset();
  clock.advance(0, 30);
  assert.equal(clock.delay(0), 34);
});

test("source boundaries align to output pixels without changing saved transforms", async () => {
  const { pixelBounds, setVideoHint } = await quality;
  const layer = { x: 0.12345, y: 0.23456, w: 0.5, h: 0.4 };
  const before = { ...layer };
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
    [3840, 2160],
  ]) {
    const box = pixelBounds(layer, w, h);
    for (const n of [
      (box.x * w) / 1920,
      (box.y * h) / 1080,
      (box.w * w) / 1920,
      (box.h * h) / 1080,
    ])
      assert.ok(Math.abs(n - Math.round(n)) < 1e-8);
  }
  assert.deepEqual(layer, before);
  const track = { contentHint: "" };
  setVideoHint(track, 30);
  assert.equal(track.contentHint, "detail");
  setVideoHint(track, 60);
  assert.equal(track.contentHint, "motion");
  setVideoHint(track, 30, true);
  assert.equal(track.contentHint, "motion");
  assert.doesNotThrow(() =>
    setVideoHint(
      Object.defineProperty({}, "contentHint", {
        set() {
          throw Error("Unsupported");
        },
      }),
      30,
    ),
  );
});
