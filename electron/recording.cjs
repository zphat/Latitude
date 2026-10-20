const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { writeMedia } = require("./export-media.cjs");

const TRACKS = [
  { id: "voice1", name: "Voice 1", channels: 1 },
  { id: "voice2", name: "Voice 2", channels: 1 },
  { id: "desktop", name: "Desktop", channels: 2 },
  { id: "mix", name: "Full mix", channels: 2 },
  { id: "raw1", name: "Voice 1 original", channels: 1 },
  { id: "raw2", name: "Voice 2 original", channels: 1 },
];
const safeName = (value) =>
  String(value || "Untitled session")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/[. ]+$/, "")
    .slice(0, 70) || "Untitled session";

function wavHeader(bytes, channels, sampleRate = 48000) {
  const b = Buffer.alloc(80),
    large = bytes > 0xffffff00;
  b.write(large ? "RF64" : "RIFF", 0);
  b.writeUInt32LE(large ? 0xffffffff : bytes + 72, 4);
  b.write("WAVE", 8);
  b.write(large ? "ds64" : "JUNK", 12);
  b.writeUInt32LE(28, 16);
  if (large) {
    b.writeBigUInt64LE(BigInt(bytes + 72), 20);
    b.writeBigUInt64LE(BigInt(bytes), 28);
    b.writeBigUInt64LE(BigInt(bytes / channels / 4), 36);
  }
  b.write("fmt ", 48);
  b.writeUInt32LE(16, 52);
  b.writeUInt16LE(3, 56);
  b.writeUInt16LE(channels, 58);
  b.writeUInt32LE(sampleRate, 60);
  b.writeUInt32LE(sampleRate * channels * 4, 64);
  b.writeUInt16LE(channels * 4, 68);
  b.writeUInt16LE(32, 70);
  b.write("data", 72);
  b.writeUInt32LE(large ? 0xffffffff : bytes, 76);
  return b;
}
async function repairWav(file, channels, rate) {
  const stat = await fsp.stat(file),
    size = Math.max(0, stat.size - 80);
  const bytes = size - (size % (channels * 4));
  const h = await fsp.open(file, "r+");
  try {
    await h.truncate(bytes + 80);
    await h.write(wavHeader(bytes, channels, rate), 0, 80, 0);
  } finally {
    await h.close();
  }
  return bytes / (channels * 4);
}
function runFFmpeg(binary, args, onProgress, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error("Export canceled."));
    const child = spawn(binary, ["-hide_banner", "-nostdin", ...args], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const abort = () => child.kill();
    signal?.addEventListener("abort", abort, { once: true });
    let log = "";
    child.stderr.on("data", (d) => {
      log = (log + d.toString()).slice(-12000);
      if (onProgress) onProgress(d.toString());
    });
    child.on("error", (error) => {
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(Error("Export canceled."));
      code === 0
        ? resolve(log)
        : reject(
            new Error(
              `Audio/video export failed (${code}). ${log.slice(-1600)}`,
            ),
          );
    });
  });
}
function parseLoudness(text) {
  const match = text.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!match) return null;
  try {
    return JSON.parse(match.at(-1));
  } catch {
    return null;
  }
}

