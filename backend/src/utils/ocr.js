const imageTypes = new Set(['image/jpeg', 'image/png']);

async function extractTextFromImage(filePath, mimeType) {
  if (!filePath || !imageTypes.has(mimeType)) {
    return { supported: false, text: '', error: null };
  }

  try {
    const { recognize } = require('tesseract.js');
    const result = await recognize(filePath, 'eng', {
      logger: () => {},
    });
    return {
      supported: true,
      text: result?.data?.text || '',
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
