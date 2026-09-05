(function (root) {
  "use strict";
  function animatedPng(bytes) {
    const view = new DataView(bytes);
    for (let offset = 8; offset + 12 <= view.byteLength;) {
      if (view.getUint32(offset + 4) === 0x6163544c) return true; // acTL
      const length = view.getUint32(offset);
      if (length > view.byteLength - offset - 12) break;
      offset += length + 12;
    }
    return false;
  }
  async function prepare(file, optimize = true) {
    const original = { file, width: 0, height: 0, originalSize: file.size };
    // Preserve animation and vector formats. Only static JPEG and PNG are converted.
    if (!root.createImageBitmap || !/\.(png|jpe?g)$/i.test(file.name)) return original;
    if (/\.png$/i.test(file.name) && animatedPng(await file.arrayBuffer())) return original;
    let bitmap;
    try {
      bitmap = await root.createImageBitmap(file);
      const width = bitmap.width, height = bitmap.height;
      if (!optimize) return { ...original, width, height };
      const scale = Math.min(1, 1920 / Math.max(width, height));
      const canvas = root.document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .86));
      // Do not increase file size or silently rename a PNG fallback to WebP.
      if (!blob || blob.type !== "image/webp" || blob.size >= file.size * .9) return { ...original, width, height };
      return { file: new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }),
        width: canvas.width, height: canvas.height, originalSize: file.size };
    } catch { return original; }
    finally { bitmap?.close(); }
  }
  const api = { prepare, animatedPng };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BlogImageTools = api;
})(typeof window !== "undefined" ? window : globalThis);
