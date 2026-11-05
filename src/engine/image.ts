/** Decoding with the browser's own decoders. Unsupported files get an honest, specific message. */

export const PROXY_EDGE = 2048;
export const MAX_EXPORT_PIXELS = 16_777_216; // Safari's canvas limit; keeps exports reliable on phones

export interface LoadedImage {
  name: string;
  type: string;
  width: number;
  height: number;
  full: ImageBitmap;
  proxy: ImageBitmap;
}

const RAW = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|dng|srw|3fr|iiq|x3f|erf|mef|mos|kdc|rwl)$/i;

export function unsupportedReason(file: { name: string; type: string }): string | null {
  const n = file.name.toLowerCase();
  if (RAW.test(n)) return 'Camera RAW files are not supported yet. Export a JPEG or TIFF from your camera app, or open the JPEG your camera saved alongside it.';
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'PDF pages are not supported yet. Save the page as a PNG or JPEG first.';
  return null;
}

export async function decode(blob: Blob, name: string): Promise<LoadedImage> {
  const reason = unsupportedReason({ name, type: blob.type });
  if (reason) throw new Error(reason);
  let full: ImageBitmap;
  try {
    full = await createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'default' });
  } catch {
    full = await decodeWithImg(blob, name);
  }
  const { width, height } = full;
  const scale = Math.min(1, PROXY_EDGE / Math.max(width, height));
  const proxy = scale < 1
    ? await createImageBitmap(full, { resizeWidth: Math.round(width * scale), resizeHeight: Math.round(height * scale), resizeQuality: 'high' })
    : full;
  return { name, type: blob.type || guessType(name), width, height, full, proxy };
}

async function decodeWithImg(blob: Blob, name: string): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } catch {
    const n = name.toLowerCase();
    if (n.endsWith('.heic') || n.endsWith('.heif')) throw new Error('This browser cannot open HEIC photos. Try Safari, or export the photo as JPEG.');
    if (n.endsWith('.tif') || n.endsWith('.tiff')) throw new Error('This browser cannot open TIFF files. Try Safari, or save the file as PNG or JPEG.');
    throw new Error(`“${name}” could not be opened. It may be damaged or in a format this browser cannot read.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function guessType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
    bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff' } as Record<string, string>)[ext] ?? 'image/*';
}

export const ACCEPT = 'image/*,.heic,.heif,.avif,.tif,.tiff,.bmp,.gif,.webp';
