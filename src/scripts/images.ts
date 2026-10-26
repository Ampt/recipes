// Downscale a photo to a JPEG no larger than MAX px on its long side.
// Drawing to a canvas also converts HEIC in browsers that can decode it (Safari).

const MAX = 2000;
const QUALITY = 0.85;

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(src);
    }
  }
}

export async function toJpeg(file: File): Promise<Blob> {
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error(
      `Couldn't read ${file.name}. If it's a HEIC photo, try Safari, or set the camera to "Most Compatible" (JPEG).`,
    );
  }
  const scale = Math.min(1, MAX / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Couldn't convert ${file.name}`))), 'image/jpeg', QUALITY),
  );
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
