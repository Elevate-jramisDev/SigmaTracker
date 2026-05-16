export default async function handler(req, res) {
  const url = `https://data-api.polymarket.com${req.url.replace(/^\/api\/polymarket/, '')}`;
  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        ...req.headers,
        host: undefined // Elimina el header host para evitar problemas
      },
      body: req.method === 'GET' ? undefined : req.body
    });
    const contentType = response.headers.get('content-type');
    res.setHeader('content-type', contentType);
    const data = await response.arrayBuffer();
    res.status(response.status).send(Buffer.from(data));
  } catch (err) {
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}

