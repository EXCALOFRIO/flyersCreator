const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { GoogleGenAI, createUserContent, createPartFromUri } = require('@google/genai');

const INLINE_TOTAL_LIMIT = 4 * 1024 * 1024; // 4MB limit for Vercel serverless
const INLINE_FILE_THRESHOLD = 2 * 1024 * 1024; // 2MB threshold to force upload

function stripDataPrefix(b64) {
  if (!b64) return b64;
  const idx = b64.indexOf('base64,');
  if (idx !== -1) return b64.slice(idx + 'base64,'.length);
  return b64;
}

function tempFilePath(ext = '') {
  const name = crypto.randomBytes(8).toString('hex');
  return path.join(os.tmpdir(), `${name}${ext}`);
}

async function writeBase64ToTempFile(base64Str, ext = '') {
  const filePath = tempFilePath(ext);
  const buf = Buffer.from(base64Str, 'base64');
  await fs.promises.writeFile(filePath, buf);
  return filePath;
}

function mimeToExt(mime) {
  if (!mime) return '';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/heic' || mime === 'image/heif') return '.heic';
  return '';
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY not set' });
    return;
  }

  try {
    const body = req.body || {};
    const ai = new GoogleGenAI({ apiKey });

    const image = body.image;
    if (!image) {
      res.status(400).json({ error: 'Missing image in request body' });
      return;
    }

    const promptText = body.prompt || `Analiza esta imagen y sugiere 3 paletas de colores distintas y visualmente armoniosas. Cada paleta es para elementos de UI sobre la imagen. Para cada paleta, proporciona un color 'primary' y un color 'accent' vibrante. Crucialmente, el color 'primary' DEBE ser un color claro, tipo pastel (por ejemplo, amarillo claro, cian pálido o un lavanda suave), pero por favor evita usar blanco puro (#FFFFFF) para las tres paletas para asegurar variedad. Debe tener un ratio de contraste muy alto contra la imagen general para asegurar que los elementos de texto como los nombres de los días sean fácilmente legibles y accesibles. El color 'accent' debe ser vibrante y complementario para efectos especiales. Devuelve un único objeto JSON con una clave 'palettes' que es un array de estos 3 objetos de paleta. Cada objeto debe tener las claves: 'primary' y 'accent', con valores de código de color hexadecimal en formato string.`;

    // Build parts: try inline if safe, otherwise upload
    const parts = [];
    const mime = image.mimeType || 'image/png';

    if (image.base64) {
      const rawB64 = stripDataPrefix(image.base64);
      const bytes = Buffer.from(rawB64, 'base64').length;
      const textBytes = Buffer.byteLength(promptText, 'utf8');

      // Validar tamaño total antes de procesar
      if (bytes + textBytes > 5 * 1024 * 1024) { // 5MB total limit
        res.status(413).json({ error: 'Image too large. Please compress or resize the image.' });
        return;
      }

      if (bytes + textBytes <= INLINE_TOTAL_LIMIT && bytes <= INLINE_FILE_THRESHOLD) {
        parts.push({ inlineData: { mimeType: mime, data: rawB64 } });
      } else {
        const ext = mimeToExt(mime);
        const tmpPath = await writeBase64ToTempFile(rawB64, ext);
        try {
          const uploaded = await ai.files.upload({ file: tmpPath, config: { mimeType: mime } });
          parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
        } finally {
          try { await fs.promises.unlink(tmpPath); } catch (e) { }
        }
      }
    } else if (image.filePath) {
      const stat = await fs.promises.stat(image.filePath);
      const textBytes = Buffer.byteLength(promptText, 'utf8');
      if (stat.size + textBytes <= INLINE_TOTAL_LIMIT && stat.size <= INLINE_FILE_THRESHOLD) {
        const buf = await fs.promises.readFile(image.filePath);
        parts.push({ inlineData: { mimeType: mime, data: buf.toString('base64') } });
      } else {
        const uploaded = await ai.files.upload({ file: image.filePath, config: { mimeType: mime } });
        parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
      }
    } else if (image.url) {
      const resp = await fetch(image.url);
      const arrayBuffer = await resp.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);
      const textBytes = Buffer.byteLength(promptText, 'utf8');
      if (buf.length + textBytes <= INLINE_TOTAL_LIMIT && buf.length <= INLINE_FILE_THRESHOLD) {
        parts.push({ inlineData: { mimeType: image.mimeType || resp.headers.get('content-type') || mime, data: buf.toString('base64') } });
      } else {
        const ext = mimeToExt(image.mimeType || resp.headers.get('content-type') || mime);
        const tmpPath = tempFilePath(ext);
        await fs.promises.writeFile(tmpPath, buf);
        try {
          const uploaded = await ai.files.upload({ file: tmpPath, config: { mimeType: image.mimeType || resp.headers.get('content-type') || mime } });
          parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
        } finally {
          try { await fs.promises.unlink(tmpPath); } catch (e) { }
        }
      }
    } else {
      res.status(400).json({ error: 'Unsupported image input' });
      return;
    }

    // Add prompt after image part
    parts.push({ text: promptText });

    const request = {
      model: body.model || 'gemini-2.5-flash',
      contents: createUserContent ? createUserContent(parts) : parts,
      config: body.config || {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            palettes: {
              type: 'array',
              items: { type: 'object', properties: { primary: { type: 'string' }, accent: { type: 'string' } }, required: ['primary', 'accent'] }
            }
          },
          required: ['palettes']
        }
      }
    };

    const result = await ai.models.generateContent(request);
    res.status(200).json({ text: result.text, raw: result });

  } catch (err) {
    console.error('Error in /api/palette:', err);
    res.status(500).json({ error: 'Error generating palettes', detail: String(err) });
  }
};
