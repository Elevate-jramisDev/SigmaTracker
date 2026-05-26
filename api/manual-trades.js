import { Redis } from "@upstash/redis";

// Inicializa el cliente Redis usando las env vars que Vercel inyecta
// automáticamente al conectar la integración de Upstash.
function getRedis() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function walletKey(wallet) {
  return `sigmatracker:manual_trades:${wallet.toLowerCase()}`;
}

export default async function handler(req, res) {
  // CORS básico
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const redis = getRedis();
  if (!redis) {
    return res.status(503).json({
      error: "KV_NOT_CONFIGURED",
      message:
        "Upstash Redis no está configurado. Por favor conecta la integración en el dashboard de Vercel.",
    });
  }

  const wallet = (req.query.wallet || "").trim().toLowerCase();
  if (!wallet) return res.status(400).json({ error: "Falta el parámetro wallet" });

  const key = walletKey(wallet);

  // ── GET: devuelve los trades guardados ──────────────────────────────────────
  if (req.method === "GET") {
    const trades = (await redis.get(key)) || [];
    return res.status(200).json(Array.isArray(trades) ? trades : []);
  }

  // ── POST: guarda (reemplaza) los trades ────────────────────────────────────
  if (req.method === "POST") {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const trades = body?.trades;
    if (!Array.isArray(trades))
      return res.status(400).json({ error: '"trades" debe ser un array' });

    await redis.set(key, trades);
    return res.status(200).json({ ok: true, saved: trades.length });
  }

  // ── DELETE: borra todos los trades de la wallet ────────────────────────────
  if (req.method === "DELETE") {
    await redis.del(key);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Método no permitido" });
}

