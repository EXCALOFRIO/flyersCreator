import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createUserContent, createPartFromUri } from '@google/genai';
import { generateContentWithFallback, uploadFileWithFallback, getGeminiApiKeys } from './_geminiHelper.js';

// Limits
const INLINE_TOTAL_LIMIT = 4 * 1024 * 1024; // ~4 MB inline data
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

  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY not set' });
    return;
  }

  try {
    const body = req.body || {};

    const normalizeContentsToPartsArray = (contents) => {
      if (!contents) return [];
      if (Array.isArray(contents)) return contents;
      if (contents && typeof contents === 'object' && Array.isArray(contents.parts)) {
        return [contents];
      }
      return [];
    };

    if ((Array.isArray(body.contents) || (body.contents && body.contents.parts)) && !body.images) {
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
              const { uploaded } = await uploadFileWithFallback({
                filePath: tmpPath,
                mimeType: part.inlineData.mimeType || 'application/octet-stream'
              });
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
        res.status(413).json({ error: 'Payload too large after processing. Reduce prompt or image size.' });
        for (const f of toCleanup) { try { await fs.promises.unlink(f); } catch {} }
        return;
      }

      let genResult;
      try {
        genResult = await generateContentWithFallback({
          requestedModel: body.model || 'gemini-flash-latest',
          contents: processed,
          config: body.config,
        });
      } finally {
        for (const f of toCleanup) { try { await fs.promises.unlink(f); } catch {} }
      }
      res.status(200).json({ text: genResult.result.text, raw: genResult.result, modelUsed: genResult.modelUsed });
      return;
    }

    // Otherwise, construct contents from prompt + images
    const requestedModel = body.model || 'gemini-flash-latest';
    const prompt = body.prompt || body.text || '';
    const images = Array.isArray(body.images) ? body.images : (body.image ? [body.image] : []);

    const parts = [];
    let totalInlineBytes = 0;

    for (const img of images) {
      if (!img) continue;

      if (img.base64) {
        const rawB64 = stripDataPrefix(img.base64);
        const bytes = Buffer.from(rawB64, 'base64').length;
        const textBytes = Buffer.byteLength(prompt, 'utf8');
        if (totalInlineBytes + bytes + textBytes <= INLINE_TOTAL_LIMIT) {
          parts.push({ inlineData: { mimeType: img.mimeType || 'image/png', data: rawB64 } });
          totalInlineBytes += bytes;
          continue;
        }
        const ext = mimeToExt(img.mimeType || '');
        const tmpPath = await writeBase64ToTempFile(rawB64, ext);
        try {
          const { uploaded } = await uploadFileWithFallback({
            filePath: tmpPath,
            mimeType: img.mimeType || 'application/octet-stream'
          });
          parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
        } finally {
          try { await fs.promises.unlink(tmpPath); } catch (e) { }
        }
        continue;
      }

      if (img.filePath) {
        const stat = await fs.promises.stat(img.filePath);
        const textBytes = Buffer.byteLength(prompt, 'utf8');
        if (stat.size + totalInlineBytes + textBytes <= INLINE_TOTAL_LIMIT && stat.size <= INLINE_FILE_THRESHOLD) {
          const buf = await fs.promises.readFile(img.filePath);
          const b64 = buf.toString('base64');
          parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: b64 } });
          totalInlineBytes += buf.length;
        } else {
          const { uploaded } = await uploadFileWithFallback({
            filePath: img.filePath,
            mimeType: img.mimeType || 'application/octet-stream'
          });
          parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
        }
        continue;
      }

      if (img.url) {
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
              const { uploaded } = await uploadFileWithFallback({
                filePath: tmpPath,
                mimeType: img.mimeType || resp.headers.get('content-type') || 'application/octet-stream'
              });
              parts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
            } finally {
              try { await fs.promises.unlink(tmpPath); } catch (e) { }
            }
          }
        } catch (err) {
          console.warn('Failed to fetch image url, skipping:', img.url, String(err));
        }
        continue;
      }
    }

    if (prompt) parts.push(prompt);

    if (parts.length === 0) {
      res.status(400).json({ error: 'No prompt or images provided' });
      return;
    }

    const finalContents = createUserContent ? createUserContent(parts) : parts;

    const genResult = await generateContentWithFallback({
      requestedModel,
      contents: finalContents,
      config: body.config,
    });

    res.status(200).json({ text: genResult.result.text, raw: genResult.result, modelUsed: genResult.modelUsed });
  } catch (err) {
    console.error('Error calling Gemini on server:', err);
    if (String(err).includes('413') || String(err).toLowerCase().includes('payload') || String(err).toLowerCase().includes('too large')) {
      res.status(413).json({ error: 'Payload too large. Image must be compressed or uploaded via Files API.', detail: String(err) });
    } else {
      res.status(500).json({ error: 'Error calling Gemini', detail: String(err) });
    }
  }
};
