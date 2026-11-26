// The EBU loudness gate can exclude quiet audio even when there is a finite peak.
const reading = value => (typeof value === "number" || (typeof value === "string" && value.trim()))
  && Number.isFinite(Number(value)) ? Number(value) : null;
const below = v => v === -Infinity || (typeof v === "string" && /^-inf(?:inity)?$/i.test(v));
export function mixSummary(report) {
  const i = reading(report?.measuredLUFS), tp = reading(report?.truePeakDBTP);
  if (below(report?.measuredLUFS) && below(report?.truePeakDBTP)) return "Silent mix";
  const parts = [];
  if (i !== null) parts.push(i.toFixed(1) + " LUFS");
  else if (below(report?.measuredLUFS)) parts.push("Below loudness gate");
  if (tp !== null) parts.push(tp.toFixed(1) + " dBTP");
  return parts.join(" · ") || "Loudness unavailable";
}
export function lowHeadroom(report) {
  const tp = reading(report?.truePeakDBTP);
  return tp !== null && tp > -1;
}
