import {
  EXPORT_FORMATS,
  exportFormat,
  exportOptions,
} from "./export-formats.js";

export function mountExportControls(host, prefix, values, onChange = () => {}) {
  const groups = [
    ["Suggested video formats", EXPORT_FORMATS.filter((f) => f.suggested)],
    [
      "More video formats",
      EXPORT_FORMATS.filter((f) => f.kind === "video" && !f.suggested),
    ],
    [
      "Audio only · podcast files",
      EXPORT_FORMATS.filter((f) => f.kind === "audio"),
    ],
  ];
  const options = groups
    .map(
      ([label, formats]) =>
        `<optgroup label="${label}">${formats.map((f) => `<option value="${f.id}">${f.label}${f.suggested ? ` · ${f.suggested}` : ""}</option>`).join("")}</optgroup>`,
    )
    .join("");
  host.innerHTML = `
    <label class="output-format-label">File format<select id="${prefix}-format" aria-describedby="${prefix}-guide">${options}</select></label>
    <div class="format-guide" id="${prefix}-guide" aria-live="polite"></div>
    <button type="button" class="button small" id="${prefix}-compact">Use space-saving export settings</button>
    <div id="${prefix}-compression-options"><label>Video quality / size<select id="${prefix}-compression"><option value="original">Original · no extra video quality loss · fastest when copied</option><option value="balanced">Balanced compression · smaller, clear everyday footage</option><option value="small">Smaller file · stronger compression, more visible loss in motion</option></select></label><p>Compression re-encodes the video, so it takes longer. Resolution and frame rate stay the same. Savings depend on the original; already-small footage may not shrink.</p></div>
    <label>Compressed audio quality<select id="${prefix}-audio-bitrate"><option value="128">128 kbps · smallest, best for speech</option><option value="192">192 kbps · balanced voice and music</option><option value="256">256 kbps · high quality</option><option value="320">320 kbps · larger, highest bitrate</option></select></label>
    <p id="${prefix}-audio-note"></p>
    <label class="toggle-row"><span>Keep microphone and desktop sources separate</span><input id="${prefix}-separate" type="checkbox"></label>
    <p id="${prefix}-tracks-note"></p>
    <div id="${prefix}-video-options">
      <label class="toggle-row"><span>Also save separate editing files</span><input id="${prefix}-wav" type="checkbox"></label>
      <label>Editing audio format<select id="${prefix}-stems"><option value="wav">WAV · widest editor support, larger files</option><option value="flac">FLAC · lossless, smaller audio files</option></select></label>
      <p id="${prefix}-wav-note"></p>
      <label class="toggle-row"><span>A video copy for each isolated source</span><input id="${prefix}-copies" type="checkbox"></label>
      <p>For choosing mic-only or desktop-only audio on each clip in CapCut. Choose MP4 for this workflow. Each copy duplicates the video on disk.</p>
    </div>
    <p class="format-footnote" id="${prefix}-footnote"></p>`;
  const el = (key) => host.querySelector(`#${prefix}-${key}`);
  el("format").value = EXPORT_FORMATS.some((f) => f.id === values.format)
    ? values.format
    : "mp4";
  el("separate").checked = values.separateTracks !== false;
  el("wav").checked = values.editingFiles !== false;
  el("copies").checked = values.editorClips === true;
  el("compression").value = values.videoCompression || "original";
  el("audio-bitrate").value = values.audioBitrate || 256;
  el("stems").value = values.stemFormat || "wav";
  const read = () =>
    exportOptions({
      format: el("format").value,
      separateTracks: el("separate").checked,
      editingFiles: el("wav").checked,
      editorClips: el("copies").checked,
      videoCompression: el("compression").value,
      audioBitrate: Number(el("audio-bitrate").value),
      stemFormat: el("stems").value,
    });
  function refresh() {
    const f = exportFormat(el("format").value);
    const separate = el("separate").checked;
    const video = f.kind === "video";
    el("guide").innerHTML =
      `<strong>${f.suggested ? `<span class="format-badge">Suggested</span> ` : ""}${f.codecs}</strong><p>${f.compatibility}</p><p><b>Space:</b> ${f.size}</p><p><b>Export speed:</b> ${f.effort}</p>`;
    el("tracks-note").textContent = separate
      ? video
        ? "The video contains Full mix plus a named track for each recorded mic and desktop source. Players usually play the mix; your editor must support alternate tracks."
        : "The mix and each recorded source are saved as separate files in this format. WAV or FLAC is best for precise editing; these audio formats do not hold selectable source tracks in one file."
      : "Exports the full mix only. Your original isolated tracks remain available if you change your mind.";
    el("footnote").textContent = video
      ? "File size mostly comes from video quality, duration, and extra copies. Turning off editing files and video copies saves export space. Original tracks stay in the take folder."
      : "Audio-only exports leave out the picture. The recorded video and original audio remain in the take folder for another export later.";
    el("video-options").hidden = !video;
    el("compression-options").hidden = !video;
    const lossy = ["aac", "libopus", "libmp3lame"].includes(f.audio);
    el("audio-bitrate").disabled = !lossy;
    el("audio-note").textContent = lossy
      ? `About ${(Number(el("audio-bitrate").value) * 3600 / 8 / 1000).toFixed(0)} MB/hour per audio track at the target bitrate. Original audio is unchanged.`
      : "This format uses lossless audio; the bitrate setting does not apply.";
    el("stems").disabled = !video || !el("wav").checked;
    el("copies").disabled = !video || !separate;
    el("wav-note").textContent = el("stems").value === "flac"
      ? "Adds aligned 24-bit FLAC stems with the same decoded samples as 24-bit WAV. Check your editor supports FLAC. Raw mic backups stay in the original take folder."
      : separate
      ? "Adds aligned 24-bit mix, microphone, and desktop WAVs, plus raw mic backups if recorded. Useful when an editor cannot select embedded tracks; uses extra space."
      : "Adds the mastered mix as a 24-bit WAV. Turn on separate sources to include microphone and desktop WAVs.";
  }
  el("compact").onclick = () => {
    el("compression").value = "balanced";
    el("audio-bitrate").value = "192";
    el("wav").checked = false;
    el("copies").checked = false;
    refresh(); onChange(read());
  };
  host.querySelectorAll("input, select").forEach((input) =>
    input.addEventListener("change", () => {
      refresh();
      onChange(read());
    }),
  );
  refresh();
  return { read };
}
