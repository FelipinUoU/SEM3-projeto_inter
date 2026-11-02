import path from 'path';
import sharp from 'sharp';

const IMAGEKIT_TARGET_IMAGE_BYTES = 400 * 1024;
const IMAGEKIT_MAX_IMAGE_DIMENSION = 3200;
const ORIGINAL_IMAGE_FORMATS = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp']
]);

export async function optimizeImageForImageKit(buffer, fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (buffer.length <= IMAGEKIT_TARGET_IMAGE_BYTES || extension === '.gif') {
    return { buffer, fileName, format: ORIGINAL_IMAGE_FORMATS.get(extension) };
  }

  const metadata = await sharp(buffer, { animated: false }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Não foi possível identificar as dimensões da imagem ${fileName}.`);
  }
  let pipeline = sharp(buffer, { animated: false, failOn: 'error' }).rotate();
  if (Math.max(metadata.width, metadata.height) > IMAGEKIT_MAX_IMAGE_DIMENSION) {
    pipeline = pipeline.resize({
      width: IMAGEKIT_MAX_IMAGE_DIMENSION,
      height: IMAGEKIT_MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  let bestBuffer = buffer;
  for (const quality of [90, 86, 82]) {
    const compressed = await pipeline.clone().webp({
      quality,
      effort: 4,
      smartSubsample: true,
      alphaQuality: 100
    }).toBuffer();
    if (compressed.length < bestBuffer.length) bestBuffer = compressed;
    if (compressed.length <= IMAGEKIT_TARGET_IMAGE_BYTES) break;
  }
  if (bestBuffer === buffer) {
    return { buffer, fileName, format: ORIGINAL_IMAGE_FORMATS.get(extension) };
  }

  const basename = path.basename(fileName, path.extname(fileName));
  return {
    buffer: bestBuffer,
    fileName: `${basename}.webp`,
    format: 'image/webp'
  };
}
