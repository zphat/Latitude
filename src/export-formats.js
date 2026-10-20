// Shared by the renderer and the export worker. No browser or platform dependencies.
export const EXPORT_FORMATS = Object.freeze([
  {
    id: "mp4",
    label: "MP4",
    extension: "mp4",
    kind: "video",
    suggested: "Everyday recording",
    video: "h264",
    audio: "aac",
    codecs: "H.264 video · AAC audio",
    compatibility:
      "Best starting point for CapCut, sharing, and most players and editors.",
    size: "Compact audio. Video is copied at its recorded quality when possible; choose Efficient recording quality for smaller future takes.",
    effort: "Usually the fastest export with Auto / H.264 capture.",
  },
  {
    id: "mkv",
    label: "MKV",
    extension: "mkv",
    kind: "video",
    suggested: "Keep lossless audio",
    video: "h264",
    audio: "flac",
    codecs: "H.264 video · 24-bit FLAC audio",
    compatibility:
      "A flexible archive with lossless audio. Some editors need an MP4 re-export or the WAV editing files.",
    size: "FLAC saves space compared with uncompressed WAV audio. Overall video size is similar to MP4, with larger audio tracks.",
    effort: "Copies H.264 video when available; only audio is encoded.",
  },
  {
    id: "mov",
    label: "MOV",
    extension: "mov",
    kind: "video",
    suggested: "Editing with PCM audio",
    video: "h264",
    audio: "pcm_s24le",
    codecs: "H.264 video · 24-bit PCM audio",
    compatibility:
      "For editors that prefer QuickTime files and uncompressed audio. This is H.264, not ProRes.",
    size: "Largest audio of these video choices: about 1.04 GB/hour for the stereo mix, or 3.11 GB/hour with two mono mics and stereo desktop included.",
    effort:
      "Copies H.264 video when available; uncompressed audio needs little encoding work.",
  },
  {
    id: "webm",
    label: "WebM",
    extension: "webm",
    kind: "video",
    video: "vp9",
    audio: "libopus",
    codecs: "VP9 video · Opus audio",
    compatibility:
      "An open web format. Good browser support; editing-app support varies. Choose MP4 for the easiest CapCut workflow.",
    size: "VP9 can reduce video size, depending on the scene. No fixed size saving is guaranteed.",
    effort:
      "Re-encodes H.264 / VP8 capture to VP9. Slower and more CPU intensive than MP4; originals keep their recorded quality.",
  },
  {
    id: "wav",
    label: "WAV",
    extension: "wav",
    kind: "audio",
    audio: "pcm_s24le",
    codecs: "24-bit PCM audio · no video",
    compatibility:
      "Uncompressed audio for almost any audio editor. Very long files use RF64, which needs a compatible editor.",
    size: "Largest audio-only choice: about 1.04 GB/hour for the 48 kHz stereo mix; 0.52 GB/hour per mono mic.",
    effort: "Fast to write, with no lossy compression.",
  },
  {
    id: "flac",
    label: "FLAC",
    extension: "flac",
    kind: "audio",
    audio: "flac",
    codecs: "24-bit lossless audio · no video",
    compatibility:
      "Lossless podcast masters. Check your editor or upload service supports FLAC; WAV is the broader editing choice.",
    size: "Smaller than WAV for typical speech, with the same decoded 24-bit samples. Size depends on the sound.",
    effort: "Lightweight lossless compression.",
  },
  {
    id: "mp3",
    label: "MP3",
    extension: "mp3",
    kind: "audio",
    audio: "libmp3lame",
    codecs: "192 kbps MP3 audio · no video",
    compatibility:
      "A widely supported podcast delivery file. Lossy; keep WAV or FLAC for further editing.",
    size: "One of the smallest choices here: about 86 MB/hour per file at 192 kbps. Separate sources add more files.",
    effort: "Audio-only encoding, with much less work than video conversion.",
  },
  {
    id: "m4a",
    label: "M4A",
    extension: "m4a",
    kind: "audio",
    audio: "aac",
    codecs: "192 kbps AAC audio · no video",
    compatibility:
      "A compact listening file supported by many phones and players. Check your podcast host accepts M4A. Lossy audio.",
    size: "One of the smallest choices here: roughly 86 MB/hour per file at the target bitrate. Actual AAC size varies.",
    effort: "Audio-only encoding, with much less work than video conversion.",
  },
]);

export function exportFormat(id = "mp4") {
  const format = EXPORT_FORMATS.find((f) => f.id === id);
  if (!format)
    throw Error("Unsupported export format. Choose a format from the list.");
  return format;
}

export function exportOptions(options = {}) {
  const format = exportFormat(options.format ?? "mp4");
  const separateTracks = options.separateTracks !== false;
  return {
    format: format.id,
    separateTracks,
    editingFiles: format.kind === "video" && options.editingFiles !== false,
    editorClips:
      format.kind === "video" && separateTracks && options.editorClips === true,
    normalize: options.normalize !== false,
    target: [-14, -16, -18, -20].includes(Number(options.target))
      ? Number(options.target)
      : -16,
    quality: ["high", "efficient"].includes(options.quality)
      ? options.quality
      : "balanced",
  };
}

export function audioEncoding(format, sampleRate = 48000) {
  const args = [
    "-c:a",
    format.audio,
    "-ar",
    String(format.audio === "libopus" ? 48000 : sampleRate),
  ];
  if (format.audio === "aac")
    args.push("-b:a", format.kind === "audio" ? "192k" : "256k");
  if (format.audio === "libopus") args.push("-b:a", "192k");
  if (format.audio === "libmp3lame") args.push("-b:a", "192k");
  if (format.audio === "flac")
    args.push(
      "-sample_fmt",
      "s32",
      "-bits_per_raw_sample",
      "24",
      "-compression_level",
      "5",
    );
  return args;
}

export function containerFlags(format) {
  if (["mp4", "mov", "m4a"].includes(format.id))
    return ["-movflags", "+faststart"];
  return format.id === "wav" ? ["-rf64", "auto"] : [];
}

export function videoEncoding(format, captureMime, quality = "balanced") {
  const h264 = /h264|avc1/i.test(captureMime || "");
  const vp9 = /vp9|vp09/i.test(captureMime || "");
  const copy = format.video === "h264" ? h264 : vp9;
  const codecName = format.video === "h264" ? "H.264" : "VP9";
  if (copy)
    return {
      copy: true,
      mode: `${codecName} stream copy`,
      args: ["-c:v", "copy"],
    };
  const crf =
    format.video === "vp9"
      ? quality === "high"
        ? 26
        : quality === "efficient"
          ? 36
          : 31
      : quality === "high"
        ? 18
        : quality === "efficient"
          ? 24
          : 21;
  const args =
    format.video === "vp9"
      ? [
          "-c:v",
          "libvpx-vp9",
          "-b:v",
          "0",
          "-deadline",
          "good",
          "-cpu-used",
          "4",
          "-row-mt",
          "1",
        ]
      : ["-c:v", "libx264", "-preset", "veryfast"];
  args.push(
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-threads:v",
    "4",
    "-vf",
    "tpad=stop_mode=clone:stop_duration=1",
  );
  return { copy: false, mode: `${codecName} encode`, args };
}
