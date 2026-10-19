const fs = require("node:fs/promises");
const path = require("node:path");
module.exports = async function workletHarness(
  root = path.resolve(__dirname, ".."),
  sampleRate = 48000,
) {
  const source = (
    await fs.readFile(path.join(root, "audio/studio-worklet.js"), "utf8")
  )
    .replace(/^import[^\n]+\n/, "")
    .replace(/\bcurrentFrame\b/g, "clock.frame");
  const code = await fs.readFile(path.join(root, "audio/dsp.js"), "utf8");
  const dsp = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  const clock = { frame: 0 },
    messages = [];
  const Base = class {
    constructor() {
      this.port = { postMessage: (message) => messages.push(message) };
    }
  };
  const Processor = new Function(
    ...Object.keys(dsp),
    "sampleRate",
    "clock",
    "AudioWorkletProcessor",
    "registerProcessor",
    `${source}\nreturn StudioProcessor;`,
  )(...Object.values(dsp), sampleRate, clock, Base, () => {});
  const processor = new Processor();
  const output = Array.from({ length: 2 }, () => [
    new Float32Array(128),
    new Float32Array(128),
  ]);
  return {
    dsp,
    processor,
    output,
    messages,
    clock,
    send: (data) => processor.port.onmessage({ data }),
    step(inputs = [[], [], []]) {
      processor.process(inputs, output);
      clock.frame += 128;
      return output;
    },
  };
};
