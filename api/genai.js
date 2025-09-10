import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';

// Limits
// Practical limits for serverless body + safety margin
const INLINE_TOTAL_LIMIT = 4 * 1024 * 1024; // ~4 MB inline data (Vercel body limit is strict)
const INLINE_FILE_THRESHOLD = 1.5 * 1024 * 1024; // inline per image threshold ~1.5MB

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

export default async function (req, res) {
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
    // Normalize contents: allow array or single object with parts
    const normalizeContentsToPartsArray = (contents) => {
      if (!contents) return [];
      // SDK accepts either array of Content or a single Content with parts
      if (Array.isArray(contents)) return contents;
      if (contents && typeof contents === 'object' && Array.isArray(contents.parts)) {
        return [contents];
      }
      return [];
    };

    if ((Array.isArray(body.contents) || (body.contents && body.contents.parts)) && !body.images) {
      // Quick heuristic: if any part looks like inlineData, ensure we don't exceed limit
      const normalized = normalizeContentsToPartsArray(body.contents);
      let inlineBytes = 0;
      const processed = [];
      const toCleanup = [];

      for (const content of normalized) {
        if (!Array.isArray(content.parts)) { processed.push(content); continue; }
        const newParts = [];
        for (const part of content.parts) {
          if (part && part.inlineData && part.inlineData.data) {
            const b64 = stripDataPrefix(part.inlineData.data);
            const bytes = Buffer.from(b64, 'base64').length;
            if (bytes > INLINE_FILE_THRESHOLD || inlineBytes + bytes > INLINE_TOTAL_LIMIT) {
              const ext = mimeToExt(part.inlineData.mimeType || '');
              const tmpPath = await writeBase64ToTempFile(b64, ext);
              toCleanup.push(tmpPath);
              const uploaded = await ai.files.upload({ file: tmpPath, config: { mimeType: part.inlineData.mimeType || 'application/octet-stream' } });
              newParts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
            } else {
              inlineBytes += bytes;
              newParts.push({ inlineData: { mimeType: part.inlineData.mimeType, data: b64 } });
            }
          } else if (typeof part === 'string') {
            inlineBytes += Buffer.byteLength(part, 'utf8');
            newParts.push(part);
          } else {
            newParts.push(part);
          }
        }
        processed.push({ parts: newParts });
      }
      if (inlineBytes > INLINE_TOTAL_LIMIT) {
        // Should be prevented above, but double guard
        res.status(413).json({ error: 'Payload too large after processing. Reduce prompt or image size.' });
        // cleanup
        for (const f of toCleanup) { try { await fs.promises.unlink(f); } catch {} }
        return;
      }
      const request = { model: body.model || 'gemini-2.5-flash', contents: processed, config: body.config };
      let result;
      try {
        result = await ai.models.generateContent(request);
      } finally {
        for (const f of toCleanup) { try { await fs.promises.unlink(f); } catch {} }
      }
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
    if (String(err).includes('413') || String(err).toLowerCase().includes('payload') || String(err).toLowerCase().includes('too large')) {
      res.status(413).json({ error: 'Payload too large. Image must be compressed or uploaded via Files API.', detail: String(err) });
    } else {
      res.status(500).json({ error: 'Error calling Gemini', detail: String(err) });
    }
  }
};
