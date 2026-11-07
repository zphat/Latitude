const test = require("node:test");
const assert = require("node:assert/strict");
const model = import("../src/mods/editor/model.js");
const gestures = import("../src/mods/editor/timeline-edit.js");

async function fixture(fps = 30) {
  const m = await model, p = m.newProject(); p.fps = fps;
  p.assets = [
    { id: "picture", kind: "video", name: "Picture", duration: 10, width: 320, height: 180, audio: 0 },
    { id: "mic", kind: "audio", name: "Mic", duration: 4.8, audio: 1 },
  ];
  p.clips = [
    { id: "v", asset: "picture", track: p.tracks[0].id, group: "linked", start: 2, in: 1, duration: 4 },
    { id: "a", asset: "mic", track: p.tracks[1].id, group: "linked", start: 2, in: 0.5, duration: 4 },
    { id: "other", asset: "picture", track: p.tracks[0].id, start: 7, in: 0, duration: 2 },
  ];
  return m.sanitize(p);
}

test("move and both trim edges snap to valid cuts, markers and playhead without changing the base", async () => {
  const { snapPoints, dragPlacement, applyDrag } = await gestures;
  const p = await fixture(), before = JSON.stringify(p), ids = ["v", "a"];
  p.markers = [{ time: 1.8, name: "Start" }];
  const points = snapPoints(p, ids, 3);
  assert.deepEqual(points, [3, 0, 1.8, 7, 9]);
  const end = dragPlacement(p, "v", ids, "move", 0.96, points, 0.1);
  assert.equal(end.delta, 1); assert.equal(end.guide, 3); // start at playhead wins tie
  const endOnly = dragPlacement(p, "v", ids, "move", 0.96, [7], 0.1);
  assert.equal(endOnly.delta, 1); assert.equal(endOnly.guide, 7);
  const moved = applyDrag(p, ids, "move", endOnly.delta);
  assert.equal(moved.clips[0].start + moved.clips[0].duration, 7);
  assert.equal(moved.clips[0].start, moved.clips[1].start);
  assert.equal(moved.clips[0].in, 1);
  const left = dragPlacement(p, "v", ids, "left", -0.17, points, 0.1);
  assert.equal(left.delta, -0.2); assert.equal(left.guide, 1.8);
  const right = dragPlacement(p, "v", ids, "right", 0.14, [6.2], 0.1);
  assert.equal(right.delta, 0.2); assert.equal(right.guide, 6.2);
  assert.equal(dragPlacement(p, "v", ids, "move", 0.96).guide, null);
  p.markers = [];
  assert.equal(JSON.stringify(p), before);
});

test("linked drags and numeric trims share frame-exact joint source bounds", async () => {
  const { dragPlacement, applyDrag } = await gestures;
  for (const fps of [24, 30, 60]) {
    const p = await fixture(fps), ids = ["v", "a"];
    for (const mode of ["move", "left", "right"]) for (const request of [-1e6, -0.173, 0, 0.237, 1e6]) {
      const { delta } = dragPlacement(p, "v", ids, mode, request);
      const next = applyDrag(p, ids, mode, delta), [v, a] = next.clips;
      assert.equal(v.start, a.start); assert.equal(v.duration, a.duration);
      assert.ok(Math.abs(v.in - a.in - 0.5) < 1e-6);
      for (const c of [v, a]) {
        assert.ok(c.start >= 0 && c.duration >= 1 / fps - 1e-6);
        assert.ok(c.in + c.duration <= p.assets.find(x => x.id === c.asset).duration + 1e-6);
        assert.ok(Math.abs(c.duration * fps - Math.round(c.duration * fps)) < 1e-6);
      }
    }
    const unreachable = dragPlacement(p, "v", ids, "right", 1, [7], 1);
    assert.equal(unreachable.guide, null);
    p.tracks[1].locked = true;
    assert.throws(() => dragPlacement(p, "v", ids, "left", 1), /Unlock linked/);
  }
});

test("cut navigation skips the current cut and includes gaps, layers and timeline ends", async () => {
  const { adjacentCut, zoomAnchor } = await gestures;
  const p = await fixture();
  assert.equal(adjacentCut(p, 2, 1), 6);
  assert.equal(adjacentCut(p, 6, 1), 7);
  assert.equal(adjacentCut(p, 6, -1), 2);
  assert.equal(adjacentCut(p, 0, -1), 0);
  assert.equal(adjacentCut(p, 9, 1), 9);
  const scroll = zoomAnchor(800, 100, 160, 440);
  assert.ok(Math.abs((800 + 440 - 150) / 100 - (scroll + 440 - 150) / 160) < 1e-8);
  assert.equal(zoomAnchor(0, 100, 50, 150), 0);
});
