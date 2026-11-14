// Locally bundled open fonts; only the selected face is decoded, never fetched online.
export const FONTS = Object.freeze([
  { name: "Manrope", file: "Manrope", weight: 700, family: "Clean", sample: "Clear voices. Strong stories." },
  { name: "DM Serif Display", file: "DMSerifDisplay", weight: 400, family: "Editorial", sample: "A story worth telling." },
  { name: "Outfit", file: "Outfit", weight: 700, family: "Clean", sample: "The next chapter." },
  { name: "Space Grotesk", file: "SpaceGrotesk", weight: 700, family: "Clean", sample: "Ideas from another orbit." },
  { name: "Lexend", file: "Lexend", weight: 700, family: "Clean", sample: "Read between the lines." },
  { name: "Bebas Neue", file: "BebasNeue", weight: 400, family: "Headlines", sample: "MAKE SOME NOISE" },
  { name: "Oswald", file: "Oswald", weight: 700, family: "Headlines", sample: "LIVE FROM THE STUDIO" },
  { name: "Archivo Black", file: "ArchivoBlack", weight: 400, family: "Headlines", sample: "BIG IDEAS. NO FILTER." },
  { name: "Playfair Display", file: "PlayfairDisplay", weight: 700, family: "Editorial", sample: "The long conversation." },
  { name: "Roboto Slab", file: "RobotoSlab", weight: 700, family: "Editorial", sample: "Notes from the field." },
  { name: "Space Mono", file: "SpaceMono", weight: 700, family: "Technical", sample: "TRANSMISSION 001" },
  { name: "Caveat", file: "Caveat", weight: 700, family: "Handwritten", sample: "One more thought…" },
  { name: "Permanent Marker", file: "PermanentMarker", weight: 400, family: "Handwritten", sample: "OFF THE RECORD" },
  { name: "Pacifico", file: "Pacifico", weight: 400, family: "Handwritten", sample: "Good things take time" },
  { name: "Bangers", file: "Bangers", weight: 400, family: "Playful", sample: "WAIT, WHAT?!" },
  { name: "monospace", weight: 700, family: "System", sample: "00:00:01:00" },
]);
export const FONT_NAMES = new Set(FONTS.map(f => f.name));
export const fontWeight = name => FONTS.find(f => f.name === name)?.weight || 700;
export const fontSpec = (name, size = 64) => `${fontWeight(name)} ${size}px ${name === "monospace" ? name : `"${name}"`}`;
// A mod-owned font manager: failed loads are retryable; disable releases faces.
export function fontManager() {
  const pending = new Map(), loaded = new Map(), faces = new Set();
  let disposed = false;
  const ensure = name => {
    const font = FONTS.find(f => f.name === name);
    if (!font || disposed) return Promise.reject(Error("This title font is unavailable."));
    if (loaded.has(name)) return Promise.resolve();
    if (pending.has(name)) return pending.get(name);
    const task = (async () => {
      if (font.file) {
        const face = new FontFace(name, `url("${new URL(`../../../assets/fonts/${font.file}.ttf`, import.meta.url).href}")`, { weight: String(font.weight) });
        await face.load();
        if (disposed) return;
        document.fonts.add(face); faces.add(face);
      }
      loaded.set(name, true);
    })().finally(() => pending.delete(name));
    pending.set(name, task); return task;
  };
  return { ensure, has: name => loaded.has(name), destroy() { disposed = true; for (const face of faces) document.fonts.delete(face); faces.clear(); loaded.clear(); } };
}
