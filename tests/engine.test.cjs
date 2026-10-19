const test = require("node:test");
const assert = require("node:assert/strict");
test("concurrent source setup waits for one complete audio initialization", async () => {
  const { StudioEngine } = await import("../src/engine.js");
  const engine = new StudioEngine({}, {});
  let release,
    calls = 0;
  engine.initialize = async () => {
    calls++;
    engine.ctx = {
      resume: async () => {},
      state: "running",
      suspend: async () => {},
    };
    await new Promise((resolve) => {
      release = resolve;
    });
    engine.node = { ready: true };
  };
  const a = engine.init(),
    b = engine.init();
  assert.equal(calls, 1);
  assert.equal(engine.node, undefined);
  release();
  await Promise.all([a, b]);
  assert.equal(engine.node.ready, true);
  clearTimeout(engine.idleTimer);
});
test("stop timeout finalizes and unlocks the take with an interruption report", async () => {
  const { StudioEngine } = await import("../src/engine.js");
  const engine = new StudioEngine({}, { setRecording() {} });
  const previous = global.window;
  let ended, savedWhileFinishing;
  global.window = {
    take: {
      end: async (options) => {
        ended = options;
        return {
          id: "test",
          status: options.error ? "interrupted" : "recorded",
        };
      },
    },
  };
  Object.assign(engine, {
    recording: true,
    ctx: { currentTime: 4, sampleRate: 48000 },
    startedAt: 0,
    node: { port: { postMessage() {} } },
    recorder: {
      state: "recording",
      stop() {
        this.onstop();
      },
    },
    session: { id: "test" },
    blobQueue: Promise.resolve(),
  });
  engine.addEventListener("saved", () => {
    savedWhileFinishing = engine.finishing;
  });
  try {
    const [a, b] = await Promise.all([engine.stop(), engine.stop()]);
    assert.equal(a, b);
    assert.match(ended.error, /Audio capture did not finish/);
    assert.equal(a.status, "interrupted");
    assert.equal(engine.finishing, false);
    assert.equal(savedWhileFinishing, false);
    assert.equal(engine.session, null);
  } finally {
    clearTimeout(engine.idleTimer);
    global.window = previous;
  }
});
