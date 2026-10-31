const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { RecordingStore } = require("../electron/recording.cjs");

test("blank and legacy session names get a readable timestamp, custom titles keep punctuation", async () => {
  const { sessionName, recordingName } = await import("../src/session-names.js");
  const date = new Date(2026, 9, 31, 16, 3, 4);
  for (const value of [undefined, "", " \n ", "Untitled session"])
    assert.equal(recordingName(value, date), "Recording 2026-10-31 16-03-04");
  assert.equal(sessionName('  Episode 12: Q&A / café 🎙  '), 'Episode 12: Q&A / café 🎙');
  assert.equal(sessionName("A\u0000B\nC"), "A B C");
  assert.equal(sessionName("x".repeat(90)).length, 70);
  assert.throws(() => sessionName({ name: "wrong type" }));
});

test("renames survive recording metadata writes, restart and concurrent export completion without moving media", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-name-"));
  const store = new RecordingStore(root);
  try {
    const take = await store.begin({ name: "", sampleRate: 48000 });
    assert.match(take.name, /^Recording \d{4}-/);
    await store.append(take.id, "mix", new Float32Array(48000 * 2).fill(0.01).buffer);
    const marker = store.event(take.id, { type: "marker", time: 0.1, label: "Keep" });
    await store.rename(take.id, "During recording: café / Q&A");
    await marker;
    const ended = await store.end();
    assert.equal(ended.name, "During recording: café / Q&A");
    const original = await fs.readFile(path.join(take.dir, "mix.wav"));
    await assert.rejects(store.rename(take.id, " \n "), /Enter a name/);
    await assert.rejects(store.rename("not-found", "Missing"), /could not be found/);
    let rename;
    const result = await store.export(take.id, { format: "wav", normalize: false },
      process.env.TAKE_FFMPEG || require("ffmpeg-static"), (progress) => {
        if (progress.stage === "Measuring the exported mix" && !rename)
          rename = store.rename(take.id, "Renamed while exporting");
      });
    await rename;
    const reloaded = await new RecordingStore(root).resolve(take.id);
    assert.equal(reloaded.name, "Renamed while exporting");
    assert.equal(reloaded.dir, take.dir);
    assert.equal(reloaded.markers[0].label, "Keep");
    assert.equal(reloaded.duration, 1);
    assert.equal(reloaded.exports.length, 1);
    assert.equal(reloaded.exports[0].path, result.dir);
    assert.equal(await store.playbackPath(take.id), path.join(result.dir, result.file));
    await store.rename(take.id, "After export");
    assert.equal((await store.resolve(take.id)).exports[0].path, result.dir);
    assert.deepEqual(await fs.readFile(path.join(take.dir, "mix.wav")), original);
  } finally {
    await store.end();
    await fs.rm(root, { recursive: true, force: true });
  }
});
