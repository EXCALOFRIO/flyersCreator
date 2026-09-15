import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createPartFromUri } from '@google/genai';
import { generateContentWithFallback, uploadFileWithFallback, getGeminiApiKeys } from './_geminiHelper.js';

// Límites conservadores para Vercel
const PAYLOAD_LIMIT = 4 * 1024 * 1024; // 4MB total payload limit
const INLINE_THRESHOLD = 500 * 1024; // 500KB - usar Files API para imágenes más grandes

function stripDataPrefix(b64) {
  if (!b64) return b64;
  const idx = b64.indexOf('base64,');
  if (idx !== -1) return b64.slice(idx + 'base64,'.length);
  return b64;
}

function tempFilePath(ext = '') {
  const name = crypto.randomBytes(8).toString('hex');
  return path.join(os.tmpdir(), `gemini_${name}${ext}`);
}

async function writeBase64ToTempFile(base64Str, ext = '') {
  const filePath = tempFilePath(ext);
  const buf = Buffer.from(base64Str, 'base64');
  await fs.promises.writeFile(filePath, buf);
  return filePath;
}

function mimeToExt(mime) {
  if (!mime) return '';
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('heic')) return '.heic';
  return '';
}

export default async function (req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    return;
  }

  try {
    const body = req.body || {};

    const payloadSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
    console.log(`[proxy] Payload size: ${Math.round(payloadSize/1024)}KB`);

    if (payloadSize > PAYLOAD_LIMIT) {
      console.log('[proxy] Large payload detected, using Files API');
      
      const processedContents = [];
      const filesToCleanup = [];
      
      try {
        if (Array.isArray(body.contents)) {
          for (const content of body.contents) {
            if (Array.isArray(content.parts)) {
              const processedParts = [];
              for (const part of content.parts) {
                if (part.inlineData && part.inlineData.data) {
                  const rawB64 = stripDataPrefix(part.inlineData.data);
                  const imageSize = Buffer.from(rawB64, 'base64').length;
                  
                  if (imageSize > INLINE_THRESHOLD) {
                    const ext = mimeToExt(part.inlineData.mimeType || '');
                    const tmpPath = await writeBase64ToTempFile(rawB64, ext);
                    filesToCleanup.push(tmpPath);
                    
                    const { uploaded } = await uploadFileWithFallback({
                      filePath: tmpPath,
                      mimeType: part.inlineData.mimeType || 'image/jpeg'
                    });
                    
                    processedParts.push({
                      fileData: {
                        mimeType: uploaded.mimeType,
                        fileUri: uploaded.uri
                      }
                    });
                  } else {
                    processedParts.push(part);
                  }
                } else {
                  processedParts.push(part);
                }
              }
              processedContents.push({ parts: processedParts });
            } else {
              processedContents.push(content);
            }
          }
        } else {
          processedContents.push(...(body.contents || []));
        }

        const genResult = await generateContentWithFallback({
          requestedModel: body.model || 'gemini-flash-latest',
          contents: processedContents,
          config: body.config
        });

        res.status(200).json({ text: genResult.result.text, raw: genResult.result, modelUsed: genResult.modelUsed });

      } finally {
        for (const file of filesToCleanup) {
          try { await fs.promises.unlink(file); } catch (e) { console.warn('Failed to cleanup:', file); }
        }
      }
    } else {
      console.log('[proxy] Small payload, using inline data');
      const genResult = await generateContentWithFallback({
        requestedModel: body.model || 'gemini-flash-latest',
        contents: body.contents,
        config: body.config
      });

      res.status(200).json({ text: genResult.result.text, raw: genResult.result, modelUsed: genResult.modelUsed });
    }

  } catch (err) {
    console.error('Error in proxy:', err);
    
    if (err.message?.includes('413') || err.message?.includes('too large') || err.message?.includes('PAYLOAD')) {
      res.status(413).json({ 
        error: 'Payload too large even with Files API', 
        detail: 'Try using smaller images or fewer images per request' 
      });
    } else {
      res.status(500).json({ error: 'AI request failed', detail: String(err) });
    }
  }
};
