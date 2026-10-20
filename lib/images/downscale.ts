// Shrinks an image in the browser before it is uploaded.
//
// Avatars and business logos are shown at 32–48 px, and were stored — and
// served, on every portal page — at whatever size was picked, up to the
// buckets' 2 MB limit. Storage image transforms are a Pro-plan feature this
// project does not have, so the portal stores what it shows: at most
// `maxSide` px on the longer side, as WebP where the browser can encode it
// (otherwise the PNG canvas.toBlob falls back to). The result's own type is
// what the caller uploads it as.
//
// Never makes things worse: an SVG (already small, and a canvas would rasterise
// it), an image the browser cannot decode, or a result no smaller than the
// original are all returned as they came.

/** Longest side for an image shown at 48 px or less: three device pixels per CSS pixel, with room to spare. */
export const THUMBNAIL_SIDE = 256;

export async function downscaleImage(file: File, maxSide = THUMBNAIL_SIDE): Promise<Blob> {
  if (file.type === 'image/svg+xml' || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  return blob && blob.size < file.size ? blob : file;
}

/** The file extension for an uploaded image's type. */
export function imageExtension(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/svg+xml') return 'svg';
  return 'jpg';
}
