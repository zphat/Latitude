// Synthetic export-only comparison. Does not measure live capture CPU or OBS.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { RecordingStore, TRACKS } = require("../electron/recording.cjs");

(async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "latitude-export-bench-"),
  );
  const binary = process.env.TAKE_FFMPEG || require("ffmpeg-static");
  const store = new RecordingStore(root);
  const baseline = process.env.LATITUDE_BENCH_BASELINE;
  const previous = baseline
    ? new (require(path.resolve(baseline, "electron/recording.cjs")).RecordingStore)(root)
    : null;
  try {
    const take = await store.begin({
      name: "Export benchmark",
      sampleRate: 48000,
      voice1: true,
      voice2: true,
      desktop: true,
      captureMime: "video/webm;codecs=h264,opus",
    });
    for (const [j, track] of TRACKS.entries()) {
      const pcm = new Float32Array(48000 * track.channels);
      for (let i = 0; i < pcm.length; i++)
        pcm[i] =
          Math.sin(
            (Math.floor(i / track.channels) * 2 * Math.PI * (220 + j * 110)) /
              48000,
          ) * 0.15;
      for (let second = 0; second < 30; second++)
        await store.append(take.id, track.id, pcm.buffer);
    }
    await store.end();
    execFileSync(binary, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-t",
      "30",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      path.join(take.dir, "capture.mkv"),
    ]);
    const results = [];
    // Alternate order to reduce cache/order bias. Median of three exports each.
    const variants = baseline ? ["baseline", "current", "current", "baseline", "baseline", "current"] : [true, false, false, true, true, false];
    for (const variant of variants) {
      const editingFiles = baseline ? true : variant;
      const start = performance.now();
      const result = await (variant === "baseline" ? previous : store).export(
        take.id,
        {
          format: "mp4",
          separateTracks: true,
          editingFiles,
          editorClips: false,
          normalize: true,
        },
        binary,
      );
      results.push({
        variant,
        editingFiles,
        elapsedMs: Math.round(performance.now() - start),
        mediaBytes: result.report.mediaBytes,
        videoMode: result.report.videoMode,
        audioTracks: result.report.embeddedAudioTracks,
      });
      await fs.rm(result.dir, { recursive: true, force: true });
    }
    const median = (xs) => xs.sort((a, b) => a - b)[1];
    console.log(
      JSON.stringify(
        {
          seconds: 30,
          sampleRate: 48000,
          video: "320×180 synthetic H.264",
          note: "Export-only, generated tones; wall time depends on hardware and cache. Both variants keep four embedded audio tracks. Excludes retained original recordings.",
          baseline: baseline || null,
          modes: [...new Set(variants)].map((variant) => {
            const runs = results.filter((r) => r.variant === variant);
            return {
              variant,
              editingFiles: runs[0].editingFiles,
              medianMs: median(runs.map((r) => r.elapsedMs)),
              mediaBytes: runs[0].mediaBytes,
              audioTracks: runs[0].audioTracks,
              videoMode: runs[0].videoMode,
            };
          }),
          runs: results,
        },
        null,
        2,
      ),
    );
  } finally {
    await store.end();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
