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
    <label class="toggle-row"><span>Keep microphone and desktop sources separate</span><input id="${prefix}-separate" type="checkbox"></label>
    <p id="${prefix}-tracks-note"></p>
    <div id="${prefix}-video-options">
      <label class="toggle-row"><span>Also save WAV editing files</span><input id="${prefix}-wav" type="checkbox"></label>
      <p id="${prefix}-wav-note"></p>
      <label class="toggle-row"><span>A video copy for each isolated source</span><input id="${prefix}-copies" type="checkbox"></label>
      <p>For choosing mic-only or desktop-only audio on each clip in CapCut. Choose MP4 for this workflow. Each copy duplicates the video on disk.</p>
    </div>
    <p class="format-footnote">File size mostly comes from video quality, duration, and extra copies. Turning off WAV files and video copies saves export space. Original tracks stay in the take folder.</p>`;
  const el = (key) => host.querySelector(`#${prefix}-${key}`);
  el("format").value = EXPORT_FORMATS.some((f) => f.id === values.format)
    ? values.format
    : "mp4";
  el("separate").checked = values.separateTracks !== false;
  el("wav").checked = values.editingFiles !== false;
  el("copies").checked = values.editorClips === true;
  const read = () =>
    exportOptions({
      format: el("format").value,
      separateTracks: el("separate").checked,
      editingFiles: el("wav").checked,
      editorClips: el("copies").checked,
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
    el("video-options").hidden = !video;
    el("copies").disabled = !video || !separate;
    el("wav-note").textContent = separate
      ? "Adds aligned 24-bit mix, microphone, and desktop WAVs plus raw mic backups. Useful when an editor cannot select embedded tracks; uses extra space."
      : "Adds the mastered mix as a 24-bit WAV. Turn on separate sources to include microphone and desktop WAVs.";
  }
  host.querySelectorAll("input, select").forEach((input) =>
    input.addEventListener("change", () => {
      refresh();
      onChange(read());
    }),
  );
  refresh();
  return { read };
}
