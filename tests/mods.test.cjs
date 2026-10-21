const test = require("node:test");
const assert = require("node:assert/strict");
const registry = import("../src/mods/registry.js");
const manifest = {
  id: "test-mod",
  name: "Test",
  version: "1.0.0",
  apiVersion: 1,
  capabilities: ["studio-output"],
};

test("disabled modules stay unloaded and receive only declared services when enabled", async () => {
  const { ModRegistry } = await registry;
  let loads = 0,
    stops = 0,
    saves = 0,
    received;
  const enabled = {},
    output = {};
  const r = new ModRegistry({
    enabled,
    capabilities: { "studio-output": output, secret: {} },
    save: () => saves++,
    entries: [
      {
        manifest,
        load: async () => {
          loads++;
          return {
            activate: async (c) => {
              received = c;
            },
            deactivate: async () => stops++,
          };
        },
      },
    ],
  });
  await r.restore();
  assert.equal(loads, 0);
  await r.setEnabled("test-mod", true);
  assert.deepEqual(Object.keys(received.services), ["studio-output"]);
  assert.equal(received.services["studio-output"], output);
  assert.ok(Object.isFrozen(received.services));
  await r.setEnabled("test-mod", true);
  assert.equal(loads, 1);
  await r.setEnabled("test-mod", false);
  assert.equal(stops, 1);
  assert.equal(enabled["test-mod"], false);
  assert.equal(saves, 2);
});

test("incompatible modules never execute and invalid registrations are rejected", async () => {
  const { ModRegistry } = await registry;
  let loads = 0;
  for (const m of [{ ...manifest, apiVersion: 2 }, manifest]) {
    const enabled = { "test-mod": true };
    const r = new ModRegistry({
      enabled,
      entries: [{ manifest: m, load: () => loads++ }],
    });
    await r.restore();
    assert.equal(loads, 0);
    assert.equal(enabled["test-mod"], false);
    await assert.rejects(r.setEnabled("test-mod", true));
  }
  assert.throws(
    () =>
      new ModRegistry({
        entries: [{ manifest: { ...manifest, id: "../bad" }, load() {} }],
      }),
  );
});

test("busy recording and concurrent activation are blocked; late activation is cleaned up", async () => {
  const { ModRegistry } = await registry;
  let busy = true,
    release,
    stops = 0;
  const enabled = {};
  const r = new ModRegistry({
    enabled,
    capabilities: { "studio-output": {} },
    isBusy: () => busy,
    entries: [
      {
        manifest,
        load: async () => ({
          activate: () =>
            new Promise((resolve) => {
              release = resolve;
            }),
          deactivate: async () => stops++,
        }),
      },
    ],
  });
  await assert.rejects(r.setEnabled("test-mod", true), /between recordings/);
  busy = false;
  const pending = r.setEnabled("test-mod", true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.changing, true);
  await assert.rejects(r.setEnabled("test-mod", true), /changing state/);
  busy = true;
  release();
  await assert.rejects(pending, /while the mod was enabling/);
  assert.equal(stops, 1);
  assert.equal(enabled["test-mod"], false);
  assert.equal(r.changing, false);
});

test("failed activation releases partial resources and can be retried", async () => {
  const { ModRegistry } = await registry;
  let fail = true,
    stops = 0;
  const r = new ModRegistry({
    capabilities: { "studio-output": {} },
    entries: [
      {
        manifest,
        load: async () => ({
          activate: async () => {
            if (fail) throw Error("Startup failed");
          },
          deactivate: async () => stops++,
        }),
      },
    ],
  });
  await assert.rejects(r.setEnabled("test-mod", true), /Startup failed/);
  assert.equal(stops, 1);
  assert.equal(r.list()[0].enabled, false);
  fail = false;
  await r.setEnabled("test-mod", true);
  assert.equal(r.list()[0].enabled, true);
  assert.equal(r.list()[0].error, "");
});

test("failed deactivation preserves the enabled state for retry", async () => {
  const { ModRegistry } = await registry;
  let fail = true;
  const enabled = {};
  const r = new ModRegistry({
    enabled,
    capabilities: { "studio-output": {} },
    entries: [
      {
        manifest,
        load: async () => ({
          activate: async () => {},
          deactivate: async () => {
            if (fail) throw Error("Still active");
          },
        }),
      },
    ],
  });
  await r.setEnabled("test-mod", true);
  await assert.rejects(r.setEnabled("test-mod", false), /Still active/);
  assert.equal(r.list()[0].enabled, true);
  assert.equal(enabled["test-mod"], true);
  fail = false;
  await r.setEnabled("test-mod", false);
  assert.equal(enabled["test-mod"], false);
});
