export default async function handler(req, res) {
  // Construir la URL destino: eliminar /api/polymarket del inicio
  const path = req.url.replace(/^\/api\/polymarket/, '');
  const url = `https://data-api.polymarket.com${path}`;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('content-type', contentType);

    const data = await response.arrayBuffer();
    res.status(response.status).send(Buffer.from(data));
  } catch (err) {
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}

