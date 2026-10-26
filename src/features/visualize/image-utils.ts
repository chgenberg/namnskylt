/** Längsta sidan på fotot vi skickar — räcker för bildmodellen, sparar uppladdning. */
const MAX_UPLOAD_SIDE_PX = 1600;
const JPEG_QUALITY = 0.9;

/**
 * Ritar om bilden som JPEG i rimlig storlek. Omkodningen tar också bort
 * EXIF-data (t.ex. GPS-position) innan fotot lämnar kundens enhet.
 */
export async function toUploadJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  const scale = Math.min(1, MAX_UPLOAD_SIDE_PX / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kunde inte läsa fotot");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Kunde inte läsa fotot"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

/** Uppladdad fil → JPEG, roterad enligt kamerans EXIF-orientering. */
export async function fileToUploadJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return await toUploadJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
