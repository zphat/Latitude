// Parse only the final EBU R128 summary, never a momentary meter line. This
// scanner checks the encoded delivery file without normalizing it a second time.
function parseEBU128(text) {
  const summary = text.slice(text.lastIndexOf("Summary:"));
  const i = summary.match(/Integrated loudness:\s*I:\s*(-?(?:\d+(?:\.\d+)?|inf))\s+LUFS/);
  const lra = summary.match(/Loudness range:\s*LRA:\s*(\d+(?:\.\d+)?)\s+LU/);
  const peak = summary.match(/True peak:\s*Peak:\s*(-?(?:\d+(?:\.\d+)?|inf))\s+dBFS/);
  if (!i || !lra || !peak) return null;
  return {
    // EBU's absolute gate reports its -70 floor for silence / below-gate audio.
    input_i: Number(i[1]) <= -70 || i[1] === "-inf" ? "-inf" : i[1],
    input_tp: peak[1],
    input_lra: lra[1],
  };
}
module.exports = { parseEBU128 };
