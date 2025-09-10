const { GoogleGenAI } = require('@google/genai');

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
    const body = req.body;
    // body should contain model, contents, config
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent(body);

    // Return the raw response object from the SDK (it includes .text)
    res.status(200).json({ text: result.text, raw: result });
  } catch (err) {
    console.error('Error calling Gemini on server:', err);
    res.status(500).json({ error: 'Error calling Gemini', detail: String(err) });
  }
};
