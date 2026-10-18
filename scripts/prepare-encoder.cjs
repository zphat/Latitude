const fs = require("node:fs");
const path = require("node:path");
if (process.platform !== "win32")
  throw Error(
    "For a Windows cross-build, supply vendor/ffmpeg.exe. This helper copies a Windows encoder only on Windows.",
  );
const binary = require("ffmpeg-static");
if (!binary || !fs.existsSync(binary))
  throw Error("Run npm ci first to install the encoder.");
const dest = path.join(__dirname, "..", "vendor", "ffmpeg.exe");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(binary, dest);
console.log(
  "Prepared vendor/ffmpeg.exe. Retain the build-specific FFmpeg license and source notices.",
);
