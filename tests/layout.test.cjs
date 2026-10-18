const test = require("node:test"),
  assert = require("node:assert/strict");
test("crops preserve precise bounds and scale with source resolution", async () => {
  const { cropPixels, cropFromMargins, rect } = await import(
    "../src/design.js"
  );
  assert.deepEqual(
    cropPixels(
      cropFromMargins({ left: 1919, top: 1079 }, 1920, 1080),
      1920,
      1080,
    ),
    { x: 1919, y: 1079, w: 1, h: 1 },
  );
  const r = cropFromMargins({ top: 100, bottom: 48 }, 1920, 1080);
  assert.deepEqual(cropPixels(r, 3840, 2160), {
    x: 0,
    y: 200,
    w: 3840,
    h: 1864,
  });
  for (let i = 0; i < 200; i++) {
    const p = cropPixels(
      rect({
        x: Math.sin(i) * 3,
        y: Math.cos(i) * 2,
        w: (i - 50) / 100,
        h: (300 - i) / 100,
      }),
      641,
      359,
    );
    assert.ok(
      p.x >= 0 &&
        p.y >= 0 &&
        p.w >= 1 &&
        p.h >= 1 &&
        p.x + p.w <= 641 &&
        p.y + p.h <= 359,
    );
  }
});
test("facecams remain inside the canvas at all supported aspect ratios", async () => {
  const { cameraRect } = await import("../src/design.js");
  for (const a of [1, 4 / 3, 16 / 9])
    for (const v of [
      { x: 2, y: 2, w: 4 },
      { x: -4, y: -1, w: 0.01 },
      { x: 0.5, y: 0.4, w: 0.3 },
    ]) {
      const r = cameraRect(v, a);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1);
      assert.ok(Math.abs((r.w * 1920) / (r.h * 1080) - a) < 1e-8);
    }
});
test("packs reject executable styles and normalize layout bounds", async () => {
  const { validatePack, THEMES, TEMPLATES } = await import("../src/design.js");
  assert.equal(
    validatePack({
      version: 1,
      name: "Okay",
      themes: [THEMES[0]],
      templates: [TEMPLATES[1]],
    }).templates[0].layout.crops.b.x,
    0.5,
  );
  assert.throws(() => validatePack({ version: 2, name: "Bad" }));
  assert.throws(() =>
    validatePack({
      version: 1,
      name: "Bad",
      themes: [
        {
          ...THEMES[0],
          colors: { ...THEMES[0].colors, bg: "url(https://example.com)" },
        },
      ],
    }),
  );
  assert.throws(() =>
    validatePack({
      version: 1,
      name: "Bad",
      templates: [{ ...TEMPLATES[0], scene: "<script>" }],
    }),
  );
  assert.equal(
    validatePack({
      version: 1,
      name: "Clamp",
      templates: [{ ...TEMPLATES[0], layout: { split: Infinity } }],
    }).templates[0].layout.split,
    0.5,
  );
});
test("theme text and primary buttons retain readable contrast", async () => {
  const { THEMES } = await import("../src/design.js");
  const lum = (h) =>
    h
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  for (const t of THEMES)
    for (const [fg, bg] of [
      ["text", "panel"],
      ["muted", "panel"],
      ["ink", "accent"],
      ["ink", "highlight"],
    ]) {
      const a = lum(t.colors[fg]),
        b = lum(t.colors[bg]);
      assert.ok(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
        `${t.name} ${fg}/${bg}`,
      );
    }
});
