let database;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("latitude-assets", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("images");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function getAsset(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("images").objectStore("images").get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function putAsset(id, blob) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("images", "readwrite");
    tx.objectStore("images").put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function importImage(file) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw Error("Choose a PNG, JPEG, or WebP image under 12 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 32e6) {
    bitmap.close();
    throw Error("Choose an image under 32 megapixels.");
  }
  const scale = Math.min(1, 3840 / Math.max(bitmap.width, bitmap.height)),
    width = Math.round(bitmap.width * scale),
    height = Math.round(bitmap.height * scale),
    canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.94));
  if (!blob) throw Error("Could not decode this image.");
  const id = crypto.randomUUID();
  await putAsset(id, blob);
  return { id, width, height };
}
export async function exportAssets(documents) {
  const ids = new Set(
      Object.values(documents)
        .flat()
        .filter((l) => l.type === "image")
        .map((l) => l.asset),
    ),
    result = {};
  for (const id of ids) {
    const blob = await getAsset(id);
    if (blob)
      result[id] = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
  }
  return result;
}
export async function importAssets(assets = {}) {
  for (const [id, data] of Object.entries(assets)) {
    if (
      !/^[\w-]{1,80}$/.test(id) ||
      typeof data !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data) ||
      data.length > 4e6
    )
      throw Error("Invalid image in scene pack.");
    const bytes = Uint8Array.fromBase64(data.split(",")[1]),
      blob = new Blob([bytes], { type: data.slice(5, data.indexOf(";")) }),
      image = await createImageBitmap(blob);
    if (image.width * image.height > 32e6) {
      image.close();
      throw Error("Scene image is too large.");
    }
    image.close();
    await putAsset(id, blob);
  }
}
