import { useState, useEffect } from "react";
import "./App.css";

const DEFAULT_WALLET = "0xe1c70472413b93FD6FFEDF45869c7AA0A909ACd5";

const CRYPTO_META = {
  bitcoin: { sym: "₿", col: { bg: "#f7931a22", border: "#f7931a", text: "#f7931a" } },
  btc:     { sym: "₿", col: { bg: "#f7931a22", border: "#f7931a", text: "#f7931a" } },
  ethereum:{ sym: "Ξ", col: { bg: "#627eea22", border: "#627eea", text: "#8899ff" } },
  eth:     { sym: "Ξ", col: { bg: "#627eea22", border: "#627eea", text: "#8899ff" } },
  solana:  { sym: "◎", col: { bg: "#9945ff22", border: "#9945ff", text: "#b06aff" } },
  sol:     { sym: "◎", col: { bg: "#9945ff22", border: "#9945ff", text: "#b06aff" } },
  xrp:     { sym: "✕", col: { bg: "#00aae422", border: "#00aae4", text: "#33bbee" } },
};
const FALLBACK = { sym: "◈", col: { bg: "#ffffff11", border: "#ffffff33", text: "#aaaaaa" } };

function getCrypto(title = "") {
  const t = title.toLowerCase();
  for (const [key, meta] of Object.entries(CRYPTO_META)) {
    if (t.includes(key)) return { key, ...meta };
  }
  return { key: "other", ...FALLBACK };
}

// En groupByMarket, propaga el icono de la trade al objeto de mercado
function groupByMarket(trades) {
  const map = {};
  for (const t of trades) {
    const id = t.conditionId;
    if (!map[id]) map[id] = { ...t, buyCost: 0, sellRevenue: 0, trades: [], lastTs: 0, icon: t.icon };
    const m = map[id];
    const val = t.size * t.price;
    if (t.side === "BUY") m.buyCost += val;
    else m.sellRevenue += val;
    m.trades.push(t);
    if (t.timestamp > m.lastTs) m.lastTs = t.timestamp;
    // Si el icono no está definido, lo actualiza
    if (!m.icon && t.icon) m.icon = t.icon;
  }
  return Object.values(map).map(m => {
    const pnl = m.sellRevenue - m.buyCost;
    const pct = m.buyCost > 0 ? (pnl / m.buyCost) * 100 : 0;
    return { ...m, pnl, pct };
  }).sort((a, b) => b.lastTs - a.lastTs);
}

function coinSummary(markets) {
  const acc = {};
  for (const m of markets) {
    const { key } = getCrypto(m.title);
    if (!acc[key]) acc[key] = { key, pnl: 0, cost: 0 };
    acc[key].pnl  += m.pnl;
    acc[key].cost += m.buyCost;
  }
  return Object.values(acc);
}

const fmt    = n => (n >= 0 ? "+" : "") + n.toFixed(3);
const fmtPct = n => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
const fmtDate = ts => new Date(ts * 1000).toLocaleDateString("es-ES", {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
});

