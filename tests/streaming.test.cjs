const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const tls = require("node:tls");
const { spawn, execFileSync } = require("node:child_process");
const {
  StreamPublisher,
  validate,
} = require("../electron/stream-publisher.cjs");
const ffmpeg = process.env.TAKE_FFMPEG || require("ffmpeg-static");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw Error("Timed out waiting for streaming state");
    await delay(25);
  }
}
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}
async function port() {
  const s = net.createServer(),
    p = await listen(s);
  await new Promise((r) => s.close(r));
  return p;
}
let temp, sample, cert, key;
test.before(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-publisher-"));
  const file = path.join(temp, "sample.mkv");
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "4",
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-g",
    "60",
    "-sc_threshold",
    "0",
    "-c:a",
    "pcm_f32le",
    "-ac",
    "2",
    "-y",
    file,
  ]);
  sample = await fs.readFile(file);
  cert = await fs.readFile(
    path.join(__dirname, "fixtures/localhost-test-cert.pem"),
  );
  key = await fs.readFile(
    path.join(__dirname, "fixtures/localhost-test-key.pem"),
  );
});
test.after(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

test("stream destinations are data, not arbitrary FFmpeg arguments or file paths", () => {
  for (const server of [
    "file:///tmp/out",
    "https://example.com/app",
    "rtmp://example.com",
    "rtmps://u:p@example.com/app",
    "rtmp://host/live?key=secret",
    "rtmp://host/live#x",
    "rtmp://host/\nlive",
  ])
    assert.throws(() => validate({ server, key: "test", audioKbps: 160 }));
  for (const key of ["", "\n-private", "a b", "x".repeat(1025)])
    assert.throws(() =>
      validate({ server: "rtmps://localhost/live", key, audioKbps: 160 }),
    );
  assert.throws(() =>
    validate({ server: "rtmp://localhost/live", key: "test", audioKbps: 999 }),
  );
  assert.equal(
    validate({
      server: "rtmps://localhost/live",
      key: "test?bandwidthtest=true",
      audioKbps: 160,
    }).audioKbps,
    160,
  );
});
for (const secure of [false, true])
  test(
    `real ${secure ? "RTMPS with verified certificate" : "RTMP"} receiver gets copied H.264 and AAC`,
    { timeout: 20000 },
    async () => {
      const p = await port(),
        file = path.join(temp, `received-${secure}.flv`);
      const child = spawn(
        ffmpeg,
        [
          "-v",
          "error",
          "-listen",
          "1",
          "-i",
          `rtmp://127.0.0.1:${p}/live/test-key`,
          "-c",
          "copy",
          "-y",
          file,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let log = "";
      child.stderr.on("data", (d) => {
        log += d;
      });
      const done = new Promise((r) => child.once("close", r));
      const sockets = new Set();
      let proxy;
      let target = `rtmp://127.0.0.1:${p}/live`;
      if (secure) {
        proxy = tls.createServer({ cert, key }, (incoming) => {
          const remote = net.connect(p, "127.0.0.1");
          for (const s of [incoming, remote]) {
            sockets.add(s);
            s.on("error", () => {});
          }
          incoming.pipe(remote);
          remote.pipe(incoming);
        });
        proxy.on("tlsClientError", () => {});
        target = `rtmps://localhost:${await listen(proxy)}/live`;
      }
      const states = [],
        pub = new StreamPublisher({
          ffmpeg,
          tlsOptions: secure ? { ca: cert } : {},
          onState: (s) => states.push(s),
        });
      try {
        await delay(300);
        const { id } = await pub.start({
          server: target,
          key: "test-key",
          audioKbps: 160,
        });
        await assert.rejects(
          pub.start({ server: target, key: "other", audioKbps: 160 }),
          /already active/,
        );
        for (let i = 0; i < sample.length; i += 32768) {
          await pub.write(id, sample.subarray(i, i + 32768));
          await delay(30);
        }
        await until(() => states.some((s) => s.state === "sending"));
        await delay(300);
        await pub.stop(id);
        await Promise.race([done, delay(2000)]);
        execFileSync(ffmpeg, ["-hide_banner", "-i", file, "-f", "null", "-"], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        assert.ok((await fs.stat(file)).size > 10000);
        assert.equal(JSON.stringify(states).includes("test-key"), false);
        assert.equal(pub.active, false);
      } catch (error) {
        error.message += `\nReceiver: ${log}`;
        throw error;
      } finally {
        await pub.stop();
        child.kill();
        for (const s of sockets) s.destroy();
        proxy?.close();
      }
    },
  );
for (const wrongHost of [false, true])
  test(
    `RTMPS rejects ${wrongHost ? "a trusted certificate for the wrong hostname" : "an untrusted certificate"} without leaking a key`,
    { timeout: 12000 },
    async () => {
      const sockets = new Set();
      const server = tls.createServer({ cert, key }, (s) => {
        sockets.add(s);
        s.on("error", () => {});
      });
      server.on("tlsClientError", () => {});
      const p = await listen(server),
        states = [];
      const pub = new StreamPublisher({
        ffmpeg,
        tlsOptions: wrongHost ? { ca: cert } : {},
        onState: (s) => states.push(s),
      });
      try {
        const { id } = await pub.start({
          server: `rtmps://${wrongHost ? "127.0.0.1" : "localhost"}:${p}/live`,
          key: "secret-that-must-not-leak",
          audioKbps: 160,
        });
        for (let i = 0; i < sample.length && pub.active; i += 32768)
          await pub.write(id, sample.subarray(i, i + 32768)).catch(() => {});
        await until(() => states.some((s) => s.state === "failed"));
        await until(() => !pub.active);
        assert.equal(
          JSON.stringify(states).includes("secret-that-must-not-leak"),
          false,
        );
        assert.ok(states.some((s) => s.message.includes("secure connection")));
      } finally {
        await pub.stop();
        for (const s of sockets) s.destroy();
        server.close();
      }
    },
  );
test(
  "a stalled receiver fails with a bounded queue, and stopping releases the process and listener",
  { timeout: 12000 },
  async () => {
    const sockets = new Set(),
      server = net.createServer((s) => {
        sockets.add(s);
        s.on("error", () => {});
        s.pause();
      });
    const p = await listen(server),
      states = [];
    const pub = new StreamPublisher({ ffmpeg, onState: (s) => states.push(s) });
    try {
      const { id } = await pub.start({
        server: `rtmp://127.0.0.1:${p}/live`,
        key: "test",
        audioKbps: 160,
      });
      await assert.rejects(
        pub.write(id, Buffer.alloc(5 * 1024 * 1024)),
        /Invalid streaming packet/,
      );
      let failed = false;
      for (let i = 0; i < sample.length; i += 32768) {
        try {
          await pub.write(id, sample.subarray(i, i + 32768));
        } catch {
          failed = true;
          break;
        }
      }
      assert.ok(failed);
      await pub.stop(id);
      assert.equal(pub.active, false);
      assert.ok(states.some((s) => s.state === "failed"));
      await assert.rejects(
        pub.write(id, sample.subarray(0, 128)),
        /no longer active/,
      );
      const restart = await pub.start({
        server: `rtmp://127.0.0.1:${p}/live`,
        key: "test",
        audioKbps: 160,
      });
      await pub.stop(restart.id);
      assert.equal(pub.active, false);
    } finally {
      await pub.stop();
      for (const s of sockets) s.destroy();
      server.close();
    }
  },
);
test("Twitch bandwidth test cannot silently publish to a different platform", async () => {
  const { twitchTestKey } = await import("../src/mods/streaming/session.js");
  assert.equal(
    twitchTestKey("rtmp://live.twitch.tv/app", "secret"),
    "secret?bandwidthtest=true",
  );
  for (const server of [
    "rtmps://youtube.com/live",
    "rtmp://twitch.tv.evil.example/app",
    "rtmp://live.twitch.tv/other",
    "https://live.twitch.tv/app",
  ])
    assert.throws(() => twitchTestKey(server, "secret"));
  assert.throws(() =>
    twitchTestKey("rtmp://live.twitch.tv/app", "secret?bandwidthtest=false"),
  );
});
