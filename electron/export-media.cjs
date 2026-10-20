const fs = require("node:fs/promises");
const path = require("node:path");

// One encoder process at a time. Compact exports read the recorded PCM directly,
// avoiding temporary WAV copies and repeated video encoding for editor clips.
async function writeMedia({
  manifest: m,
  output,
  options,
  filter,
  encode,
  notify,
  signal,
}) {
  const { exportFormat, audioEncoding, videoEncoding, containerFlags } =
    await import("../src/export-formats.js");
  const format = exportFormat(options.format);
  const video = format.kind === "video";
  const sourceTracks = [
    { id: "voice1", name: "Voice 1" },
    { id: "voice2", name: "Voice 2" },
    { id: "desktop", name: "Desktop" },
  ].filter((t) => m[t.id] && options.separateTracks);
  const tracks = [{ id: "mix", name: "Full mix" }, ...sourceTracks];
  const source = (t) => path.join(m.dir, `${t.id}.wav`);
  const file = video
    ? `Recording.${format.extension}`
    : `Mix.${format.extension}`;
  const wav = exportFormat("wav");
  const sidecars = [];
  let mixLog = "";
  const guard = () => {
    if (signal.aborted) throw Error("Export canceled.");
  };
  // When requested, use the mastered editing WAV as the encoder input as well.
  // Otherwise normalization happens directly in the final output, with no temp file.
  if (options.editingFiles) {
    notify({ stage: "Writing the mastered editing WAV", percent: 16, end: 19 });
    mixLog = await encode([
      "-y",
      "-i",
      source(tracks[0]),
      "-af",
      filter,
      ...audioEncoding(wav, m.sampleRate),
      ...containerFlags(wav),
      path.join(output, "Mix.wav"),
    ]);
    sidecars.push("Mix.wav");
  }
  notify({
    stage: video
      ? `Saving ${format.label} · ${tracks.length} audio track${tracks.length === 1 ? "" : "s"}`
      : `Saving the ${format.label} mix`,
    percent: 20,
    end: 64,
  });
  let videoMode = null;
  if (video) {
    const args = ["-y", "-i", path.join(m.dir, m.videoFile || "capture.webm")];
    for (const t of tracks)
      args.push(
        "-i",
        t.id === "mix" && options.editingFiles
          ? path.join(output, "Mix.wav")
          : source(t),
      );
    args.push("-map", "0:v:0");
    for (let i = 0; i < tracks.length; i++) args.push("-map", `${i + 1}:a:0`);
    const plan = videoEncoding(format, m.captureMime, options.quality);
    videoMode = plan.mode;
    args.push(...plan.args, ...audioEncoding(format, m.sampleRate));
    if (!options.editingFiles) args.push("-filter:a:0", filter);
    for (let i = 0; i < tracks.length; i++) {
      args.push(
        `-metadata:s:a:${i}`,
        `title=${tracks[i].name}`,
        `-metadata:s:a:${i}`,
        `handler_name=${tracks[i].name}`,
        `-disposition:a:${i}`,
        i === 0 ? "default" : "0",
      );
    }
    args.push(
      "-t",
      String(m.duration),
      ...containerFlags(format),
      path.join(output, file),
    );
    const log = await encode(args);
    if (!options.editingFiles) mixLog = log;
  } else {
    mixLog = await encode([
      "-y",
      "-i",
      source(tracks[0]),
      "-af",
      filter,
      ...audioEncoding(format, m.sampleRate),
      ...containerFlags(format),
      path.join(output, file),
    ]);
  }
  const extraTracks = video
    ? options.editingFiles
      ? [
          ...sourceTracks,
          ...sourceTracks
            .filter((t) => t.id.startsWith("voice"))
            .map((t) => ({
              id: `raw${t.id.at(-1)}`,
              name: `${t.name} original`,
              raw: true,
            })),
        ]
      : []
    : sourceTracks;
  for (const [i, t] of extraTracks.entries()) {
    guard();
    notify({
      stage: `Writing ${t.name}`,
      percent: Math.floor(65 + (i * 19) / extraTracks.length),
      end: Math.floor(65 + ((i + 1) * 19) / extraTracks.length),
    });
    const trackFormat = video ? wav : format;
    const name = `${t.name}.${trackFormat.extension}`;
    if (t.raw) await fs.copyFile(source(t), path.join(output, name));
    else
      await encode([
        "-y",
        "-i",
        source(t),
        ...audioEncoding(trackFormat, m.sampleRate),
        ...containerFlags(trackFormat),
        path.join(output, name),
      ]);
    sidecars.push(name);
  }
  if (options.editorClips) {
    for (let i = 1; i < tracks.length; i++) {
      notify({
        stage: `Making ${tracks[i].name} editor clip`,
        percent: Math.floor(85 + ((i - 1) * 8) / (tracks.length - 1)),
        end: Math.floor(85 + (i * 8) / (tracks.length - 1)),
      });
      const name = `${tracks[i].name} only.${format.extension}`;
      await encode([
        "-y",
        "-i",
        path.join(output, file),
        "-map",
        "0:v:0",
        "-map",
        `0:a:${i}`,
        "-c",
        "copy",
        "-disposition:a:0",
        "default",
        ...containerFlags(format),
        path.join(output, name),
      ]);
      sidecars.push(name);
    }
  }
  guard();
  return {
    file,
    sidecars,
    tracks: tracks.map((t) => t.name),
    videoMode,
    mixLog,
  };
}

module.exports = { writeMedia };
