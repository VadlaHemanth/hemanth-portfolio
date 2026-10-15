/** Journey media: pick a quality tier, fetch in priority order with real byte progress, decode off-thread. */

export function chooseTier({width, height, dpr, coarse, memory, cores, connection}) {
  const saveData = !!connection?.saveData;
  const slow = ["slow-2g", "2g", "3g"].includes(connection?.effectiveType) || (connection?.downlink > 0 && connection.downlink < 1.5);
  const limited = (memory > 0 && memory <= 2) || (cores > 0 && cores <= 2);
  if (saveData || slow || limited) return "low";
  const pixels = Math.max(width, height) * Math.min(dpr || 1, 2);
  if (coarse) return memory >= 8 && pixels >= 2200 ? "high" : pixels >= 1100 ? "mid" : "low";
  return pixels >= 1900 ? "high" : pixels >= 1100 ? "mid" : "low";
}

/** Fetch a list of files sequentially (in priority order) while reporting combined progress. */
export async function fetchAll(files, {signal, onProgress, onFile} = {}) {
  const total = files.reduce((sum, f) => sum + (f.bytes || 0), 0);
  let received = 0;
  const results = {};
  for (const file of files) {
    const response = await fetch(file.src, {signal, cache: "force-cache"});
    if (!response.ok) throw new Error(`${file.src}: ${response.status}`);
    let blob;
    if (response.body && total) {
      const reader = response.body.getReader();
      const chunks = [];
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onProgress?.(Math.min(1, received / total));
      }
      blob = new Blob(chunks, {type: response.headers.get("content-type") || "image/webp"});
    } else {
      blob = await response.blob();
      received += blob.size;
      onProgress?.(total ? Math.min(1, received / total) : 1);
    }
    const bitmap = await createImageBitmap(blob, {imageOrientation: "none", premultiplyAlpha: "none", colorSpaceConversion: "none"});
    results[file.key] = bitmap;
    onFile?.(file.key, bitmap);
  }
  return results;
}
