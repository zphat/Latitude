// Stream bounded ranges so scrubbing works without buffering an entire recording.
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const types = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
async function mediaResponse(request, file) {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405 });
  let stat;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return new Response(null, { status: 404 });
  }
  if (!stat.isFile()) return new Response(null, { status: 404 });
  const headers = {
    "Content-Type":
      types[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  let start = 0,
    end = stat.size - 1,
    status = 200;
  const range = request.headers.get("Range");
  const invalid = () =>
    new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) return invalid();
    start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
    if (m[1] && m[2]) end = Math.min(end, Number(m[2]));
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= stat.size
    )
      return invalid();
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers["Content-Length"] = String(Math.max(0, end - start + 1));
  if (request.method === "HEAD" || !stat.size)
    return new Response(null, { status, headers });
  const stream = fs.createReadStream(file, {
    start,
    end,
    highWaterMark: 256 * 1024,
  });
  const abort = () => stream.destroy();
  request.signal?.addEventListener("abort", abort, { once: true });
  stream.on("close", () => request.signal?.removeEventListener("abort", abort));
  if (request.signal?.aborted) stream.destroy();
  return new Response(Readable.toWeb(stream), { status, headers });
}
module.exports = { mediaResponse };
