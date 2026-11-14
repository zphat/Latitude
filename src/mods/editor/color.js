// CSS filter math in sRGB, also used for the native RGB export filter chain.
// Avoid YUV eq: its brightness/contrast/saturation mean something different.
const n = v => Number(v.toFixed(7));
export function cssColor(c) {
  return `brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturation}) sepia(${c.sepia || 0}) hue-rotate(${c.hue || 0}deg)`;
}
const mixer = matrix => "colorchannelmixer=" + ["rr", "rg", "rb", "gr", "gg", "gb", "br", "bg", "bb"]
  .map((key, i) => `${key}=${n(matrix[i])}`).join(":");
export function exportColor(c) {
  const filters = [];
  const lut = expression => `lutrgb=r='${expression}':g='${expression}':b='${expression}'`;
  if (c.brightness !== 1) filters.push(lut(`clip(val*${c.brightness},0,255)`));
  if (c.contrast !== 1) filters.push(lut(`clip((val-127.5)*${c.contrast}+127.5,0,255)`));
  if (c.saturation !== 1) {
    const s = c.saturation;
    filters.push(mixer([.213+.787*s,.715-.715*s,.072-.072*s,
      .213-.213*s,.715+.285*s,.072-.072*s,.213-.213*s,.715-.715*s,.072+.928*s]));
  }
  if (c.sepia) {
    const s = c.sepia;
    filters.push(mixer([1-.607*s,.769*s,.189*s,.349*s,1-.314*s,.168*s,.272*s,.534*s,1-.869*s]));
  }
  if (c.hue) {
    const co = Math.cos(c.hue * Math.PI / 180), si = Math.sin(c.hue * Math.PI / 180);
    filters.push(mixer([.213+.787*co-.213*si,.715-.715*co-.715*si,.072-.072*co+.928*si,
      .213-.213*co+.143*si,.715+.285*co+.140*si,.072-.072*co-.283*si,
      .213-.213*co-.787*si,.715-.715*co+.715*si,.072+.928*co+.072*si]));
  }
  return filters;
}
