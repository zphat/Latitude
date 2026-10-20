const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
if (!["win32", "linux"].includes(process.platform))
  throw Error("Prepare the encoder on Windows or Linux.");
const binary = require("ffmpeg-static");
if (!binary || !fs.existsSync(binary))
  throw Error("Run npm ci first to install the encoder.");
if (process.platform === "linux") {
  const hash = createHash("sha256")
    .update(fs.readFileSync(binary))
    .digest("hex");
  if (
    process.arch !== "x64" ||
    hash !== "e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99"
  )
    throw Error(
      "Linux encoder differs from the reviewed x86-64 FFmpeg 7.0.2 build. Review the binary and its source/license notices before packaging.",
    );
}
const dest = path.join(
  __dirname,
  "..",
  "vendor",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(binary, dest);
if (process.platform === "linux") {
  fs.chmodSync(dest, 0o755);
  const notices = path.join(path.dirname(dest), "linux");
  fs.mkdirSync(notices, { recursive: true });
  for (const [suffix, name] of [
    ["LICENSE", "FFmpeg-LICENSE.txt"],
    ["README", "FFmpeg-README.txt"],
  ]) {
    const source = `${binary}.${suffix}`;
    if (!fs.existsSync(source) || fs.statSync(source).size < 100)
      throw Error(`Missing Linux encoder notice: ${source}`);
    fs.copyFileSync(source, path.join(notices, name));
  }
}
console.log(`Prepared ${dest} with platform-specific FFmpeg notices.`);
