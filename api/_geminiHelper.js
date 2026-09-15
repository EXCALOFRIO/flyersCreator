import { GoogleGenAI } from '@google/genai';

export const CANDIDATE_MODELS = [
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

/**
 * Collects all configured Gemini API keys from process.env ordered by index:
 * VITE_GEMINI_API_KEY / GEMINI_API_KEY (index 0)
 * VITE_GEMINI_API_KEY_1 / GEMINI_API_KEY_1 (index 1)
 * VITE_GEMINI_API_KEY_2 / GEMINI_API_KEY_2 (index 2)
 * ...
 */
export function getGeminiApiKeys() {
  const keyMap = new Map();

  // Scan all environment variables
  for (const [envVar, value] of Object.entries(process.env)) {
    if (!value || typeof value !== 'string' || !value.trim()) continue;

    // Matches VITE_GEMINI_API_KEY, GEMINI_API_KEY, VITE_GEMINI_API_KEY_1, GEMINI_API_KEY_1, etc.
    const match = envVar.match(/^(?:VITE_)?GEMINI_API_KEY(?:_(\d+))?$/);
    if (match) {
      const idx = match[1] !== undefined ? parseInt(match[1], 10) : 0;
      if (!keyMap.has(idx)) {
        keyMap.set(idx, []);
      }
      // Prefer VITE_ prefix over non-VITE if both exist for same index
      if (envVar.startsWith('VITE_')) {
        keyMap.get(idx).unshift(value.trim());
      } else {
        keyMap.get(idx).push(value.trim());
      }
    }
  }

  const sortedIndices = Array.from(keyMap.keys()).sort((a, b) => a - b);
  const keys = [];

  for (const idx of sortedIndices) {
    const list = keyMap.get(idx);
    for (const k of list) {
      if (!keys.includes(k)) {
        keys.push(k);
      }
    }
  }

  return keys;
}

/**
 * Prepares list of models to try, starting with requestedModel if provided, followed by candidates.
 */
export function getModelSequence(requestedModel) {
  const sequence = [];
  if (requestedModel && typeof requestedModel === 'string') {
    sequence.push(requestedModel);
  }
  for (const m of CANDIDATE_MODELS) {
    if (!sequence.includes(m)) {
      sequence.push(m);
    }
  }
  return sequence;
}

function isApiKeyError(err) {
  const str = String(err).toLowerCase();
  return (
    str.includes('api_key_invalid') ||
    str.includes('api key not valid') ||
    str.includes('invalid_argument') && str.includes('api key') ||
    str.includes('unauthorized') ||
    str.includes('forbidden')
  );
}

function isQuotaError(err) {
  const str = String(err).toLowerCase();
  return (
    str.includes('429') ||
    str.includes('resource_exhausted') ||
    str.includes('quota') ||
    str.includes('rate limit') ||
    str.includes('limit reached') ||
    str.includes('rpm') ||
    str.includes('rpd')
  );
}

/**
 * Attempts content generation iterating over available API keys and models.
 */
export async function generateContentWithFallback({ requestedModel, contents, config }) {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error('Server configuration error: No GEMINI_API_KEY configured in environment variables');
  }

  const models = getModelSequence(requestedModel);
  let lastError = null;

  for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
    const apiKey = keys[keyIdx];
    const ai = new GoogleGenAI({ apiKey });

    for (let modelIdx = 0; modelIdx < models.length; modelIdx++) {
      const model = models[modelIdx];
      try {
        const result = await ai.models.generateContent({
          model,
          contents,
          config,
        });
        return { result, modelUsed: model, keyIndexUsed: keyIdx, apiKey };
      } catch (err) {
        lastError = err;
        console.warn(`[GeminiHelper] Failed on key #${keyIdx} with model ${model}: ${err.message || String(err)}`);

        if (isApiKeyError(err) || isQuotaError(err)) {
          // If API key is invalid or out of quota, stop trying other models on this key and move to next key
          break;
        }
      }
    }
  }

  throw lastError || new Error('All Gemini API keys and models failed.');
}

/**
 * Helper to upload a file with key fallback.
 */
export async function uploadFileWithFallback({ filePath, mimeType }) {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error('Server configuration error: No GEMINI_API_KEY configured');
  }

  let lastError = null;
  for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
    const apiKey = keys[keyIdx];
    const ai = new GoogleGenAI({ apiKey });
    try {
      const uploaded = await ai.files.upload({
        file: filePath,
        config: { mimeType: mimeType || 'application/octet-stream' },
      });
      return { uploaded, apiKey, keyIndexUsed: keyIdx };
    } catch (err) {
      lastError = err;
      console.warn(`[GeminiHelper] Upload failed on key #${keyIdx}: ${err.message || String(err)}`);
      if (isApiKeyError(err) || isQuotaError(err)) {
        continue;
      }
    }
  }
  throw lastError || new Error('File upload failed on all API keys.');
}
