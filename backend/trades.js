export default async function handler(req, res) {
  const { user, limit, offset } = req.query;
  const url = `https://data-api.polymarket.com/trades?user=${user}&limit=${limit}&offset=${offset}&takerOnly=false`;
  const response = await fetch(url);
  const data = await response.json();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(data);
}