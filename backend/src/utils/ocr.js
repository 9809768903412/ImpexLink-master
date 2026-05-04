const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const imageTypes = new Set(['image/jpeg', 'image/png']);
const tessdataPath = path.join(__dirname, '..', 'assets', 'ocr');

async function extractJpegImagesFromPdf(filePath) {
  const buffer = await fs.readFile(filePath);
  const content = buffer.toString('latin1');
  const images = [];
  let searchFrom = 0;

  while (true) {
    const dctIndex = content.indexOf('/Filter/DCTDecode', searchFrom);
    if (dctIndex === -1) break;
    const streamIndex = content.indexOf('stream', dctIndex);
    if (streamIndex === -1) break;

    let start = streamIndex + 'stream'.length;
    if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) {
      start += 2;
    } else if (buffer[start] === 0x0a) {
      start += 1;
    }

    const end = content.indexOf('endstream', start);
    if (end === -1) break;

    let image = buffer.subarray(start, end);
    while (image.length > 0 && (image[image.length - 1] === 0x0a || image[image.length - 1] === 0x0d)) {
      image = image.subarray(0, image.length - 1);
    }

    if (image[0] === 0xff && image[1] === 0xd8) {
      images.push(image);
    }
    searchFrom = end + 'endstream'.length;
  }

  return images;
}

async function recognizeImage(filePath) {
  const { recognize } = require('tesseract.js');
  const result = await recognize(filePath, 'eng', {
    langPath: tessdataPath,
    gzip: false,
    cacheMethod: 'none',
    logger: () => {},
  });
  return result?.data?.text || '';
}

async function extractTextFromPdf(filePath) {
  const images = await extractJpegImagesFromPdf(filePath);
  if (images.length === 0) {
    return { supported: false, text: '', error: 'PDF has no OCR-readable embedded image' };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'impex-po-ocr-'));
  try {
    const textParts = [];
    for (let index = 0; index < images.length; index += 1) {
      const imagePath = path.join(tempDir, `page-${index + 1}.jpg`);
      await fs.writeFile(imagePath, images[index]);
      textParts.push(await recognizeImage(imagePath));
    }
    return { supported: true, text: textParts.join('\n\n'), error: null };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function extractTextFromImage(filePath, mimeType) {
  if (!filePath) {
    return { supported: false, text: '', error: null };
  }

  try {
    if (mimeType === 'application/pdf') {
      return extractTextFromPdf(filePath);
    }

    if (!imageTypes.has(mimeType)) {
      return { supported: false, text: '', error: null };
    }

    return {
      supported: true,
      text: await recognizeImage(filePath),
      error: null,
    };
  } catch (err) {
    console.error('PO OCR failed:', err.message || err);
    return {
      supported: true,
      text: '',
      error: err.message || 'OCR failed',
    };
  }
}

module.exports = {
  extractTextFromImage,
};
