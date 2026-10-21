const test = require("node:test"),
  assert = require("node:assert/strict");
const model = import("../src/scene-model.js"),
  design = import("../src/design.js");
test("legacy scenes migrate to independent editable crops", async () => {
  const { sceneDocuments } = await model,
    { layout } = await design;
  const docs = sceneDocuments(
    null,
    layout({ crops: { a: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 } } }),
    {},
  );
  assert.equal(docs.screen[0].crop.x, 0.1);
  docs.screen[0].crop.x = 0.3;
  assert.equal(docs.present[0].crop.x, 0.1);
  assert.equal(docs.split.length, 2);
});
test("move and aspect-preserving resize snap and stay inside the canvas", async () => {
  const { layer, moveBox, resizeBox } = await model;
  const l = layer({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  const r = moveBox(l, 0.196, 0, true);
  assert.equal(r.box.x, 0.3);
  assert.ok(r.guides.some((x) => x.axis === "x" && x.value === 0.5));
  for (const h of ["nw", "ne", "sw", "se"]) {
    const b = resizeBox(l, 10, -10, h, true);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1 && b.y + b.h <= 1);
    assert.ok(Math.abs(b.w / b.h - l.w / l.h) < 1e-7);
  }
});
test("pointer selection follows visible unlocked layer order", async () => {
  const { layer, hitTest } = await model,
    a = layer({ id: "a" }),
    b = layer({ id: "b" });
  assert.equal(hitTest([a, b], 0.5, 0.5).id, "b");
  b.locked = true;
  assert.equal(hitTest([a, b], 0.5, 0.5).id, "a");
  a.visible = false;
  assert.equal(hitTest([a, b], 0.5, 0.5), undefined);
});
test("packs preserve safe gradients and normalize imported source bounds", async () => {
  const { validatePack } = await design;
  const p = validatePack({
    version: 1,
    name: "Text",
    templates: [
      {
        name: "Example",
        scene: "screen",
        preset: "natural",
        composition: [
          {
            id: 'bad" onclick="alert(1)',
            type: "text",
            text: "",
            font: "url(evil)",
            color: "red;script()",
            gradient: true,
            color2: "#ff6600",
            x: 10,
            w: 2,
          },
        ],
      },
    ],
  });
  const l = p.templates[0].composition[0];
  assert.match(l.id, /^[\w-]+$/);
  assert.equal(l.text, "");
  assert.equal(l.font, "Arial");
  assert.equal(l.color, "#edf1e6");
  assert.equal(l.color2, "#ff6600");
  assert.equal(l.x, 0);
  assert.equal(l.w, 1);
  assert.equal(l.gradient, true);
});
test("recording bitrate scales with resolution, frame rate and quality", async () => {
  const { bitrateFor } = await model;
  assert.equal(bitrateFor(1080, 30), 12000000);
  assert.equal(bitrateFor(1080, 30, "efficient"), 5850000);
  assert.ok(bitrateFor(2160, 60, "high") > bitrateFor(2160, 30, "high"));
  assert.ok(bitrateFor(2160, 60, "efficient") < bitrateFor(2160, 60));
  assert.ok(bitrateFor(720, 30) < bitrateFor(1080, 30));
});
