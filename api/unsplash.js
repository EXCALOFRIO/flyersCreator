export default async function (req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.UNSPLASH_API_KEY || process.env.VITE_UNSPLASH_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server configuration error: UNSPLASH_API_KEY not set' });
    return;
  }

  try {
    const { query, orientation = 'portrait' } = req.body;
    
    if (!query) {
      res.status(400).json({ error: 'Query parameter is required' });
      return;
    }

    const unsplashUrl = `https://api.unsplash.com/photos/random?client_id=${apiKey}&query=${encodeURIComponent(query)}&orientation=${orientation}`;

    const response = await fetch(unsplashUrl);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error fetching from Unsplash: ${response.statusText} - ${errorData.errors ? errorData.errors.join(', ') : 'Unknown error'}`);
    }

    const data = await response.json();
    
    // Return only the necessary data to the client
    res.status(200).json({
      imageUrl: data.urls.regular,
      downloadUrl: data.links.download,
      photographer: data.user.name,
      photographerUrl: data.user.links.html
    });

  } catch (err) {
    console.error('Error calling Unsplash API on server:', err);
    res.status(500).json({ error: 'Error calling Unsplash API', detail: String(err) });
  }
};
