const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { GoogleGenAI, createUserContent, createPartFromUri } = require('@google/genai');

// Limits
const INLINE_TOTAL_LIMIT = 20 * 1024 * 1024; // 20 MB total request size for inline data (text+images)
const INLINE_FILE_THRESHOLD = 15 * 1024 * 1024; // heuristic: files larger than this should be uploaded (raw bytes)

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

    // Support two ways the client can call this endpoint:
    // 1) Provide "contents" exactly as the SDK expects -> forwarded through (but we'll still validate sizes)
    // 2) Provide { model, prompt, images: [...] } where images is an array of { filePath, url, base64, mimeType }

    // If caller provided explicit contents, try to forward but guard large inline data
    if (Array.isArray(body.contents) && body.contents.length > 0 && !body.images) {
      // Quick heuristic: if any part looks like inlineData, ensure we don't exceed limit
      let inlineBytes = 0;
      for (const part of body.contents) {
        if (part && part.inlineData && part.inlineData.data) {
          const b64 = stripDataPrefix(part.inlineData.data);
          inlineBytes += Buffer.from(b64, 'base64').length;
        } else if (typeof part === 'string') {
          inlineBytes += Buffer.byteLength(part, 'utf8');
        }
      }
      if (inlineBytes > INLINE_TOTAL_LIMIT) {
        res.status(413).json({ error: 'Payload too large for inline images. Use Files API or reduce image sizes.' });
        return;
      }
      const result = await ai.models.generateContent(body);
      res.status(200).json({ text: result.text, raw: result });
      return;
    }

    // Otherwise, construct contents from prompt + images
    const model = body.model || 'gemini-2.5-flash';
    const prompt = body.prompt || body.text || '';
    const images = Array.isArray(body.images) ? body.images : (body.image ? [body.image] : []);

    // Build contents: image parts first, then prompt text
    const parts = [];
    let totalInlineBytes = 0;

    for (const img of images) {
      // img can be: { filePath }, { base64, mimeType }, { url, mimeType }
      if (!img) continue;

      if (img.base64) {
        const rawB64 = stripDataPrefix(img.base64);
        const bytes = Buffer.from(rawB64, 'base64').length;
        // Check if adding this will exceed inline total limit (count text too)
        const textBytes = Buffer.byteLength(prompt, 'utf8');
        if (totalInlineBytes + bytes + textBytes <= INLINE_TOTAL_LIMIT) {
          parts.push({ inlineData: { mimeType: img.mimeType || 'image/png', data: rawB64 } });
          totalInlineBytes += bytes;
          continue;
        }
        // Else fallthrough to upload via temp file
        const ext = mimeToExt(img.mimeType || '');
        const tmpPath = await writeBase64ToTempFile(rawB64, ext);
        try {
          const uploaded = await ai.files.upload({ file: tmpPath, config: { mimeType: img.mimeType || 'application/octet-stream' } });
          parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
        } finally {
          // best-effort cleanup
          try { await fs.promises.unlink(tmpPath); } catch (e) { /* ignore */ }
        }
        continue;
      }

      if (img.filePath) {
        // If file exists on server, use it directly or inline if small
        const stat = await fs.promises.stat(img.filePath);
        const textBytes = Buffer.byteLength(prompt, 'utf8');
        if (stat.size + totalInlineBytes + textBytes <= INLINE_TOTAL_LIMIT && stat.size <= INLINE_FILE_THRESHOLD) {
          // inline the file
          const buf = await fs.promises.readFile(img.filePath);
          const b64 = buf.toString('base64');
          parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: b64 } });
          totalInlineBytes += buf.length;
        } else {
          const uploaded = await ai.files.upload({ file: img.filePath, config: { mimeType: img.mimeType || 'application/octet-stream' } });
          parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
        }
        continue;
      }

      if (img.url) {
        // Try to fetch and inline if small, otherwise upload after writing temp file
        try {
          const resp = await fetch(img.url);
          const arrayBuffer = await resp.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          const textBytes = Buffer.byteLength(prompt, 'utf8');
          if (buf.length + totalInlineBytes + textBytes <= INLINE_TOTAL_LIMIT && buf.length <= INLINE_FILE_THRESHOLD) {
            parts.push({ inlineData: { mimeType: img.mimeType || resp.headers.get('content-type') || 'image/jpeg', data: buf.toString('base64') } });
            totalInlineBytes += buf.length;
          } else {
            const ext = mimeToExt(img.mimeType || resp.headers.get('content-type') || '');
            const tmpPath = tempFilePath(ext);
            await fs.promises.writeFile(tmpPath, buf);
            try {
              const uploaded = await ai.files.upload({ file: tmpPath, config: { mimeType: img.mimeType || resp.headers.get('content-type') || 'application/octet-stream' } });
              parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
            } finally {
              try { await fs.promises.unlink(tmpPath); } catch (e) { }
            }
          }
        } catch (err) {
          // if fetching fails, skip this image but don't abort entire request
          console.warn('Failed to fetch image url, skipping:', img.url, String(err));
        }
        continue;
      }
    }

    // Add prompt text after image parts
    if (prompt) parts.push(prompt);

    // If no images and no prompt provided, error
    if (parts.length === 0) {
      res.status(400).json({ error: 'No prompt or images provided' });
      return;
    }

    const finalContents = createUserContent ? createUserContent(parts) : parts;

    const request = { model, contents: finalContents };
    if (body.config) request.config = body.config;

    const result = await ai.models.generateContent(request);
    res.status(200).json({ text: result.text, raw: result });
  } catch (err) {
    console.error('Error calling Gemini on server:', err);
    // If error contains size info, forward it; otherwise generic
    res.status(500).json({ error: 'Error calling Gemini', detail: String(err) });
  }
};
