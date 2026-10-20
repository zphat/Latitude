const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { LinuxAudio } = require("../electron/linux-audio.cjs");
const {
  capturePlatform,
  selectedCapture,
} = require("../electron/capture-platform.cjs");

test("Wayland uses the portal's current source; X11 and Windows require the chosen ID", () => {
  const sources = [{ id: "new-portal-id" }, { id: "other" }];
  const wayland = capturePlatform("linux", {
    WAYLAND_DISPLAY: "wayland-0",
    FLATPAK_ID: "studio.latitude.recorder",
  });
  assert.equal(wayland.picker, "portal");
  assert.equal(wayland.desktopAudio, "pulse");
  assert.equal(wayland.flatpak, true);
  assert.equal(selectedCapture(sources, "old-portal-id", wayland), sources[0]);
  assert.equal(selectedCapture([], "old-portal-id", wayland), undefined);
  for (const platform of [
    capturePlatform("linux", {}),
    capturePlatform("win32", {}),
  ]) {
    assert.equal(platform.picker, "thumbnails");
    assert.equal(selectedCapture(sources, "other", platform), sources[1]);
    assert.equal(selectedCapture(sources, "missing", platform), undefined);
  }
  assert.equal(capturePlatform("win32", {}).desktopAudio, "loopback");
});
function fakeProcess(behavior = "ready") {
  const children = [];
  return {
    children,
    spawnProcess(binary, args) {
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.args = args;
      child.kill = () => child.emit("close", 0);
      child.stdin.on("finish", () =>
        queueMicrotask(() => child.emit("close", 0)),
      );
      children.push(child);
      queueMicrotask(() => {
        if (behavior === "ready")
          child.stdout.write(
            JSON.stringify({ label: args[2], sourceName: args[2] }) + "\n",
          );
        if (behavior === "bad") child.stdout.write('{"label":"wrong"}\n');
        if (behavior === "missing") {
          child.emit("error", Error("ENOENT"));
          child.emit("close", -2);
        }
      });
      return child;
    },
  };
}
test("bridge serializes changes, reuses one source, and closes stdin to release it", async () => {
  const f = fakeProcess();
  let disconnected = 0;
  const bridge = new LinuxAudio("helper", {
    ...f,
    onDisconnect: () => disconnected++,
  });
  const [one, two] = await Promise.all([
    bridge.connect("speaker"),
    bridge.connect("speaker"),
  ]);
  assert.deepEqual(one, two);
  assert.equal(f.children.length, 1);
  await bridge.connect("headphones");
  assert.ok(f.children[0].stdin.writableEnded);
  assert.equal(f.children.length, 2);
  await bridge.stop();
  assert.ok(f.children[1].stdin.writableEnded);
  assert.equal(bridge.active, null);
  assert.equal(disconnected, 0);
});
test("bridge reports server loss once and can reconnect", async () => {
  const f = fakeProcess();
  let disconnected = 0;
  const bridge = new LinuxAudio("helper", {
    ...f,
    onDisconnect: () => disconnected++,
  });
  await bridge.connect();
  f.children[0].emit("close", 1);
  assert.equal(disconnected, 1);
  assert.equal(bridge.active, null);
  await bridge.connect();
  await bridge.stop();
  assert.equal(disconnected, 1);
});
test("bridge bounds startup, rejects forged replies and missing helpers, and validates output arguments", async () => {
  for (const behavior of ["bad", "missing", "silent"]) {
    const f = fakeProcess(behavior);
    const bridge = new LinuxAudio("helper", { ...f, timeout: 15 });
    await assert.rejects(bridge.connect());
    await bridge.stop();
    assert.equal(bridge.active, null);
  }
  const f = fakeProcess();
  const bridge = new LinuxAudio("helper", f);
  for (const sink of [null, "", "a\0b", "a".repeat(1025)])
    await assert.rejects(bridge.connect(sink));
  assert.equal(f.children.length, 0);
});
test("recording cannot begin while Linux desktop audio is connecting", async () => {
  const { StudioEngine } = await import("../src/engine.js");
  const engine = new StudioEngine({}, {});
  engine.connectingDesktop = true;
  await assert.rejects(engine.start({}), /Wait for desktop audio/);
  assert.equal(engine.starting, undefined);
});
