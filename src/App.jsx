import { useState, useEffect, useMemo } from "react";
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

function groupByMarket(trades) {
  const map = {};
  for (const t of trades) {
    const id = (t.conditionId || "").toLowerCase();
    if (!map[id]) map[id] = {
      ...t,
      conditionId: id,
      buyCost: 0, sellRevenue: 0,
      totalFees: 0,
      totalBuySize: 0, totalSellSize: 0,
      numBuys: 0, numSells: 0,
      trades: [], lastTs: 0, firstTs: Infinity, icon: t.icon,
    };
    const m = map[id];
    const val = t.size * t.price;
    const fee = val * ((t.feeRateBps || 0) / 10000);
    m.totalFees += fee;
    if (t.side === "BUY") {
      m.buyCost += val;
      m.totalBuySize += t.size;
      m.numBuys++;
    } else {
      m.sellRevenue += val;
      m.totalSellSize += t.size;
      m.numSells++;
    }
    m.trades.push(t);
    if (t.timestamp > m.lastTs) m.lastTs = t.timestamp;
    if (t.timestamp < m.firstTs) m.firstTs = t.timestamp;
    if (!m.icon && t.icon) m.icon = t.icon;
  }
  return Object.values(map).map(m => {
    const grossPnl     = m.sellRevenue - m.buyCost;
    const pnl          = grossPnl - m.totalFees;
    const pct          = m.buyCost > 0 ? (pnl / m.buyCost) * 100 : 0;
    const feeImpact    = grossPnl > 0 ? (m.totalFees / grossPnl) * 100 : 0;
    const avgEntryPrice = m.totalBuySize  > 0 ? m.buyCost      / m.totalBuySize  : 0;
    const avgExitPrice  = m.totalSellSize > 0 ? m.sellRevenue  / m.totalSellSize : 0;
    const totalTrades  = m.numBuys + m.numSells;
    const avgTradeSize = totalTrades > 0 ? (m.totalBuySize + m.totalSellSize) / totalTrades : 0;
    const duration     = (m.firstTs < Infinity && m.lastTs > m.firstTs) ? m.lastTs - m.firstTs : 0;
    return { ...m, grossPnl, pnl, pct, feeImpact, avgEntryPrice, avgExitPrice, avgTradeSize, duration };
  }).sort((a, b) => b.lastTs - a.lastTs);
}

function coinSummary(markets) {
  const acc = {};
  for (const m of markets) {
    const { key } = getCrypto(m.title);
    if (!acc[key]) acc[key] = { key, pnl: 0, grossPnl: 0, fees: 0, cost: 0, wins: 0, total: 0 };
    acc[key].pnl      += m.pnl;
    acc[key].grossPnl += m.grossPnl;
    acc[key].fees     += m.totalFees;
    acc[key].cost     += m.buyCost;
    acc[key].total++;
    if (m.pnl > 0) acc[key].wins++;
  }
  return Object.values(acc);
}

const fmt      = n => (n >= 0 ? "+" : "") + n.toFixed(3);
const fmtPct   = n => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
const fmtDate  = ts => new Date(ts * 1000).toLocaleDateString("es-ES", {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});
const fmtDuration = secs => {
  if (!secs || secs <= 0) return "< 1m";
  if (secs < 60)    return `${secs}s`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
};

const MANUAL_TRADES_KEY = "sigmatracker_manual_trades";