class RecordingStore {
  constructor(root) {
    this.root = root;
    this.active = null;
    this.exporting = false;
  }
  async begin(options) {
    if (this.active || this.beginning)
      throw Error("A session is already recording.");
    if (this.exporting)
      throw Error("Finish or cancel the export before recording.");
    this.beginning = true;
    try {
      return await this.beginSession(options);
    } finally {
      this.beginning = false;
    }
  }
  async beginSession(options) {
    await fsp.mkdir(this.root, { recursive: true });
    const stat = await fsp.statfs(this.root);
    if (Number(stat.bavail) * Number(stat.bsize) < 1024 ** 3)
      throw Error("Less than 1 GB is free. Choose another recording folder.");
    const id = randomUUID(),
      stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(
      this.root,
      `${stamp.slice(0, 19)} ${safeName(options.name)} ${id.slice(0, 6)}`,
    );
    await fsp.mkdir(dir, { recursive: true });
    const manifest = {
      ...options,
      id,
      name: safeName(options.name),
      created: new Date().toISOString(),
      status: "recording",
      sampleRate: options.sampleRate || 48000,
      markers: [],
      scenes: [],
      version: 1,
    };
    this.active = {
      dir,
      manifest,
      handles: {},
      bytes: {},
      chain: Promise.resolve(),
      metaChain: Promise.resolve(),
      error: null,
    };
    try {
      for (const t of TRACKS) {
        const h = await fsp.open(path.join(dir, `${t.id}.wav`), "wx");
        this.active.handles[t.id] = h;
        await h.writeFile(wavHeader(0, t.channels, manifest.sampleRate));
        this.active.bytes[t.id] = 0;
      }
      manifest.videoFile = /h264|avc1/i.test(manifest.captureMime || "")
        ? "capture.mkv"
        : "capture.webm";
      this.active.handles.video = await fsp.open(
        path.join(dir, manifest.videoFile),
        "wx",
      );
      this.active.bytes.video = 0;
      await this.saveManifest();
      return { id, dir };
    } catch (e) {
      await this.end({ error: e.message }).catch(() => {});
      throw e;
    }
  }
  async saveManifest() {
    const a = this.active;
    if (!a) return;
    const snapshot = JSON.stringify(a.manifest, null, 2);
    a.metaChain = a.metaChain.then(async () => {
      const temp = path.join(a.dir, "session.json.tmp");
      await fsp.writeFile(temp, snapshot);
      await fsp.rename(temp, path.join(a.dir, "session.json"));
    });
    await a.metaChain;
  }
  append(id, key, bytes) {
    const a = this.active;
    if (!a || a.manifest.id !== id || !a.handles[key])
      return Promise.reject(Error("The recording is no longer active."));
    const data = Buffer.from(bytes);
    if (data.length > 16 * 1024 * 1024)
      return Promise.reject(Error("Recording chunk is too large."));
    a.chain = a.chain
      .then(async () => {
        if (a.error) throw a.error;
        let offset = 0;
        while (offset < data.length) {
          const { bytesWritten } = await a.handles[key].write(
            data,
            offset,
            data.length - offset,
          );
          if (!bytesWritten) throw Error("Storage stopped accepting data.");
          offset += bytesWritten;
        }
        a.bytes[key] += data.length;
      })
      .catch((e) => {
        a.error = e;
        throw e;
      });
    return a.chain;
  }
  async event(id, event) {
    if (this.active?.manifest.id !== id) return;
    if (event.type === "marker")
      this.active.manifest.markers.push({
        time: event.time,
        label: String(event.label || "Marker").slice(0, 100),
      });
    if (event.type === "scene")
      this.active.manifest.scenes.push({
        time: event.time,
        scene: String(event.scene).slice(0, 100),
      });
    await this.saveManifest();
  }
  end(extra = {}) {
    if (!this.ending)
      this.ending = this.endSession(extra).finally(() => {
        this.ending = null;
      });
    return this.ending;
  }
  async endSession(extra = {}) {
    const a = this.active;
    if (!a) return null;
    await a.chain.catch(() => {});
    for (const h of Object.values(a.handles)) await h.close().catch(() => {});
    for (const t of TRACKS)
      await repairWav(
        path.join(a.dir, `${t.id}.wav`),
        t.channels,
        a.manifest.sampleRate,
      ).catch(() => {});
    const frames = (a.bytes.mix || 0) / 8;
    Object.assign(a.manifest, extra, {
      duration: frames / a.manifest.sampleRate,
      status: a.error || extra.error ? "interrupted" : "recorded",
      ended: new Date().toISOString(),
    });
    if (a.error) a.manifest.error = a.error.message;
    try {
      await this.saveManifest();
      return { dir: a.dir, ...a.manifest };
    } finally {
      this.active = null;
    }
  }
  async list() {
    await fsp.mkdir(this.root, { recursive: true });
    const entries = await fsp.readdir(this.root, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const dir = path.join(this.root, entry.name),
          m = JSON.parse(
            await fsp.readFile(path.join(dir, "session.json"), "utf8"),
          );
        items.push({
          ...m,
          dir,
          status:
            m.status === "recording" && m.id !== this.active?.manifest.id
              ? "interrupted"
              : m.status,
        });
      } catch {}
    }
    return items.sort((a, b) => b.created.localeCompare(a.created));
  }
  async resolve(id) {
    const m = (await this.list()).find((s) => s.id === id);
    if (!m)
      throw Error("This recording could not be found in the selected folder.");
    return m;
  }
  async playbackPath(id) {
    const m = await this.resolve(id);
    if (this.active?.manifest.id === id)
      throw Error("Stop this take before playback.");
    const latest = m.exports?.at(-1);
    const target = latest?.path
      ? path.join(latest.path, latest.file || "Recording.mp4")
      : path.join(m.dir, m.videoFile || "capture.webm");
    if (!path.resolve(target).startsWith(path.resolve(m.dir) + path.sep))
      throw Error("Invalid recording path.");
    return target;
  }
  async export(id, options, binary, progress = () => {}) {
    if (this.exporting) throw Error("An export is already running.");
    if (this.active || this.beginning)
      throw Error("Stop the recording before exporting.");
    this.exporting = true;
    this.exportController = new AbortController();
    const signal = this.exportController.signal;
    let exportDuration = 0,
      stage = "Preparing export",
      stageStart = 0,
      stageEnd = 0,
      lastPercent = -1;
    const notify = (update) => {
      stage = update.stage;
      stageStart = lastPercent = update.percent;
      stageEnd =
        update.end ??
        (stageStart === 8
          ? 18
          : stageStart === 20
            ? 29
            : stageStart === 65
              ? 84
              : stageStart === 85
                ? 92
                : stageStart === 94
                  ? 99
                  : stageStart + 4);
      if (!signal.aborted) progress(update);
    };
    const encode = (args) => {
      let pending = "";
      return runFFmpeg(
        binary,
        [
          "-filter_threads",
          "1",
          "-filter_complex_threads",
          "1",
          "-progress",
          "pipe:2",
          "-nostats",
          ...args,
        ],
        (chunk) => {
          pending += chunk;
          const lines = pending.split("\n");
          pending = lines.pop().slice(-1000);
          for (const line of lines) {
            const match = line.match(/^out_time_us=(\d+)$/);
            if (!match || !exportDuration || signal.aborted) continue;
            const fraction = Math.min(
              1,
              Number(match[1]) / 1e6 / exportDuration,
            );
            const percent = Math.floor(
              stageStart + fraction * (stageEnd - stageStart),
            );
            if (percent > lastPercent) {
              lastPercent = percent;
              progress({ stage, percent });
            }
          }
        },
        signal,
      );
    };
    let output;
    try {
      const { exportOptions, exportFormat } = await import(
        "../src/export-formats.js"
      );
      options = exportOptions(options);
      const format = exportFormat(options.format);
      const m = await this.resolve(id),
        dir = m.dir;
      for (const t of TRACKS)
        await repairWav(
          path.join(dir, `${t.id}.wav`),
          t.channels,
          m.sampleRate,
        );
      const frames =
        ((await fsp.stat(path.join(dir, "mix.wav"))).size - 80) / 8;
      const duration = frames / m.sampleRate;
      exportDuration = duration;
      if (duration < 0.1)
        throw Error("This session has no recorded audio frames.");
      output = path.join(dir, "Export");
      for (let n = 2; fs.existsSync(output); n++)
        output = path.join(dir, `Export ${n}`);
      await fsp.mkdir(output);
      await fsp.writeFile(
        path.join(output, "INCOMPLETE.txt"),
        "This export has not finished. Your original recording is in the parent folder.\n",
      );
      const target = options.target;
      let analysis = null,
        report = null;
      let filter = "anull";
      if (options.normalize !== false) {
        notify({ stage: "Measuring loudness", percent: 8, end: 14 });
        analysis = parseLoudness(
          await encode([
            "-i",
            path.join(dir, "mix.wav"),
            "-af",
            `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`,
            "-f",
            "null",
            "-",
          ]),
        );
        if (
          analysis &&
          [
            "input_i",
            "input_tp",
            "input_lra",
            "input_thresh",
            "target_offset",
          ].every((k) => Number.isFinite(Number(analysis[k])))
        )
          filter = `loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${analysis.input_i}:measured_TP=${analysis.input_tp}:measured_LRA=${analysis.input_lra}:measured_thresh=${analysis.input_thresh}:offset=${analysis.target_offset}:linear=true:print_format=json`;
        else notify({ stage: "Silent mix · preserving silence", percent: 15 });
      }
      const media = await writeMedia({
        manifest: { ...m, duration },
        output,
        options,
        filter,
        encode,
        notify,
        signal,
      });
      report = parseLoudness(media.mixLog);
      notify({ stage: "Measuring the exported mix", percent: 94 });
      // Measure the delivered mix, since lossy encoding can alter true peaks.
      const verified = parseLoudness(
        await encode([
          "-i",
          path.join(output, media.file),
          "-map",
          "0:a:0",
          "-af",
          `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`,
          "-f",
          "null",
          "-",
        ]),
      );
      const mediaSizes = await Promise.all(
        [media.file, ...media.sidecars].map(
          async (file) => (await fsp.stat(path.join(output, file))).size,
        ),
      );
      const exportReport = {
        fileBytes: mediaSizes[0],
        mediaBytes: mediaSizes.reduce((sum, size) => sum + size, 0),
        format: format.id,
        file: media.file,
        codecs: format.codecs,
        videoMode: media.videoMode,
        separateTracks: options.separateTracks,
        embeddedAudioTracks: format.kind === "video" ? media.tracks.length : 1,
        editingFiles: media.sidecars,
        exportOptions: options,
        targetLUFS: options.normalize === false ? null : target,
        measuredLUFS: verified?.input_i ?? null,
        truePeakDBTP: verified?.input_tp ?? null,
        loudnessRangeLU: verified?.input_lra ?? null,
        normalization: report?.normalization_type ?? "off or silent",
        duration,
        sampleRate: m.sampleRate,
        tracks: media.tracks,
        markers: m.markers || [],
        sourceAnalysis: analysis,
      };
      await fsp.writeFile(
        path.join(output, "Audio report.json"),
        JSON.stringify(exportReport, null, 2),
      );
      await fsp.writeFile(
        path.join(output, "Markers.csv"),
        "seconds,label\n" +
          (m.markers || [])
            .map(
              (x) =>
                `${Number(x.time).toFixed(3)},"${String(x.label).replaceAll('"', '""')}"`,
            )
            .join("\n"),
      );
      await fsp.writeFile(
        path.join(output, "START HERE.txt"),
        [
          "LATITUDE — YOUR EDITING PACK",
          "",
          `${media.file}: ${format.codecs}. ${format.kind === "video" ? `Full mix is the default audio stream. ${options.separateTracks ? "Isolated microphone and desktop streams follow for each recorded source." : "This export contains only the full mix."}` : `The mix is in this file. ${options.separateTracks ? "Each recorded source has its own audio file." : "This export contains only the full mix."}`}`,
          `Format guidance: ${format.compatibility} ${format.size}`,
          format.kind === "video"
            ? "For CapCut, MP4 is the recommended format. Some versions do not expose alternate embedded audio streams. Use the aligned WAV editing files or the per-source video copies."
            : "For sample-aligned editing, choose WAV or FLAC. MP3/AAC decoder handling of encoder delay can vary between editors.",
          options.editingFiles && options.separateTracks
            ? "Put the video and Voice / Desktop WAVs at the same timeline start, mute the video audio, then group/link clips before cutting. Original voice WAVs are pre-processing floating-point backups; input mute is respected."
            : "Your original voice, desktop, and mix recordings remain in the parent session folder. Re-export with separate sources and WAV editing files whenever needed.",
          options.editorClips
            ? `The “only.${format.extension}” clips each contain the same video and one isolated audio track. They preserve the selected format and use extra disk space.`
            : "For video, enable separate sources and per-source video copies if you need to choose a mic-only or desktop-only file for individual clip instances.",
          "Only the full mix is loudness-normalized. Isolated sources retain their relative recording levels and live processing.",
          "Audio stems share one sample clock. Check lip sync with a clap on your hardware before a long session; input driver and webcam latency vary.",
          "Audio report.json contains measured export loudness and encoded true peak. Markers.csv lists your recording markers.",
          "Keep the parent session folder until you are done editing; it contains recoverable originals.",
        ].join("\n"),
      );
      const { dir: _, ...manifest } = m;
      Object.assign(manifest, {
        status: "exported",
        duration,
        exports: [
          ...(m.exports || []),
          {
            path: output,
            file: media.file,
            date: new Date().toISOString(),
            report: exportReport,
          },
        ],
      });
      if (signal.aborted) throw Error("Export canceled.");
      // Commit point: finish metadata atomically instead of canceling halfway
      // through it and leaving a manifest that references a deleted export.
      this.exportController = null;
      await fsp.writeFile(
        path.join(dir, "session.json.tmp"),
        JSON.stringify(manifest, null, 2),
      );
      await fsp.rename(
        path.join(dir, "session.json.tmp"),
        path.join(dir, "session.json"),
      );
      await fsp.unlink(path.join(output, "INCOMPLETE.txt"));
      notify({ stage: "Ready to edit", percent: 100 });
      return { dir: output, file: media.file, report: exportReport };
    } catch (error) {
      // Remove only this attempt's incomplete export, never originals or earlier exports.
      if (signal.aborted && output)
        await fsp.rm(output, { recursive: true, force: true }).catch(() => {});
      throw error;
    } finally {
      this.exporting = false;
      this.exportController = null;
    }
  }
  cancelExport() {
    this.exportController?.abort();
  }
}
module.exports = {
  RecordingStore,
  TRACKS,
  wavHeader,
  repairWav,
  runFFmpeg,
  parseLoudness,
  safeName,
};
