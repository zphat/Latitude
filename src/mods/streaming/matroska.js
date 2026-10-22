// Minimal streaming Matroska writer: AVC video + the existing stereo PCM mix.
// No seek tables, duration estimates, dependencies, or whole-session buffers.
const utf8 = new TextEncoder();
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};
function integer(n) {
  let size = 1;
  while (n >= 2 ** (size * 8)) size++;
  const out = new Uint8Array(size);
  for (let i = size - 1; i >= 0; i--) {
    out[i] = n % 256;
    n = Math.floor(n / 256);
  }
  return out;
}
function size(n) {
  let bytes = 1;
  while (n >= 2 ** (7 * bytes) - 1) bytes++;
  const out = new Uint8Array(bytes);
  for (let i = bytes - 1; i >= 0; i--) {
    out[i] = n % 256;
    n = Math.floor(n / 256);
  }
  out[0] |= 1 << (8 - bytes);
  return out;
}
const el = (id, data) => concat(integer(id), size(data.length), data);
const uint = (id, value) => el(id, integer(value));
const str = (id, value) => el(id, utf8.encode(value));
const master = (id, ...children) => el(id, concat(...children));
const float = (id, value) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return el(id, bytes);
};
export function header({ width, height, fps, sampleRate, description }) {
  if (!description?.byteLength)
    throw Error("H.264 configuration was not supplied by the encoder.");
  return concat(
    master(
      0x1a45dfa3,
      uint(0x4286, 1),
      uint(0x42f7, 1),
      uint(0x42f2, 4),
      uint(0x42f3, 8),
      str(0x4282, "matroska"),
      uint(0x4287, 4),
      uint(0x4285, 2),
    ),
    integer(0x18538067),
    new Uint8Array([1, 255, 255, 255, 255, 255, 255, 255]),
    master(
      0x1549a966,
      uint(0x2ad7b1, 1000000),
      str(0x4d80, "Latitude"),
      str(0x5741, "Latitude"),
    ),
    master(
      0x1654ae6b,
      master(
        0xae,
        uint(0xd7, 1),
        uint(0x73c5, 1),
        uint(0x83, 1),
        uint(0x9c, 0),
        str(0x86, "V_MPEG4/ISO/AVC"),
        el(0x63a2, new Uint8Array(description)),
        uint(0x23e383, Math.round(1e9 / fps)),
        master(0xe0, uint(0xb0, width), uint(0xba, height)),
      ),
      master(
        0xae,
        uint(0xd7, 2),
        uint(0x73c5, 2),
        uint(0x83, 2),
        uint(0x9c, 0),
        str(0x86, "A_PCM/FLOAT/IEEE"),
        master(0xe1, float(0xb5, sampleRate), uint(0x9f, 2), uint(0x6264, 32)),
      ),
    ),
  );
}
export function packet(track, timestampUs, bytes, key = true) {
  if (
    ![1, 2].includes(track) ||
    !Number.isFinite(timestampUs) ||
    timestampUs < 0
  )
    throw Error("Invalid streaming timestamp or track.");
  // A finite cluster per packet bounds memory and allows out-of-order A/V arrivals.
  return master(
    0x1f43b675,
    uint(0xe7, Math.round(timestampUs / 1000)),
    el(
      0xa3,
      concat(new Uint8Array([0x80 | track, 0, 0, key ? 0x80 : 0]), bytes),
    ),
  );
}