function loadManualFromStorage(wallet) {
  try {
    const key = wallet ? `${MANUAL_TRADES_KEY}:${wallet.toLowerCase()}` : MANUAL_TRADES_KEY;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveManualToStorage(wallet, trades) {
  try {
    const key = wallet ? `${MANUAL_TRADES_KEY}:${wallet.toLowerCase()}` : MANUAL_TRADES_KEY;
    localStorage.setItem(key, JSON.stringify(trades));
  } catch { /* ignore */ }
}

async function fetchManualFromServer(wallet) {
  try {
    const res = await fetch(`/api/manual-trades?wallet=${encodeURIComponent(wallet)}`);
    if (!res.ok) return null; // servidor no disponible o no configurado
    return await res.json();
  } catch { return null; }
}

async function saveManualToServer(wallet, trades) {
  try {
    await fetch("/api/manual-trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, trades }),
    });
  } catch { /* offline fallback */ }
}

async function deleteManualFromServer(wallet) {
  try {
    await fetch(`/api/manual-trades?wallet=${encodeURIComponent(wallet)}`, { method: "DELETE" });
  } catch { /* offline fallback */ }
}

export default function App() {
  const [inputWallet, setInputWallet] = useState(DEFAULT_WALLET);
  const [loadedWallet, setLoadedWallet] = useState("");
  const [trades,   setTrades]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [filter,     setFilter]     = useState("all");
  const [expanded,   setExpanded]   = useState({});
  const [tokensOpen,   setTokensOpen]   = useState(false);
  const [summaryOpen,  setSummaryOpen]  = useState(false);
  const [timeFilter, setTimeFilter] = useState("all");

  // ── Trades manuales ──
  const [manualTrades,      setManualTrades]      = useState([]);
  const [manualOpen,        setManualOpen]        = useState(false);
  const [manualJson,        setManualJson]        = useState("");
  const [manualError,       setManualError]       = useState(null);
  const [manualSuccess,     setManualSuccess]     = useState(false);
  const [pickedConditionId, setPickedConditionId] = useState("");
  const [marketSearch,      setMarketSearch]      = useState("");

  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const [filterDate, setFilterDate] = useState(defaultDate);

  const TIME_OPTIONS = [
    { key: "1h",  label: "1h",   secs: 3600 },
    { key: "4h",  label: "4h",   secs: 4 * 3600 },
    { key: "6h",  label: "6h",   secs: 6 * 3600 },
    { key: "12h", label: "12h",  secs: 12 * 3600 },
    { key: "24h", label: "24h",  secs: 24 * 3600 },
    { key: "7d",  label: "7d",   secs: 7 * 86400 },
    { key: "30d", label: "30d",  secs: 30 * 86400 },
  ];

  function selectTimeFilter(key) {
    setTimeFilter(key);
    if (key !== "all") setFilterDate(""); // limpiar fecha exacta
  }
  function selectDate(val) {
    setFilterDate(val);
    if (val) setTimeFilter("all"); // limpiar ventana temporal
  }

  const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // Persistir trades manuales: servidor (Upstash) + localStorage como fallback
  useEffect(() => {
    if (!loadedWallet) return;
    saveManualToStorage(loadedWallet, manualTrades);
    saveManualToServer(loadedWallet, manualTrades);
  }, [manualTrades, loadedWallet]);

  // ── Helpers trades manuales ──
  function saveManualTrades(list) {
    setManualTrades(list);
  }

  function applyManualJson() {
    setManualError(null);
    setManualSuccess(false);
    try {
      const parsed = JSON.parse(manualJson);
      if (!Array.isArray(parsed)) throw new Error("El JSON debe ser un array de trades.");
      const required = ["side", "price", "size", "timestamp"];
      for (const [i, t] of parsed.entries()) {
        for (const field of required) {
          if (t[field] === undefined) throw new Error(`Trade #${i+1}: falta el campo "${field}".`);
        }
        if (!pickedConditionId && !t.conditionId)
          throw new Error(`Trade #${i+1}: falta "conditionId" (o selecciona un mercado arriba).`);
        if (!["BUY","SELL"].includes(t.side)) throw new Error(`Trade #${i+1}: "side" debe ser "BUY" o "SELL".`);
      }
      // Si hay mercado seleccionado en el picker, usarlo como conditionId para todos los trades
      const targetId = pickedConditionId || null;
      const pickedMeta = targetId ? apiMarkets.find(m => m.conditionId === targetId) : null;
      const tagged = parsed.map(t => ({
        ...t,
        conditionId: targetId || (t.conditionId || "").toLowerCase(),
        title: t.title || pickedMeta?.title || t.conditionId,
        icon:  t.icon  || pickedMeta?.icon  || null,
        _manual: true,
      }));
      saveManualTrades([...manualTrades, ...tagged]);
      setManualJson("");
      setPickedConditionId("");
      setMarketSearch("");
      setManualSuccess(true);
      setTimeout(() => setManualSuccess(false), 3000);
    } catch (e) {
      setManualError(e.message);
    }
  }

  function clearManualTrades() {
    saveManualTrades([]);
    setManualJson("");
    setManualError(null);
    if (loadedWallet) deleteManualFromServer(loadedWallet);
  }

  // Mercados únicos de la API (para el selector)
  const apiMarkets = useMemo(() => {
    const seen = {};
    for (const t of trades) {
      const id = (t.conditionId || "").toLowerCase();
      if (!seen[id]) seen[id] = { conditionId: id, title: t.title || id.slice(0, 20) + "…", icon: t.icon };
    }
    return Object.values(seen);
  }, [trades]);

  // Trades fusionados (API + manuales)
  const allTrades = useMemo(() => [...trades, ...manualTrades], [trades, manualTrades]);

  async function load(addr) {
    setLoading(true); setError(null);
    try {
      const url = `/api/polymarket/trades?user=${addr}&limit=500&offset=0&takerOnly=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTrades(await res.json());
      setLoadedWallet(addr);

      // Cargar trades manuales: intentar servidor primero, si no hay → localStorage
      const serverTrades = await fetchManualFromServer(addr);
      if (serverTrades && Array.isArray(serverTrades)) {
        setManualTrades(serverTrades);
        // Sincronizar localStorage también
        saveManualToStorage(addr, serverTrades);
      } else {
        // Fallback a localStorage (offline / Redis no configurado)
        setManualTrades(loadManualFromStorage(addr));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(DEFAULT_WALLET); }, []);

  const markets  = useMemo(() => groupByMarket(allTrades), [allTrades]);
  // nowSecs en useMemo para no llamar Date.now() impure durante cada render
  const nowSecs  = useMemo(() => Math.floor(Date.now() / 1000), [timeFilter]);
  const filtered = markets.filter(m => {
    if (filter === "win"  && m.pnl <= 0) return false;
    if (filter === "loss" && m.pnl >= 0) return false;
    if (!["all","win","loss"].includes(filter) && getCrypto(m.title).key !== filter) return false;
    // Filtro ventana temporal (tiene prioridad sobre fecha exacta)
    if (timeFilter !== "all") {
      const opt = TIME_OPTIONS.find(o => o.key === timeFilter);
      if (opt && m.lastTs < nowSecs - opt.secs) return false;
    } else if (filterDate) {
      const marketDate = new Date(m.lastTs * 1000).toISOString().slice(0, 10);
      if (marketDate !== filterDate) return false;
    }
    return true;
  });

  const coins          = coinSummary(filtered);
  const totalPnl       = filtered.reduce((s, m) => s + m.pnl,      0);
  const totalGrossPnl  = filtered.reduce((s, m) => s + m.grossPnl, 0);
  const totalFees      = filtered.reduce((s, m) => s + m.totalFees,0);
  const totalCost      = filtered.reduce((s, m) => s + m.buyCost,  0);
  const totalPct       = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const globalFeeImpact = totalGrossPnl > 0 ? (totalFees / totalGrossPnl) * 100 : 0;

  const winMarkets   = filtered.filter(m => m.pnl > 0);
  const lossMarkets  = filtered.filter(m => m.pnl < 0);
  const winners      = winMarkets.length;
  const losers       = lossMarkets.length;
  const total        = winners + losers;
  const winrate      = total > 0 ? (winners / total) * 100 : 0;
  const avgWin       = winners > 0 ? winMarkets.reduce((s,m) => s+m.pnl, 0) / winners : 0;
  const avgLoss      = losers  > 0 ? Math.abs(lossMarkets.reduce((s,m) => s+m.pnl, 0) / losers) : 0;
  const grossWin     = winMarkets.reduce((s,m) => s+m.pnl, 0);
  const grossLoss    = Math.abs(lossMarkets.reduce((s,m) => s+m.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const bestMarket   = filtered.reduce((b, m) => m.pnl > (b?.pnl ?? -Infinity) ? m : b, null);
  const worstMarket  = filtered.reduce((w, m) => m.pnl < (w?.pnl ??  Infinity) ? m : w, null);
  const maxWin       = bestMarket  ? bestMarket.pnl  : 0;
  const maxLoss      = worstMarket ? worstMarket.pnl : 0;

  // Racha actual
  const streakMkts = [...filtered].filter(m => m.pnl !== 0).sort((a,b) => b.lastTs - a.lastTs);
  let streak = 0, streakType = null;
  for (const m of streakMkts) {
    const type = m.pnl > 0 ? "win" : "loss";
    if (!streakType) { streakType = type; streak = 1; }
    else if (type === streakType) streak++;
    else break;
  }
  const streakLabel = streakType === "win"
    ? `🔥 ${streak} ganadas`
    : streakType === "loss"
    ? `❄️ ${streak} pérdidas`
    : "-";

  const walletBalance = allTrades.reduce((acc, t) =>
    acc + (t.side === "BUY" ? -t.size * t.price : t.size * t.price), 0);

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-top" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span className="dot" />
            <span className="header-label">Trade Tracker</span>
          </div>
        </div>
        <div className="search-row">
          <input className="wallet-input" value={inputWallet}
            onChange={e => setInputWallet(e.target.value)}
            placeholder="0x..."
            onKeyDown={e => e.key === "Enter" && load(inputWallet)} />
          <button className="btn-load" onClick={() => load(inputWallet)}>Cargar</button>
          <button
            onClick={() => setManualOpen(o => !o)}
            title="Añadir trades manualmente"
            style={{
              background: manualTrades.length > 0 ? "#7c3aed33" : "#1a1f2e",
              border: `1px solid ${manualTrades.length > 0 ? "#7c3aed" : "#1e2535"}`,
              borderRadius: 8, padding: "6px 13px",
              color: manualTrades.length > 0 ? "#a78bfa" : "#64748b",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all .15s",
            }}>
            ✏ Manuales
            {manualTrades.length > 0 && (
              <span style={{
                background: "#7c3aed", color: "#fff", borderRadius: 10,
                fontSize: 10, fontWeight: 700, padding: "1px 6px",
              }}>{manualTrades.length}</span>
            )}
          </button>
        </div>

        {/* ── Panel trades manuales ── */}
        {manualOpen && (
          <div style={{
            background: "#1a1f2e", border: "1px solid #7c3aed44",
            borderRadius: 10, padding: "14px 16px", marginTop: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>✏ Trades manuales</span>
              {manualTrades.length > 0 && (
                <button onClick={clearManualTrades} style={{
                  background: "none", border: "1px solid #f8717166",
                  borderRadius: 6, padding: "3px 10px",
                  color: "#f87171", fontSize: 11, cursor: "pointer",
                }}>🗑 Limpiar todos</button>
              )}
            </div>

            {/* ── Lista de trades manuales guardados ── */}
            {manualTrades.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                  Trades guardados ({manualTrades.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {manualTrades.map((t, i) => {
                    const tid = (t.conditionId || "").toLowerCase();
                    const matched = trades.some(a => (a.conditionId || "").toLowerCase() === tid);
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: "#0d0f14", border: `1px solid ${matched ? "#22c55e33" : "#f8717133"}`,
                        borderRadius: 6, padding: "6px 10px", fontSize: 11,
                      }}>
                        <span style={{ color: t.side === "BUY" ? "#4ade80" : "#f87171", fontWeight: 700, minWidth: 32 }}>
                          {t.side}
                        </span>
                        <span style={{ color: "#94a3b8", minWidth: 48, fontVariantNumeric: "tabular-nums" }}>
                          {t.price?.toFixed(4)} $
                        </span>
                        <span style={{ color: "#64748b", minWidth: 48 }}>×{t.size}</span>
                        <span style={{ color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.title || (t.conditionId?.slice(0, 12) + "…")}
                        </span>
                        <span title={t.conditionId} style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 5px",
                          background: matched ? "#14532d44" : "#7f1d1d44",
                          color: matched ? "#4ade80" : "#f87171",
                          border: `1px solid ${matched ? "#22c55e44" : "#ef444444"}`,
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          {matched ? "✓ mergeado" : "✗ sin match"}
                        </span>
                        <button
                          onClick={() => saveManualTrades(manualTrades.filter((_, j) => j !== i))}
                          title="Eliminar este trade"
                          style={{
                            background: "none", border: "1px solid #f8717144",
                            borderRadius: 4, padding: "1px 6px",
                            color: "#f87171", fontSize: 11, cursor: "pointer",
                            flexShrink: 0,
                          }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Selector de mercado ── */}
            {trades.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>
                  Adjuntar a mercado existente <span style={{ color: "#7c3aed", fontStyle: "normal" }}>(recomendado)</span>
                </div>
                {pickedConditionId ? (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "#14532d33", border: "1px solid #22c55e44",
                    borderRadius: 6, padding: "6px 10px",
                  }}>
                    <span style={{ fontSize: 11, color: "#4ade80", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      ✓ {apiMarkets.find(m => m.conditionId === pickedConditionId)?.title || pickedConditionId}
                    </span>
                    <button onClick={() => { setPickedConditionId(""); setMarketSearch(""); }} style={{
                      background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer",
                    }}>✕</button>
                  </div>
                ) : (
                  <div>
                    <input
                      value={marketSearch}
                      onChange={e => setMarketSearch(e.target.value)}
                      placeholder="Buscar mercado por nombre…"
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: "#0d0f14", border: "1px solid #1e2535",
                        borderRadius: 6, padding: "5px 9px",
                        color: "#e2e8f0", fontSize: 11, outline: "none",
                        marginBottom: 4,
                      }}
                    />
                    {marketSearch.trim().length > 0 && (
                      <div style={{
                        background: "#0d0f14", border: "1px solid #1e2535",
                        borderRadius: 6, maxHeight: 160, overflowY: "auto",
                      }}>
                        {apiMarkets
                          .filter(m => m.title.toLowerCase().includes(marketSearch.toLowerCase()))
                          .slice(0, 12)
                          .map(m => (
                            <div key={m.conditionId}
                              onClick={() => { setPickedConditionId(m.conditionId); setMarketSearch(""); }}
                              style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "6px 10px", fontSize: 11, cursor: "pointer",
                                borderBottom: "1px solid #1e253540",
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = "#1a1f2e"}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                            >
                              {m.icon && <img src={m.icon} style={{ width: 16, height: 16, borderRadius: 3, objectFit: "contain" }} alt="" />}
                              <span style={{ color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>
                              <span style={{ color: "#334155", fontSize: 10, fontFamily: "monospace" }}>{m.conditionId.slice(0, 8)}…</span>
                            </div>
                          ))}
                        {apiMarkets.filter(m => m.title.toLowerCase().includes(marketSearch.toLowerCase())).length === 0 && (
                          <div style={{ padding: "8px 10px", fontSize: 11, color: "#475569" }}>Sin resultados</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Añadir nuevos ── */}
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
              Pega un array JSON con los trades a añadir. Se fusionarán con los de la API.
              Campos obligatorios: <code style={{ color: "#a78bfa" }}>conditionId</code>, <code style={{ color: "#a78bfa" }}>side</code> (BUY/SELL),{" "}
              <code style={{ color: "#a78bfa" }}>price</code>, <code style={{ color: "#a78bfa" }}>size</code>, <code style={{ color: "#a78bfa" }}>timestamp</code>.
              Opcionales: <code style={{ color: "#94a3b8" }}>title</code>, <code style={{ color: "#94a3b8" }}>outcome</code>, <code style={{ color: "#94a3b8" }}>feeRateBps</code>, <code style={{ color: "#94a3b8" }}>icon</code>.
            </div>
            <details style={{ marginBottom: 8 }}>
              <summary style={{ fontSize: 11, color: "#475569", cursor: "pointer", userSelect: "none" }}>Ver ejemplo JSON</summary>
              <pre style={{
                background: "#0d0f14", border: "1px solid #1e2535", borderRadius: 6,
                padding: "8px 10px", fontSize: 10, color: "#94a3b8",
                overflowX: "auto", marginTop: 6,
              }}>{`[
  {
    "conditionId": "0xabc123...",
    "title": "Will BTC exceed $100k?",
    "outcome": "Up",
    "side": "BUY",
    "price": 0.45,
    "size": 20,
    "timestamp": 1748000000,
    "feeRateBps": 20
  }
]`}</pre>
            </details>
            <textarea
              value={manualJson}
              onChange={e => { setManualJson(e.target.value); setManualError(null); setManualSuccess(false); }}
              placeholder='[{ "conditionId": "...", "side": "BUY", "price": 0.5, "size": 10, "timestamp": 1748000000 }]'
              rows={4}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0d0f14", border: `1px solid ${manualError ? "#f87171" : "#1e2535"}`,
                borderRadius: 6, padding: "8px 10px",
                color: "#e2e8f0", fontSize: 11, fontFamily: "monospace",
                resize: "vertical", outline: "none",
              }}
            />
            {manualError && (
              <div style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>⚠ {manualError}</div>
            )}
            {manualSuccess && (
              <div style={{ color: "#4ade80", fontSize: 11, marginTop: 4 }}>✓ Trades añadidos correctamente</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={applyManualJson}
                disabled={!manualJson.trim()}
                style={{
                  background: manualJson.trim() ? "#7c3aed" : "#1e2535",
                  border: "1px solid #7c3aed66",
                  borderRadius: 6, padding: "5px 14px",
                  color: manualJson.trim() ? "#fff" : "#475569",
                  fontSize: 12, fontWeight: 600, cursor: manualJson.trim() ? "pointer" : "default",
                }}>
                ➕ Añadir trades
              </button>
            </div>
          </div>
        )}
      </header>

      {loading && <div className="state">⟳ Cargando trades…</div>}
      {error   && <div className="state error">⚠ {error}</div>}

      {!loading && !error && allTrades.length > 0 && (
        <main className="main">

          {/* ── Summary cards ── */}
          <div style={{ marginBottom: 20 }}>
            {/* Cabecera colapsable */}
            <div
              onClick={() => setSummaryOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", userSelect: "none",
                padding: "7px 12px",
                background: "#1a1f2e",
                border: "1px solid #1e2535",
                borderRadius: summaryOpen ? "10px 10px 0 0" : 10,
                transition: "border-radius .15s",
              }}>
              {/* Lado izquierdo: P&L neto destacado */}
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:12, color:"#475569", fontWeight:600, textTransform:"uppercase", letterSpacing:".07em" }}>
                  Rendimiento
                </span>
                <span style={{ fontSize:15, fontWeight:800, color: totalPnl >= 0 ? "#4ade80" : "#f87171" }}>
                  {fmt(totalPnl)} $
                </span>
                <span style={{ fontSize:11, color: totalPct >= 0 ? "#4ade80" : "#f87171" }}>
                  ({fmtPct(totalPct)})
                </span>
                <span style={{ fontSize:11, color:"#334155" }}>·</span>
                <span style={{ fontSize:11, color: winrate >= 50 ? "#4ade80" : "#f87171" }}>
                  WR {winrate.toFixed(0)}%
                </span>
                <span style={{ fontSize:11, color:"#334155" }}>·</span>
                <span style={{ fontSize:11, color: streakType==="win" ? "#4ade80" : streakType==="loss" ? "#f87171" : "#94a3b8" }}>
                  {streakLabel}
                </span>
              </div>
              {/* Lado derecho: toggle */}
              <span style={{ fontSize:10, color:"#334155", whiteSpace:"nowrap", marginLeft:8 }}>
                <span style={{ fontSize: 20, color: "#334155", lineHeight: 1, display: "flex", alignItems: "center" }}>
                  {summaryOpen ? "▲" : "▼"}
                </span>
              </span>
            </div>

            {/* Cards expandibles */}
            {summaryOpen && (
              <div className="cards" style={{ borderRadius:"0 0 10px 10px", border:"1px solid #1e2535", borderTop:"none", padding:12, marginBottom:0 }}>
                {[
                  { label:"P&L Neto",        val: fmt(totalPnl)+" $",                               col: totalPnl >= 0 ? "#4ade80":"#f87171" },
                  { label:"P&L Bruto",       val: fmt(totalGrossPnl)+" $",                          col: totalGrossPnl >= 0 ? "#4ade80":"#f87171" },
                  /*{ label:"Fees totales",    val: "-"+totalFees.toFixed(3)+" $",                    col: "#fb923c" },*/
                  { label:"Retorno",         val: fmtPct(totalPct),                                 col: totalPct >= 0 ? "#4ade80":"#f87171" },
                  { label:"Mercados",        val: markets.length,                                   col: "#94a3b8" },
                  { label:"Ganadoras",       val: `${winners}`,                                     col: "#4ade80" },
                  { label:"Perdedoras",      val: `${losers}`,                                      col: "#f87171" },
                  { label:"Winrate",         val: `${winrate.toFixed(1)}%`,                         col: winrate >= 50 ? "#4ade80":"#f87171" },
                  { label:"Profit Factor",   val: isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞", col: profitFactor >= 1 ? "#4ade80":"#f87171" },
                  { label:"Avg Win / Loss",  val: `${avgWin.toFixed(2)}$ / ${avgLoss.toFixed(2)}$`, col: avgWin >= avgLoss ? "#4ade80":"#fbbf24" },
                  { label:"Mayor ganancia",  val: fmt(maxWin)+" $",                                 col: "#4ade80" },
                  { label:"Mayor pérdida",   val: fmt(maxLoss)+" $",                                col: "#f87171" },
                  { label:"Racha actual",    val: streakLabel,                                      col: streakType==="win" ? "#4ade80" : streakType==="loss" ? "#f87171":"#94a3b8" },
                  { label:"Invertido",       val: totalCost.toFixed(1)+" $",                        col: "#94a3b8" },
                  { label:"Balance wallet",  val: walletBalance.toFixed(2)+" $",                    col: "#fbbf24" },
                ].map(c => (
                  <div key={c.label} className="card">
                    <span className="card-label">{c.label}</span>
                    <span className="card-val" style={{ color:c.col }}>{c.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Fee alert global ── */}
          {totalFees > 0 && globalFeeImpact > 5 && (
            <div className="fee-alert">
              ⚠ Las fees consumen el <strong>{globalFeeImpact.toFixed(1)}%</strong> de tus ganancias brutas
            </div>
          )}

          {/* ── P&L por token ── */}
          {coins.length > 0 && (
            <div className="token-section">
              <div className="section-title" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", userSelect:"none" }}
                onClick={() => setTokensOpen(o => !o)}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span>P&amp;L por token</span>
                  <span style={{ fontSize: 20, color: "#334155", lineHeight: 1, display: "flex", alignItems: "center" }}>
                    {tokensOpen ? "▲" : "▼"}
                  </span>
                </span>
              </div>
              {tokensOpen && (
                <div className="token-grid">
                {coins.map(c => {
                    const { sym, col } = getCrypto(c.key);
                    const wr       = c.total > 0 ? (c.wins / c.total) * 100 : 0;
                    const pnlColor = c.pnl >= 0 ? "#4ade80" : "#f87171";
                    const wrColor  = wr    >= 50 ? "#4ade80" : "#f87171";
                    const wrLabel  = `${wr.toFixed(0)}% (${c.wins}/${c.total})`;
                    return (
                      <div key={c.key} className="token-card" style={{ borderColor: col.border, background: col.bg }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ color: col.text, fontSize: 20 }}>{sym}</span>
                          <span style={{ color: col.text, fontWeight: 700, textTransform: "uppercase", fontSize: 13 }}>{c.key}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ color: "#64748b" }}>P&amp;L Neto</span>
                            <span style={{ color: pnlColor, fontWeight: 700 }}>{fmt(c.pnl)} $</span>
                          </div>
                          {c.fees > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                              <span style={{ color: "#64748b" }}>Fees</span>
                              <span style={{ color: "#fb923c" }}>-{c.fees.toFixed(3)} $</span>
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                            <span style={{ color: "#64748b" }}>Winrate</span>
                            <span style={{ color: wrColor }}>{wrLabel}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                            <span style={{ color: "#64748b" }}>Invertido</span>
                            <span style={{ color: "#94a3b8" }}>{c.cost.toFixed(2)} $</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Filter pills ── */}
          <div className="pills">
            {["all","win","loss"].map(f => (
              <button key={f} className={`pill ${filter===f?"pill-active":""}`} onClick={() => setFilter(f)}>
                {f==="all"?"Todos":f==="win"?"✓ Ganadoras":"✗ Perdedoras"}
              </button>
            ))}
            {coins.map(c => {
              const { sym, col } = getCrypto(c.key);
              const active = filter === c.key;
              return (
                <button key={c.key} className="pill pill-coin"
                  style={{ background:active?col.border+"44":"", borderColor:active?col.border:"", color:active?col.text:"" }}
                  onClick={() => setFilter(active?"all":c.key)}>
                  <span style={{ color:col.text }}>{sym}</span>
                  <span style={{ textTransform:"uppercase" }}>{c.key}</span>
                  <span style={{ color:c.pnl>=0?"#4ade80":"#f87171" }}>{fmt(c.pnl)}$</span>
                </button>
              );
            })}
          </div>

          {/* ── Time filter pills ── */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, margin:"0 0 14px 0", alignItems:"center" }}>
            <span style={{ fontSize:11, color:"#475569", textTransform:"uppercase", letterSpacing:".06em", marginRight:4 }}>🕐</span>
            {[{ key:"all", label:"Todo" }, ...TIME_OPTIONS].map(o => {
              const active = timeFilter === o.key;
              return (
                <button key={o.key}
                  onClick={() => selectTimeFilter(o.key)}
                  style={{
                    background:  active ? "#3b82f622" : "#1a1f2e",
                    border:      `1px solid ${active ? "#3b82f6" : "#1e2535"}`,
                    borderRadius: 16,
                    padding:     "3px 11px",
                    color:       active ? "#60a5fa" : "#64748b",
                    fontSize:    11,
                    fontWeight:  active ? 700 : 500,
                    cursor:      "pointer",
                    transition:  "all .15s",
                  }}>
                  {o.label}
                </button>
              );
            })}
          </div>

          {/* ── Date filter ── */}
          <div style={{ margin:"0 0 8px 0", display:"flex", alignItems:"center", flexWrap:"wrap", gap:8 }}>
            <label htmlFor="filter-date" style={{ fontSize:12, color:"#64748b" }}>📅 Fecha exacta:</label>
            <input id="filter-date" type="date" value={filterDate}
              onChange={e => selectDate(e.target.value)}
              style={{ fontSize:12, padding:"2px 8px", background:"#1a1f2e", border:"1px solid #1e2535", borderRadius:6, color:"#e2e8f0" }}
              max={defaultDate} />
            {filterDate && (
              <button onClick={() => { setFilterDate(""); setTimeFilter("all"); }}
                style={{ fontSize:12, background:"none", border:"none", color:"#64748b", cursor:"pointer" }}>✕</button>
            )}
          </div>

          {/* Active filter badges */}
          {(filter !== "all" || timeFilter !== "all" || (filterDate && filterDate !== defaultDate)) && (
            <div style={{ margin:"6px 0 14px 0", display:"flex", gap:8, flexWrap:"wrap" }}>
              {filter !== "all" && (
                <span style={{ background:"#1e2535", color:"#60a5fa", borderRadius:4, padding:"2px 8px", fontSize:11 }}>
                  Filtro: {filter}
                </span>
              )}
              {timeFilter !== "all" && (
                <span style={{ background:"#1e253599", color:"#38bdf8", borderRadius:4, padding:"2px 8px", fontSize:11, border:"1px solid #0ea5e944" }}>
                  🕐 Últimas {TIME_OPTIONS.find(o=>o.key===timeFilter)?.label}
                </span>
              )}
              {filterDate && timeFilter === "all" && filterDate !== defaultDate && (
                <span style={{ background:"#1e2535", color:"#fbbf24", borderRadius:4, padding:"2px 8px", fontSize:11 }}>
                  📅 {filterDate}
                </span>
              )}
              {filterDate && timeFilter === "all" && filterDate === defaultDate && (
                <span style={{ background:"#1e2535", color:"#fbbf24", borderRadius:4, padding:"2px 8px", fontSize:11 }}>
                  📅 Hoy
                </span>
              )}
              <span style={{ color:"#334155", fontSize:11, alignSelf:"center" }}>
                → {filtered.length} mercado{filtered.length!==1?"s":""}
              </span>
            </div>
          )}

          {/* ── Market list ── */}
          <div className="market-list">
            {filtered.map(m => {
              const { sym, col } = getCrypto(m.title);
              const win     = m.pnl >= 0;
              const firstBuy = m.trades.find(t => t.side === "BUY");
              const isOpen  = expanded[m.conditionId];
              const hasManual = m.trades.some(t => t._manual);

              return (
                <div key={m.conditionId} className="market-row"
                  onMouseEnter={e => e.currentTarget.style.borderColor = col.border}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2535"}>

                  {/* ── Fila principal (clickable) ── */}
                  <div style={{ display:"flex", alignItems:"center", gap:14, width:"100%", cursor:"pointer" }}
                    onClick={() => toggleExpand(m.conditionId)}>

                    <div className="coin-icon" style={{ background:col.bg, borderColor:col.border, color:col.text }}>
                      {m.icon
                        ? <img src={m.icon} alt="icono" style={{ width:22, height:22, objectFit:"contain" }} />
                        : sym}
                    </div>

                    <div className="market-info">
                      <div className="market-title" style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span>{m.title}</span>
                        {hasManual && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 6px",
                            background: "#7c3aed33", color: "#a78bfa",
                            border: "1px solid #7c3aed66",
                          }}>✏ manual</span>
                        )}
                        {firstBuy?.outcome && (() => {
                          const isUp     = firstBuy.outcome.toLowerCase() === "up";
                          const entryC   = m.avgEntryPrice > 0 ? Math.round(m.avgEntryPrice * 100) : null;
                          const exitC    = m.avgExitPrice  > 0 ? Math.round(m.avgExitPrice  * 100) : null;
                          const dirLabel = isUp ? "↑ UP" : "↓ DOWN";
                          const bg       = isUp ? "#14532d88" : "#7f1d1d88";
                          const col      = isUp ? "#4ade80"   : "#f87171";
                          const border   = isUp ? "#22c55e66" : "#ef444466";
                          return (
                            <>
                              {/* Badge dirección + precio entrada */}
                              <span style={{
                                fontSize:12, fontWeight:700, borderRadius:4, padding:"1px 8px",
                                background: bg, color: col,
                                border:"1px solid", borderColor: border,
                                letterSpacing:1, display:"flex", alignItems:"center", gap:5,
                              }}>
                                {dirLabel}
                                {entryC !== null && (
                                  <span style={{ fontWeight:800, fontSize:13 }}>
                                    {entryC}¢
                                  </span>
                                )}
                              </span>
                              {/* Badge salida si existe */}
                              {exitC !== null && (
                                <span style={{
                                  fontSize:12, fontWeight:700, borderRadius:4, padding:"1px 8px",
                                  background:"#1e2535", color:"#a78bfa",
                                  border:"1px solid", borderColor:"#7c3aed44",
                                  letterSpacing:1, display:"flex", alignItems:"center", gap:5,
                                }}>
                                  <span style={{ color:"#64748b", fontWeight:400 }}></span>
                                  <span style={{ fontWeight:800, fontSize:13 }}>{exitC}¢</span>
                                  {entryC !== null && exitC !== entryC && (
                                    <span style={{
                                      color: exitC > entryC ? "#4ade80" : "#f87171",
                                      fontSize:11,
                                    }}>
                                      {exitC > entryC ? `+${exitC - entryC}` : `${exitC - entryC}`}¢
                                    </span>
                                  )}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap", alignItems:"center" }}>
                        <span style={{ fontSize:11, color:"#64748b" }}>{fmtDate(m.lastTs)}</span>
                        <span style={{ fontSize:11, color:"#334155" }}>·</span>
                        <span style={{ fontSize:11, color:"#64748b" }}>
                          {m.trades.length} trades &nbsp;
                          <span style={{ color:"#4ade8099" }}>{m.numBuys}B</span>
                          {" / "}
                          <span style={{ color:"#f8717199" }}>{m.numSells}S</span>
                        </span>
                        <span style={{ fontSize:11, color:"#334155" }}>·</span>
                        <span style={{ fontSize:11, color:"#64748b" }}>Invertido: {m.buyCost.toFixed(2)}$</span>
                        {m.duration > 0 && <>
                          <span style={{ fontSize:11, color:"#334155" }}>·</span>
                          <span style={{ fontSize:11, color:"#64748b" }}>⏱ {fmtDuration(m.duration)}</span>
                        </>}
                      </div>
                    </div>

                    {/* P&L column */}
                    <div className="market-pnl" style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, minWidth:160 }}>
                      {m.totalFees > 0 && (
                        <div style={{ display:"flex", gap:10, fontSize:11 }}>
                          <span style={{ color:"#475569" }}>Bruto:&nbsp;<span style={{ color:"#94a3b8" }}>{fmt(m.grossPnl)}$</span></span>
                          <span style={{ color:"#475569" }}>Fees:&nbsp;<span style={{ color:"#fb923c" }}>-{m.totalFees.toFixed(3)}$</span></span>
                        </div>
                      )}
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span className="pnl-val" style={{ color:win?"#4ade80":"#f87171" }}>{fmt(m.pnl)} $</span>
                        <span className="pnl-badge" style={{
                          background:  win?"#14532d44":"#7f1d1d44",
                          borderColor: win?"#22c55e44":"#ef444444",
                          color:       win?"#4ade80":"#f87171",
                          fontSize:13, fontWeight:600,
                        }}>{fmtPct(m.pct)}</span>
                      </div>
                      {m.totalFees > 0 && m.feeImpact > 10 && (
                        <span style={{
                          fontSize:11, fontWeight:700, borderRadius:4, padding:"1px 6px",
                          background:  m.feeImpact > 30 ? "#7c2d1244":"#1e2535",
                          color:       m.feeImpact > 30 ? "#fb923c":"#94a3b8",
                          border:"1px solid",
                          borderColor: m.feeImpact > 30 ? "#fb923c66":"transparent",
                          whiteSpace:"nowrap",
                        }}>
                          ⚠ Fees consuming {m.feeImpact.toFixed(0)}% of profits
                        </span>
                      )}
                      <span style={{ fontSize:10, color:"#334155", marginTop:2 }}>{isOpen?"▲ cerrar":"▼ detalle"}</span>
                    </div>
                  </div>

                  {/* ── Panel expandido ── */}
                  {isOpen && (
                    <div style={{
                      marginTop:14, paddingTop:14,
                      borderTop:"1px solid #1e2535",
                      width:"100%",
                    }}>
                      {/* Métricas en grid */}
                      <div style={{
                        display:"grid",
                        gridTemplateColumns:"repeat(auto-fit, minmax(155px, 1fr))",
                        gap:8, marginBottom:12,
                      }}>
                        {[
                          { label:"P&L Bruto",            val:fmt(m.grossPnl)+" $",                      col:m.grossPnl>=0?"#4ade80":"#f87171" },
                          { label:"Fees pagadas",          val:"-"+m.totalFees.toFixed(4)+" $",           col:"#fb923c" },
                          { label:"P&L Neto",              val:fmt(m.pnl)+" $",                           col:m.pnl>=0?"#4ade80":"#f87171" },
                          { label:"Compras",               val:`${m.numBuys} (${m.buyCost.toFixed(2)}$)`, col:"#94a3b8" },
                          { label:"Ventas",                val:`${m.numSells} (${m.sellRevenue.toFixed(2)}$)`, col:"#94a3b8" },
                          { label:"Precio medio entrada",  val:m.avgEntryPrice>0 ? m.avgEntryPrice.toFixed(4)+" $":"-", col:"#60a5fa" },
                          { label:"Precio medio salida",   val:m.avgExitPrice>0  ? m.avgExitPrice.toFixed(4)+" $":"-",  col:"#a78bfa" },
                          { label:"Tamaño medio trade",    val:m.avgTradeSize>0  ? m.avgTradeSize.toFixed(2):"0",        col:"#94a3b8" },
                          { label:"Primer trade",          val:m.firstTs<Infinity ? fmtDate(m.firstTs):"-",              col:"#64748b" },
                          { label:"Último trade",          val:fmtDate(m.lastTs),                                        col:"#64748b" },
                          { label:"Duración",              val:fmtDuration(m.duration),                                  col:"#fbbf24" },
                        ].map(d => (
                          <div key={d.label} style={{
                            background:"#0d0f14", borderRadius:6, padding:"8px 10px",
                            border:"1px solid #1e2535",
                          }}>
                            <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{d.label}</div>
                            <div style={{ fontSize:13, fontWeight:700, color:d.col }}>{d.val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Log de trades individuales */}
                      <div style={{ background:"#0d0f14", borderRadius:6, padding:"10px 12px", border:"1px solid #1e2535" }}>
                        <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>
                          Trades individuales
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                          {[...m.trades].sort((a,b) => a.timestamp - b.timestamp).map((t, i) => (
                            <div key={i} style={{
                              display:"flex", gap:12, alignItems:"center",
                              fontSize:11, padding:"4px 0",
                              borderBottom: i < m.trades.length-1 ? "1px solid #1e253560":"none",
                            }}>
                              <span style={{ color:t.side==="BUY"?"#4ade80":"#f87171", fontWeight:700, minWidth:32 }}>
                                {t.side}
                              </span>
                              <span style={{ color:"#94a3b8", minWidth:52, fontVariantNumeric:"tabular-nums" }}>
                                {t.price?.toFixed(4)} $
                              </span>
                              <span style={{ color:"#64748b", minWidth:62 }}>
                                ×{t.size?.toFixed(2)}
                              </span>
                              <span style={{ color:"#475569" }}>{fmtDate(t.timestamp)}</span>
                              {t.feeRateBps > 0 && (
                                <span style={{ color:"#fb923c", marginLeft:"auto" }}>
                                  fee {(t.feeRateBps/100).toFixed(2)}%
                                </span>
                              )}
                              {t._manual && (
                                <span style={{
                                  marginLeft: "auto", fontSize: 10, fontWeight: 700,
                                  background: "#7c3aed33", color: "#a78bfa",
                                  border: "1px solid #7c3aed66", borderRadius: 4,
                                  padding: "1px 5px",
                                }}>manual</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <div className="state">Sin mercados para este filtro</div>}
          </div>
        </main>
      )}

      {!loading && !error && allTrades.length === 0 && (
        <div className="state">Introduce una wallet y pulsa Cargar</div>
      )}
    </div>
  );
}
