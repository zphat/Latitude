// Optional editor IO/renderer. Required only after an explicit editor operation.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { randomUUID, createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const extensions = new Set([
  ".mp4",
  ".m4v",
  ".mov",
  ".mkv",
  ".webm",
  ".avi",
  ".wav",
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".opus",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const model = import("../src/mods/editor/model.js");
const plan = import("../src/mods/editor/render-plan.js");
function command(
  binary,
  args,
  { signal, timeout = 0, onData = () => {}, onPCM, allowFailure = false } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error("Canceled."));
    const child = spawn(binary, ["-hide_banner", "-nostdin", ...args], {
      windowsHide: true,
      stdio: ["ignore", onPCM ? "pipe" : "ignore", "pipe"],
    });
    let log = "",
      timer,
      killTimer,
      expired = false;
    const stop = () => {
      child.kill();
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1500);
      killTimer.unref();
    };
    if (timeout)
      timer = setTimeout(() => {
        expired = true;
        stop();
      }, timeout);
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    if (onPCM) child.stdout.on("data", onPCM);
    child.stderr.on("data", (b) => {
      log = (log + b.toString()).slice(-65536);
      onData(b.toString());
    });
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", stop);
    };
    child.once("error", (e) => {
      cleanup();
      reject(e);
    });
    child.once("close", (code) => {
      cleanup();
      if (signal?.aborted) return reject(Error("Canceled."));
      if (expired) return reject(Error("The media operation timed out."));
      if (code !== 0 && !allowFailure)
        return reject(
          Error(`The media encoder could not finish. ${log.slice(-1300)}`),
        );
      resolve(log);
    });
  });
}
function parseProbe(log, file, knownDuration = 0) {
  const match = log.match(/Duration: (\d+):(\d+):([\d.]+)/),
    video = log.match(/Stream #0:\d+[^\n]*Video:[^\n]*/),
    size = video?.[0].match(/(?:,|\s)(\d{2,5})x(\d{2,5})(?:[ ,\[])/);
  const audio = (log.match(/Stream #0:\d+[^\n]*Audio:/g) || []).length;
  const image = imageExtensions.has(path.extname(file).toLowerCase());
  const duration = match
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    : knownDuration;
  if (!video && !audio)
    throw Error("This file has no supported video or audio stream.");
  if (
    !image &&
    (!Number.isFinite(duration) || duration <= 0 || duration > 43200)
  )
    throw Error(
      "Media needs a known duration of up to 12 hours. Export or remux this file first, or open a Latitude take.",
    );
  return {
    name: path.basename(file),
    kind: image ? "image" : video ? "video" : "audio",
    width: Number(size?.[1] || 0),
    height: Number(size?.[2] || 0),
    duration: image ? 5 : duration,
    audio,
  };
}
class EditorStore {
  constructor({ ffmpeg, profile, onProgress = () => {} }) {
    Object.assign(this, { ffmpeg, profile, onProgress });
    this.media = new Map();
    this.previews = new Map();
    this.projectPaths = new Map();
    this.busy = false;
    this.draftPath = path.join(profile, "editor-draft.json");
  }
  async work(fn) {
    if (this.busy)
      throw Error("Finish or cancel the current editor operation first.");
    this.busy = true;
    this.controller = new AbortController();
    try {
      return await fn(this.controller.signal);
    } finally {
      this.busy = false;
      this.controller = null;
    }
  }
  cancel() {
    this.controller?.abort();
  }
  async temp() {
    if (!this.cache)
      this.cache = await fs.mkdtemp(path.join(os.tmpdir(), "latitude-editor-"));
    return this.cache;
  }
  async probe(file, knownDuration = 0, signal) {
    if (
      typeof file !== "string" ||
      !path.isAbsolute(file) ||
      !extensions.has(path.extname(file).toLowerCase())
    )
      throw Error("Choose a local video, audio or image file.");
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size === 0)
      throw Error("This media file is empty or unavailable.");
    const log = await command(
      this.ffmpeg,
      [
        "-protocol_whitelist",
        "file,pipe",
        "-analyzeduration",
        "5000000",
        "-probesize",
        "5000000",
        "-i",
        file,
      ],
      { signal, timeout: 20000, allowFailure: true },
    );
    return {
      ...parseProbe(log, file, knownDuration),
      path: file,
      size: stat.size,
      modified: stat.mtimeMs,
    };
  }
  public(a) {
    const { path: _, size, modified, ...data } = a;
    return { ...data, url: `take://app/editor-media/${a.id}` };
  }
  async importFiles(files) {
    if (!Array.isArray(files) || files.length > 64)
      throw Error("Import up to 64 files at a time.");
    return this.work(async (signal) => {
      const items = [],
        errors = [];
      for (const file of files) {
        if (this.media.size >= 256)
          throw Error("The media library is full. Start another project.");
        try {
          const a = {
            ...(await this.probe(file, 0, signal)),
            id: randomUUID(),
          };
          this.media.set(a.id, a);
          items.push(this.public(a));
        } catch (e) {
          if (signal.aborted) throw e;
          errors.push(`${path.basename(file)}: ${e.message}`);
        }
      }
      return { items, errors };
    });
  }
  async importTake(take) {
    return this.work(async (signal) => {
      const items = [],
        group = randomUUID();
      const safeFile = (name) => {
        const file = path.resolve(take.dir, name);
        if (!file.startsWith(path.resolve(take.dir) + path.sep))
          throw Error("Invalid take media path.");
        return file;
      };
      const video = take.videoFile || "capture.webm";
      const files = [
        { file: video, name: "Picture" },
        ...["voice1", "voice2", "desktop"].map((id) => ({
          file: `${id}.wav`,
          name: { voice1: "Voice 1", voice2: "Voice 2", desktop: "Desktop" }[
            id
          ],
        })),
      ];
      for (const entry of files) {
        const file = safeFile(entry.file);
        try {
          const stat = await fs.stat(file);
          // Disabled recording lanes retain an empty 80-byte WAV header.
          if (
            !stat.isFile() ||
            (entry.file.endsWith(".wav") && stat.size <= 80)
          )
            continue;
        } catch {
          continue;
        }
        const a = {
          ...(await this.probe(file, take.duration, signal)),
          id: randomUUID(),
        };

        a.name = entry.name;
        this.media.set(a.id, a);
        items.push(this.public(a));
      }
      if (!items.length)
        throw Error("No original media was found in this take.");
      return { items, group, name: take.name, markers: take.markers || [] };
    });
  }
  async validate(project) {
    const { sanitize } = await model;
    const p = sanitize(project);
    for (const a of p.assets) {
      const m = this.media.get(a.id);
      if (!m && !a.missing)
        throw Error("Reopen or relink media before saving this project.");
    }
    return p;
  }
  async payload(project, file) {
    const p = await this.validate(project);
    return {
      schema: "latitude-edit",
      version: 1,
      project: p,
      media: p.assets.map((a) => ({
        id: a.id,
        file: this.media.get(a.id)?.path
          ? path.relative(path.dirname(file), this.media.get(a.id).path)
          : a.name,
        knownDuration: this.media.get(a.id)?.duration || a.duration,
      })),
    };
  }
  async atomic(file, data) {
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, file);
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => {});
    }
  }
  async save(project, file) {
    await this.atomic(file, await this.payload(project, file));
    return path.basename(file);
  }
  async draft(project) {
    this.pendingDraft = await this.payload(project, this.draftPath);
    if (!this.draftTask)
      this.draftTask = (async () => {
        while (this.pendingDraft) {
          const data = this.pendingDraft;
          this.pendingDraft = null;
          await this.atomic(this.draftPath, data);
        }
      })().finally(() => {
        this.draftTask = null;
      });
    await this.draftTask;
    return true;
  }
  async draftInfo() {
    try {
      const stat = await fs.stat(this.draftPath);
      if (stat.size > 4e6) return null;
      const d = JSON.parse(await fs.readFile(this.draftPath, "utf8"));
      return { name: d.project.name, updated: stat.mtime.toISOString() };
    } catch {
      return null;
    }
  }
  async open(file) {
    return this.work(async (signal) => {
      const stat = await fs.stat(file);
      if (stat.size > 4e6) throw Error("This project file is too large.");
      const data = JSON.parse(await fs.readFile(file, "utf8"));
      if (
        data.schema !== "latitude-edit" ||
        data.version !== 1 ||
        !Array.isArray(data.media)
      )
        throw Error("Unsupported Latitude edit project.");
      const { sanitize } = await model;
      const p = sanitize(data.project);
      const items = [];
      const registered = new Map();
      for (const a of p.assets) {
        const ref = data.media.find((m) => m.id === a.id);
        let media;
        try {
          if (!ref || typeof ref.file !== "string" || ref.file.includes("\0"))
            throw Error("Missing reference");
          const target = path.resolve(path.dirname(file), ref.file);
          media = {
            ...(await this.probe(target, a.duration, signal)),
            id: a.id,
          };
          Object.assign(a, {
            missing: false,
            duration: media.duration,
            audio: media.audio,
          });
        } catch (e) {
          if (signal.aborted) throw e;
          a.missing = true;
          media = {
            ...a,
            path: ref?.file ? path.resolve(path.dirname(file), ref.file) : "",
            missing: true,
          };
        }
        registered.set(a.id, media);
        items.push(this.public(media));
      }
      this.media = registered;
      return { project: sanitize(p), items, fileName: path.basename(file) };
    });
  }
  async relink(id, file) {
    if (!this.media.has(id)) throw Error("Unknown media.");
    return this.work(async (signal) => {
      const a = { ...(await this.probe(file, 0, signal)), id };
      if (a.kind !== this.media.get(id).kind)
        throw Error(
          "Relink with the same kind of media: video, audio or image.",
        );
      this.media.set(id, a);
      return this.public(a);
    });
  }
  mediaPath(id) {
    return this.previews.get(id) || this.media.get(id)?.path || null;
  }
  async prepare(id, audio = 0, video = false) {
    return this.work(async (signal) => {
      const a = this.media.get(id);
      if (!a || a.missing) throw Error("Relink this source first.");
      audio = Math.max(
        0,
        Math.min(a.audio - 1, Math.round(Number(audio) || 0)),
      );
      const key = createHash("sha256")
        .update(`${a.path}:${a.modified}:${a.size}:${audio}:${video}`)
        .digest("hex");
      if (this.previews.has(key))
        return { url: `take://app/editor-media/${key}` };
      const dir = await this.temp(),
        file = path.join(dir, key + (video ? ".mp4" : ".m4a"));
      const stat = await fs.statfs(dir);
      if (Number(stat.bavail) * Number(stat.bsize) < 1024 ** 3)
        throw Error("At least 1 GB of free space is needed for preview media.");
      const args = ["-y", "-protocol_whitelist", "file,pipe", "-i", a.path];
      if (video)
        args.push(
          "-map",
          "0:v:0",
          "-vf",
          "scale=w=640:h=640:force_original_aspect_ratio=decrease:force_divisible_by=2",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "26",
          "-pix_fmt",
          "yuv420p",
        );
      else args.push("-vn");
      if (a.audio)
        args.push(
          "-map",
          `0:a:${audio}`,
          "-c:a",
          "aac",
          "-b:a",
          "160k",
          "-ar",
          "48000",
          "-ac",
          "2",
        );
      else args.push("-an");
      args.push("-threads", "2", "-movflags", "+faststart", file);
      try {
        await command(this.ffmpeg, args, {
          signal,
          onData: () =>
            this.onProgress({ message: "Preparing a compatible preview…" }),
        });
        this.previews.set(key, file);
        return { url: `take://app/editor-media/${key}` };
      } catch (e) {
        await fs.rm(file, { force: true });
        throw e;
      }
    });
  }
  async waveform(id, audio = 0) {
    return this.work(async (signal) => {
      const a = this.media.get(id);
      if (!a || a.missing || !a.audio)
        throw Error("Choose an available audio source.");
      audio = Math.round(Number(audio) || 0);
      if (audio < 0 || audio >= a.audio) throw Error("Unknown audio track.");
      a.waveforms ||= {};
      if (a.waveforms[audio]) return a.waveforms[audio];
      const bins = new Float32Array(4096),
        step = Math.max(1, (a.duration * 4000) / bins.length);
      let count = 0,
        tail = Buffer.alloc(0);
      this.onProgress({
        message: "Building a waveform; media is read in small blocks…",
      });
      await command(
        this.ffmpeg,
        [
          "-protocol_whitelist",
          "file,pipe",
          "-i",
          a.path,
          "-map",
          `0:a:${audio}`,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "4000",
          "-f",
          "f32le",
          "pipe:1",
        ],
        {
          signal,
          onPCM: (chunk) => {
            const data = tail.length ? Buffer.concat([tail, chunk]) : chunk;
            const bytes = data.length - (data.length % 4);
            for (let i = 0; i < bytes; i += 4) {
              const value = Math.abs(data.readFloatLE(i)),
                bin = Math.min(bins.length - 1, Math.floor(count++ / step));
              if (Number.isFinite(value))
                bins[bin] = Math.min(1, Math.max(bins[bin], value));
            }
            tail = Buffer.from(data.subarray(bytes));
          },
        },
      );
      if (!count) throw Error("No audio samples were found.");
      a.waveforms[audio] = Array.from(bins);
      return a.waveforms[audio];
    });
  }
  async export(project, options, folder, titleImages) {
    return this.work(async (signal) => {
      const p = await this.validate(project),
        { duration, segments, FORMATS } = await model,
        { segmentPlan, audioTracks, CEILING, VOICE_FILTER, trackMixFilter } =
          await plan;
      const format = ["mp4", "mkv", "wav"].includes(options?.format)
          ? options.format
          : "mp4",
        separate = !!options?.separate && format !== "wav",
        audioOnly = format === "wav";
      const start = options?.range && p.range ? p.range.in : 0,
        end = options?.range && p.range ? p.range.out : duration(p),
        length = end - start;
      if (length < 1 / p.fps)
        throw Error("Add media to the timeline before exporting.");
      if (
        p.assets.some(
          (a) =>
            a.missing &&
            p.clips.some(
              (c) =>
                c.asset === a.id &&
                c.start < end &&
                c.start + c.duration > start,
            ),
        )
      )
        throw Error("Relink missing media before exporting.");
      const pieces = segments(p, start, end);
      if (pieces.length > 4000)
        throw Error(
          "This edit has too many cuts for one export. Export a selected range.",
        );
      const work = await fs.mkdtemp(path.join(folder, ".latitude-edit-"));
      const titleMap = new Map();
      const tracks = audioTracks(p);
      const continuousVoice = tracks.some((t) => t.voice),
        renderSeparate = separate || continuousVoice;
      const safe =
        p.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 60) ||
        "Latitude edit";
      const final = path.join(
        folder,
        `${safe}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      );
      let success = false;
      try {
        const stat = await fs.statfs(folder),
          [w, h] = FORMATS[p.format];
        const estimate =
          length *
            (48000 * 8 * (renderSeparate ? tracks.length + 1 : 1) +
              (audioOnly ? 0 : w * h * 0.8)) +
          256e6;
        if (Number(stat.bavail) * Number(stat.bsize) < estimate)
          throw Error(
            `Allow about ${(estimate / 1e9).toFixed(1)} GB of free space for temporary render files and the finished export.`,
          );
        let titleBytes = 0;
        for (const c of p.clips.filter(
          (c) =>
            !audioOnly &&
            c.kind === "title" &&
            c.start < end &&
            c.start + c.duration > start &&
            !p.tracks.find((t) => t.id === c.track).hidden,
        )) {
          const raw = titleImages?.[c.id];
          if (
            typeof raw !== "string" ||
            !raw.startsWith("data:image/png;base64,") ||
            raw.length > 12e6
          )
            throw Error(
              "A title could not be prepared. Reopen the editor and try again.",
            );
          titleBytes += raw.length;
          if (titleBytes > 64 * 1024 * 1024)
            throw Error("Export a shorter range or simplify its titles.");
          const bytes = Buffer.from(raw.slice(22), "base64");
          if (
            bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
            bytes.length < 24 ||
            bytes.readUInt32BE(16) > 7680 ||
            bytes.readUInt32BE(20) > 4320
          )
            throw Error("Invalid title image.");
          const file = path.join(work, `${c.id}.png`);
          await fs.writeFile(file, bytes);
          titleMap.set(c.id, file);
        }
        const media = new Map(
          p.assets.map((a) => [a.id, this.media.get(a.id)]),
        );
        const parts = [];
        for (let i = 0; i < pieces.length; i++) {
          if (signal.aborted) throw Error("Canceled.");
          const segment = pieces[i],
            built = segmentPlan(p, media, titleMap, segment, {
              separate: renderSeparate,
              deferVoice: continuousVoice,
              audioOnly,
              quality: options?.quality,
            });
          const script = path.join(work, "filters.txt"),
            part = path.join(work, `part-${String(i).padStart(5, "0")}.mkv`);
          await fs.writeFile(script, built.filter);
          this.onProgress({
            percent: Math.round((i / pieces.length) * 75),
            message: `Rendering section ${i + 1} of ${pieces.length}`,
          });
          await command(
            this.ffmpeg,
            [
              "-y",
              ...built.args.slice(0, 4),
              "-filter_complex_script",
              script,
              ...built.args.slice(4),
              part,
            ],
            { signal },
          );
          parts.push(part);
        }
        await fs.writeFile(
          path.join(work, "concat.txt"),
          parts.map((f) => `file '${path.basename(f)}'`).join("\n"),
        );
        let joined = path.join(work, "joined.mkv");
        this.onProgress({
          percent: 77,
          message: "Joining the edit without re-encoding video…",
        });
        await command(
          this.ffmpeg,
          [
            "-y",
            "-f",
            "concat",
            "-safe",
            "1",
            "-i",
            path.join(work, "concat.txt"),
            "-map",
            "0",
            "-c",
            "copy",
            joined,
          ],
          { signal },
        );
        for (const part of parts) await fs.rm(part, { force: true });
        // Stateful EQ/compression runs once across the joined audio, so a cut or
        // 30-second render boundary cannot reset the compressor envelope.
        if (continuousVoice) {
          this.onProgress({
            percent: 79,
            message: "Finishing continuous dialogue processing…",
          });
          const filters = [],
            maps = audioOnly ? [] : ["-map", "0:v:0", "-c:v", "copy"];
          tracks.forEach((t, i) => {
            const chain = t.voice
              ? `${VOICE_FILTER},${trackMixFilter(t)}`
              : "anull";
            filters.push(
              `[0:a:${i + 1}]${chain}${separate ? `,asplit=2[a${i}][s${i}]` : `[a${i}]`}`,
            );
          });
          filters.push(
            tracks.map((_, i) => `[a${i}]`).join("") +
              `amix=inputs=${tracks.length}:normalize=0:duration=longest[mix]`,
          );
          maps.push("-map", "[mix]");
          if (separate) tracks.forEach((_, i) => maps.push("-map", `[s${i}]`));
          const processed = path.join(work, "processed.mkv");
          await command(
            this.ffmpeg,
            [
              "-y",
              "-filter_complex_threads",
              "2",
              "-i",
              joined,
              "-filter_complex",
              filters.join(";"),
              ...maps,
              "-c:a",
              "pcm_f32le",
              "-ar",
              "48000",
              "-t",
              String(length),
              processed,
            ],
            { signal },
          );
          await fs.rm(joined, { force: true });
          joined = processed;
        }
        let loud = CEILING,
          measured = null;
        if (p.normalize) {
          this.onProgress({
            percent: 81,
            message: "Measuring the finished podcast mix…",
          });
          const log = await command(
            this.ffmpeg,
            [
              "-i",
              joined,
              "-map",
              "0:a:0",
              "-af",
              `loudnorm=I=${p.target}:TP=-2:LRA=11:print_format=json`,
              "-f",
              "null",
              "-",
            ],
            { signal },
          );
          try {
            measured = JSON.parse(
              log.match(/\{\s*"input_i"[\s\S]*?\}/g)?.at(-1),
            );
          } catch {}
          if (
            measured &&
            [
              "input_i",
              "input_tp",
              "input_lra",
              "input_thresh",
              "target_offset",
            ].every((k) => Number.isFinite(Number(measured[k])))
          )
            loud = `loudnorm=I=${p.target}:TP=-2:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true,aresample=48000,${CEILING}`;
        }
        const maps = [],
          filter = [`[0:a:0]${loud}[mix]`];
        if (!audioOnly) maps.push("-map", "0:v:0", "-c:v", "copy");
        maps.push("-map", "[mix]");
        if (separate)
          for (let i = 0; i < tracks.length; i++) {
            filter.push(`[0:a:${i + 1}]${CEILING},asplit=2[stem${i}][wav${i}]`);
            maps.push("-map", `[stem${i}]`);
          }
        const output = path.join(work, `Finished.${format}`),
          args = [
            "-y",
            "-i",
            joined,
            "-filter_complex",
            filter.join(";"),
            ...maps,
            "-c:a",
            format === "mkv" ? "flac" : format === "wav" ? "pcm_s24le" : "aac",
            "-ar",
            "48000",
          ];
        if (format === "mp4")
          args.push("-b:a", "256k", "-movflags", "+faststart");
        args.push("-metadata:s:a:0", "title=Full mix");
        if (separate)
          tracks.forEach((t, i) =>
            args.push(`-metadata:s:a:${i + 1}`, `title=${t.name}`),
          );
        args.push("-t", String(length), output);
        if (separate)
          tracks.forEach((t, i) =>
            args.push(
              "-map",
              `[wav${i}]`,
              "-c:a",
              "pcm_s24le",
              "-ar",
              "48000",
              "-t",
              String(length),
              path.join(
                work,
                `Audio-${i + 1}-${t.name.replace(/[^\w -]/g, "").slice(0, 40) || "Layer"}.wav`,
              ),
            ),
          );
        this.onProgress({
          percent: 88,
          message: "Writing the final mix and selected audio tracks…",
        });
        await command(this.ffmpeg, args, { signal });
        const check = await command(
          this.ffmpeg,
          [
            "-i",
            output,
            "-map",
            "0:a:0",
            "-af",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
          ],
          { signal },
        );
        const truePeak =
          check.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.at(-1) || "Not measured";
        await fs.rm(joined, { force: true });
        await fs.rm(path.join(work, "filters.txt"), { force: true });
        await fs.rm(path.join(work, "concat.txt"), { force: true });
        for (const f of titleMap.values()) await fs.rm(f, { force: true });
        const report = {
          version: 1,
          name: p.name,
          duration: length,
          format,
          width: w,
          height: h,
          fps: p.fps,
          normalized: p.normalize,
          targetLUFS: p.normalize ? p.target : null,
          measuredInput: measured,
          encodedTruePeak: truePeak,
          tracks: ["Full mix", ...(separate ? tracks.map((t) => t.name) : [])],
          sourceFilesUnchanged: true,
        };
        await fs.writeFile(
          path.join(work, "Export-report.json"),
          JSON.stringify(report, null, 2),
        );
        await fs.rename(work, final);
        success = true;
        this.lastExport = final;
        this.onProgress({
          percent: 100,
          message: "Export complete. Your source files are unchanged.",
        });
        return {
          folder: final,
          file: path.join(final, `Finished.${format}`),
          report,
        };
      } finally {
        if (!success) await fs.rm(work, { recursive: true, force: true });
      }
    });
  }
  async dispose() {
    this.cancel();
    await this.draftTask?.catch(() => {});
    if (this.busy)
      throw Error("Wait for the editor operation to stop before disabling it.");
    if (this.cache) await fs.rm(this.cache, { recursive: true, force: true });
    this.cache = null;
    this.previews.clear();
    this.media.clear();
  }
}
module.exports = { EditorStore, parseProbe, command };
