// Titles are metadata, not paths. Preserve punctuation and Unicode in the UI;
// the recording store separately sanitizes the initial directory name.
export function sessionName(value) {
  if (typeof value !== "string") throw Error("Enter a session name.");
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 70).trim();
}

export function recordingName(value, date = new Date()) {
  const name = sessionName(value ?? "");
  if (name && name !== "Untitled session") return name;
  const two = (n) => String(n).padStart(2, "0");
  return `Recording ${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`;
}
