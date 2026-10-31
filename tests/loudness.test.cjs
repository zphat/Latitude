const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { parseEBU128 } = require("../electron/loudness.cjs");
const { parseLoudness, runFFmpeg } = require("../electron/recording.cjs");
const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");

test("EBU summary parser requires true peaks and ignores momentary or partial logs", () => {
  assert.equal(parseEBU128("t: 1 I: -16 LUFS TPK: -2 dBFS"), null);
  assert.equal(parseEBU128("Summary:\nIntegrated loudness:\n I: -16 LUFS\nLoudness range:\n LRA: 2 LU"), null);
});

test("faster delivery measurement agrees with the previous scanner on encoded audio and true peaks", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-loudness-"));
  try {
    for (const rate of [44100, 48000]) {
      const cases = [
        ["silence", "0"],
        ["quiet", "0.00001*sin(2*PI*1000*t)"],
        ["speech-shaped", "(0.04*sin(2*PI*301*t)+0.02*sin(2*PI*3109*t))*(0.2+0.8*lt(mod(t,3),2))"],
        ["intersample", "0.94*sin(2*PI*11025*t+0.8)"],
      ];
      for (const [name, expr] of cases) {
        const file = path.join(root, `${rate}-${name}.m4a`);
        execFileSync(binary, ["-v", "error", "-y", "-f", "lavfi", "-i",
          `aevalsrc='${expr}':s=${rate}:d=6`, "-ac", "2", "-c:a", "aac", "-b:a", "256k", file]);
        const scan = (filter) => runFFmpeg(binary, ["-filter_threads", "1", "-i", file,
          "-map", "0:a:0", "-af", filter, "-f", "null", "-"]);
        const old = parseLoudness(await scan("loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json"));
        const now = parseEBU128(await scan("ebur128=peak=true:framelog=verbose"));
        assert.ok(now, `${rate} ${name}: complete EBU summary`);
        for (const field of ["input_i", "input_tp", "input_lra"]) {
          if (old[field] === "-inf") assert.equal(now[field], "-inf", `${name} ${field}`);
          else assert.ok(Math.abs(Number(now[field]) - Number(old[field])) < 0.3,
            `${rate} ${name} ${field}: ${now[field]} vs ${old[field]}`);
        }
      }
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