export default function App() {
  const [inputWallet, setInputWallet] = useState(DEFAULT_WALLET);
  const [trades,  setTrades]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [filter,  setFilter]  = useState("all");
  // Fecha por defecto: hoy en formato yyyy-mm-dd
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const defaultDate = `${yyyy}-${mm}-${dd}`;
  const [filterDate, setFilterDate] = useState(defaultDate);

  async function load(addr) {
    setLoading(true); setError(null);
    try {
      const url = `/api/polymarket/trades?user=${addr}&limit=500&offset=0&takerOnly=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTrades(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(DEFAULT_WALLET); }, []);

  const markets  = groupByMarket(trades);
  // Filtrado por tipo y fecha
  const filtered = markets.filter(m => {
    if (filter === "win" && m.pnl <= 0) return false;
    if (filter === "loss" && m.pnl >= 0) return false;
    if (!["all", "win", "loss"].includes(filter) && getCrypto(m.title).key !== filter) return false;
    if (filterDate) {
      const marketDate = new Date(m.lastTs * 1000).toISOString().slice(0, 10);
      if (marketDate !== filterDate) return false;
    }
    return true;
  });
  // Los cuadros resumen usan los mercados filtrados
  const coins    = coinSummary(filtered);
  const totalPnl  = filtered.reduce((s, m) => s + m.pnl, 0);
  const totalCost = filtered.reduce((s, m) => s + m.buyCost, 0);
  const totalPct  = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const winMarkets  = filtered.filter(m => m.pnl > 0);
  const lossMarkets = filtered.filter(m => m.pnl < 0);
  const winners   = winMarkets.length;
  const losers    = lossMarkets.length;
  const total     = winners + losers;
  const winrate   = total > 0 ? (winners / total) * 100 : 0;
  const avgWin    = winners > 0 ? winMarkets.reduce((s, m) => s + m.pnl, 0) / winners : 0;
  const avgLoss   = losers  > 0 ? Math.abs(lossMarkets.reduce((s, m) => s + m.pnl, 0) / losers) : 0;
  const grossWin  = winMarkets.reduce((s, m) => s + m.pnl, 0);
  const grossLoss = Math.abs(lossMarkets.reduce((s, m) => s + m.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  // Calcular balance total de la wallet (suma de todos los SELL menos los BUY)
  const walletBalance = trades.reduce((acc, t) => acc + (t.side === "BUY" ? -t.size * t.price : t.size * t.price), 0);

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dot" />
            <span className="header-label">Trade Tracker</span>
          </div>
        </div>
        <div className="search-row">
          <input
            className="wallet-input"
            value={inputWallet}
            onChange={e => setInputWallet(e.target.value)}
            placeholder="0x..."
            onKeyDown={e => e.key === "Enter" && load(inputWallet)}
          />
          <button className="btn-load" onClick={() => load(inputWallet)}>Cargar</button>
        </div>
      </header>

      {/* ── States ── */}
      {loading && <div className="state">⟳ Cargando trades…</div>}
      {error   && <div className="state error">⚠ {error}</div>}

      {!loading && !error && trades.length > 0 && (
        <main className="main">
          {/* Summary cards */}
          <div className="cards">
            {[
              { label: "P&L Total",  val: fmt(totalPnl) + " $",       col: totalPnl >= 0 ? "#4ade80" : "#f87171" },
              { label: "Retorno",    val: fmtPct(totalPct),            col: totalPct >= 0 ? "#4ade80" : "#f87171" },
              { label: "Mercados",   val: markets.length,              col: "#94a3b8" },
              { label: "Ganadoras",     val: `${winners}`,                                         col: "#4ade80" },
              { label: "Perdedoras",    val: `${losers}`,                                          col: "#f87171" },
              { label: "Winrate",       val: `${winrate.toFixed(1)}%`,                             col: winrate >= 50 ? "#4ade80" : "#f87171" },
              { label: "Profit Factor", val: isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞", col: profitFactor >= 1 ? "#4ade80" : "#f87171" },
              { label: "Avg Win / Loss", val: `${avgWin.toFixed(2)}$ / ${avgLoss.toFixed(2)}$`,   col: avgWin >= avgLoss ? "#4ade80" : "#fbbf24" },
              { label: "Invertido",  val: totalCost.toFixed(1) + " $", col: "#94a3b8" },
              { label: "Balance wallet", val: walletBalance.toFixed(2) + " $", col: "#fbbf24" },
            ].map(c => (
              <div key={c.label} className="card">
                <span className="card-label">{c.label}</span>
                <span className="card-val" style={{ color: c.col }}>{c.val}</span>
              </div>
            ))}
          </div>

          {/* Filter pills */}
          <div className="pills">
            {["all", "win", "loss"].map(f => (
              <button key={f} className={`pill ${filter === f ? "pill-active" : ""}`} onClick={() => setFilter(f)}>
                {f === "all" ? "Todos" : f === "win" ? "✓ Ganadoras" : "✗ Perdedoras"}
              </button>
            ))}
            {coins.map(c => {
              const { sym, col } = getCrypto(c.key);
              const active = filter === c.key;
              return (
                <button key={c.key}
                  className="pill pill-coin"
                  style={{
                    background: active ? col.border + "44" : "",
                    borderColor: active ? col.border : "",
                    color: active ? col.text : "",
                  }}
                  onClick={() => setFilter(active ? "all" : c.key)}>
                  <span style={{ color: col.text }}>{sym}</span>
                  <span style={{ textTransform: "uppercase" }}>{c.key}</span>
                  <span style={{ color: c.pnl >= 0 ? "#4ade80" : "#f87171" }}>{fmt(c.pnl)}$</span>
                </button>
              );
            })}
          </div>
          {/* Input de fecha para filtrar mercados */}
          <div style={{ margin: "12px 0 0 0", display: "flex", alignItems: "center" }}>
            <label htmlFor="filter-date" style={{ marginRight: 8, fontSize: 13, color: "#64748b" }}>Fecha mercado:</label>
            <input
              id="filter-date"
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              style={{ fontSize: 13, padding: "2px 8px" }}
              max={defaultDate}
            />
            {filterDate && filterDate !== defaultDate && (
              <button onClick={() => setFilterDate(defaultDate)} style={{ marginLeft: 8, fontSize: 13 }}>✕</button>
            )}
          </div>

          {/* Market list */}
                              {/* Filtros activos visuales */}
                              {(filter !== "all" || (filterDate && filterDate !== defaultDate)) && (
                                <div style={{ margin: "10px 0 10px 0", display: "flex", gap: 10, flexWrap: "wrap" }}>
                                  {filter !== "all" && (
                                    <span style={{ background: "#1e2535", color: "#60a5fa", borderRadius: 4, padding: "2px 8px", fontSize: 12 }}>
                                      Filtro: {filter}
                                    </span>
                                  )}
                                  {filterDate && filterDate !== defaultDate && (
                                    <span style={{ background: "#1e2535", color: "#fbbf24", borderRadius: 4, padding: "2px 8px", fontSize: 12 }}>
                                      Fecha: {filterDate}
                                    </span>
                                  )}
                                </div>
                              )}
          <div className="market-list">
            {filtered.map(m => {
              const { sym, col } = getCrypto(m.title);
              const win = m.pnl >= 0;
              // Calcular precio de entrada promedio
              // Tomar el price del primer BUY del mercado
              const firstBuy = m.trades.find(t => t.side === "BUY");
              const entryPrice = firstBuy ? firstBuy.price : 0;
              return (
                <div key={m.conditionId} className="market-row"
                  onMouseEnter={e => e.currentTarget.style.borderColor = col.border}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2535"}>
                  <div className="coin-icon" style={{ background: col.bg, borderColor: col.border, color: col.text }}>
                    {m.icon ? (
                      <img src={m.icon} alt="icono" style={{ width: 22, height: 22, objectFit: "contain" }} />
                    ) : (
                      sym
                    )}
                  </div>
                  <div className="market-info">
                    <div className="market-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{m.title}</span>
                      {firstBuy && firstBuy.outcome && (
                        <span style={{
                          fontSize: 12,
                          fontWeight: 700,
                          borderRadius: 4,
                          padding: "1px 8px",
                          background: firstBuy.outcome.toLowerCase() === "up" ? "#14532d88" : "#7f1d1d88",
                          color: firstBuy.outcome.toLowerCase() === "up" ? "#4ade80" : "#f87171",
                          border: "1px solid",
                          borderColor: firstBuy.outcome.toLowerCase() === "up" ? "#22c55e66" : "#ef444466",
                          letterSpacing: 1,
                        }}>
                          {firstBuy.outcome.toLowerCase() === "up" ? "↑ UP" : "↓ DOWN"}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, background: "#1e2535", borderRadius: 4, padding: "1px 6px" }}>
                        {firstBuy ? firstBuy.price.toFixed(3) : "-"} $
                      </span>
                      <span style={{ fontSize: 12, color: "#64748b", marginLeft: 10 }}>
                        {fmtDate(m.lastTs)} · {m.trades.length} trades · {m.buyCost.toFixed(2)}$
                      </span>
                    </div>
                    {/* Información movida a la línea del título */}
                  </div>
                  <div className="market-pnl" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

                      <span className="pnl-val" style={{ color: win ? "#4ade80" : "#f87171", marginRight: 10 }}>{fmt(m.pnl)} $</span>
                      <span className="pnl-badge" style={{
                        background:   win ? "#14532d44" : "#7f1d1d44",
                        borderColor:  win ? "#22c55e44" : "#ef444444",
                        color:        win ? "#4ade80"   : "#f87171",
                        fontSize: 13,
                        marginTop: 0,
                        fontWeight: 600
                      }}>{fmtPct(m.pct)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="state">Sin mercados para este filtro</div>}
          </div>
        </main>
      )}

      {!loading && !error && trades.length === 0 && (
        <div className="state">Introduce una wallet y pulsa Cargar</div>
      )}
    </div>
  );
}
