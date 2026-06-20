import { useState, useEffect, useMemo, useCallback } from "react";
import "./App.css";

const WALLET_OPTIONS = [
  { key: "tst", label: "TST", address: "0xEd084e26667b5668A17e34391C24f81767F15F2e" },
  { key: "pro", label: "PRO", address: "0xe1c70472413b93FD6FFEDF45869c7AA0A909ACd5" },
];
const DEFAULT_WALLET_OPTION = WALLET_OPTIONS.find(option => option.key === "pro") || WALLET_OPTIONS[0];
const DEFAULT_WALLET = DEFAULT_WALLET_OPTION.address;

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
const RESULT_FILTERS = ["all", "win", "loss"];
const TIME_OPTIONS = [
  { key: "1h",  label: "1h",   secs: 3600 },
  { key: "4h",  label: "4h",   secs: 4 * 3600 },
  { key: "6h",  label: "6h",   secs: 6 * 3600 },
  { key: "12h", label: "12h",  secs: 12 * 3600 },
  { key: "24h", label: "24h",  secs: 24 * 3600 },
  { key: "7d",  label: "7d",   secs: 7 * 86400 },
  { key: "14d", label: "14d",  secs: 14 * 86400 },
  { key: "30d", label: "30d",  secs: 30 * 86400 },
];
const TIME_FILTER_OPTIONS = [{ key: "all", label: "Todo" }, ...TIME_OPTIONS];
const TIME_OPTIONS_BY_KEY = new Map(TIME_OPTIONS.map(option => [option.key, option]));
const MARKET_TIMEFRAMES = [
  { key: "5m",  label: "5 min", patterns: [/(^|[-_\s])5m($|[-_\s])/, /\b5\s*(min|mins|minute|minutes|minuto|minutos)\b/] },
  { key: "15m", label: "15 min", patterns: [/(^|[-_\s])15m($|[-_\s])/, /\b15\s*(min|mins|minute|minutes|minuto|minutos)\b/] },
  { key: "1h",  label: "1 h", patterns: [/(^|[-_\s])1h($|[-_\s])/, /\b1\s*(h|hr|hrs|hour|hours|hora|horas)\b/, /\bhourly\b/] },
  { key: "4h",  label: "4 h", patterns: [/(^|[-_\s])4h($|[-_\s])/, /\b4\s*(h|hr|hrs|hour|hours|hora|horas)\b/] },
  { key: "1d",  label: "1 dia", patterns: [/(^|[-_\s])1d($|[-_\s])/, /\b1\s*(d|day|days|dia|dias)\b/, /\bdaily\b/] },
];
const OTHER_MARKET_TIMEFRAME = { key: "other", label: "Otros" };
let manualTradesCache;

function normalizeWallet(wallet = "") {
  return wallet.trim().toLowerCase();
}

function shortWallet(wallet = "") {
  return wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "";
}

function getWalletOptionByAddress(wallet = "") {
  const normalizedWallet = normalizeWallet(wallet);
  return WALLET_OPTIONS.find(option => normalizeWallet(option.address) === normalizedWallet);
}

function getCrypto(title = "") {
  const t = title.toLowerCase();
  for (const [key, meta] of Object.entries(CRYPTO_META)) {
    if (t.includes(key)) return { key, ...meta };
  }
  return { key: "other", ...FALLBACK };
}

function normalizeText(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getMarketTimeframe(market = {}) {
  const source = normalizeText([market.slug, market.eventSlug, market.title].filter(Boolean).join(" "));
  return MARKET_TIMEFRAMES.find(option => option.patterns.some(pattern => pattern.test(source))) || OTHER_MARKET_TIMEFRAME;
}

function createMarketStats(extra = {}) {
  return { pnl: 0, grossPnl: 0, fees: 0, cost: 0, wins: 0, total: 0, ...extra };
}

function addMarketStats(stats, market) {
  stats.pnl += market.pnl;
  stats.grossPnl += market.grossPnl;
  stats.fees += market.totalFees;
  stats.cost += market.buyCost;
  stats.total++;
  if (market.pnl > 0) stats.wins++;
}

function groupByMarket(trades) {
  const map = new Map();
  for (const t of trades) {
    const id = (t.conditionId || t.transactionHash || `${t.asset || "market"}-${t.timestamp || 0}`).toLowerCase();
    if (!map.has(id)) {
      map.set(id, {
        ...t,
        conditionId: id,
        slug: t.slug,
        buyCost: 0, sellRevenue: 0,
        totalFees: 0,
        totalBuySize: 0, totalSellSize: 0,
        numBuys: 0, numSells: 0,
        trades: [], lastTs: 0, firstTs: Infinity, icon: t.icon,
        firstBuy: null, hasManual: false,
      });
    }
    const m = map.get(id);
    const size = Number(t.size) || 0;
    const price = Number(t.price) || 0;
    const timestamp = Number(t.timestamp) || 0;
    const val = size * price;
    const fee = val * ((Number(t.feeRateBps) || 0) / 10000);
    m.totalFees += fee;
    if (t.side === "BUY") {
      m.buyCost += val;
      m.totalBuySize += size;
      m.numBuys++;
      if (!m.firstBuy) m.firstBuy = t;
    } else {
      m.sellRevenue += val;
      m.totalSellSize += size;
      m.numSells++;
    }
    m.trades.push(t);
    if (timestamp > m.lastTs) m.lastTs = timestamp;
    if (timestamp < m.firstTs) m.firstTs = timestamp;
    if (!m.icon && t.icon) m.icon = t.icon;
    if (t._manual) {
      m.hasManual = true;
      m.manualWalletLabel = t._manualWalletLabel || m.manualWalletLabel;
    }
  }
  return Array.from(map.values()).map(m => {
    const grossPnl     = m.sellRevenue - m.buyCost;
    const pnl          = grossPnl - m.totalFees;
    const pct          = m.buyCost > 0 ? (pnl / m.buyCost) * 100 : 0;
    const feeImpact    = grossPnl > 0 ? (m.totalFees / grossPnl) * 100 : 0;
    const avgEntryPrice = m.totalBuySize  > 0 ? m.buyCost      / m.totalBuySize  : 0;
    const avgExitPrice  = m.totalSellSize > 0 ? m.sellRevenue  / m.totalSellSize : 0;
    const totalTrades  = m.numBuys + m.numSells;
    const avgTradeSize = totalTrades > 0 ? (m.totalBuySize + m.totalSellSize) / totalTrades : 0;
    const duration     = (m.firstTs < Infinity && m.lastTs > m.firstTs) ? m.lastTs - m.firstTs : 0;
    const sortedTrades = [...m.trades].sort((a, b) => a.timestamp - b.timestamp);
    return { ...m, grossPnl, pnl, pct, feeImpact, avgEntryPrice, avgExitPrice, avgTradeSize, duration, sortedTrades, crypto: getCrypto(m.title), marketTimeframe: getMarketTimeframe(m) };
  }).sort((a, b) => b.lastTs - a.lastTs);
}

function getDashboardStats(markets, trades) {
  const coinsByKey = {};
  let totalPnl = 0;
  let totalGrossPnl = 0;
  let totalFees = 0;
  let totalCost = 0;
  let winners = 0;
  let losers = 0;
  let winsPnl = 0;
  let lossesPnl = 0;
  let bestMarket = null;
  let worstMarket = null;
  let streak = 0;
  let streakType = null;
  let streakOpen = true;

  for (const m of markets) {
    totalPnl += m.pnl;
    totalGrossPnl += m.grossPnl;
    totalFees += m.totalFees;
    totalCost += m.buyCost;

    if (m.pnl > 0) {
      winners++;
      winsPnl += m.pnl;
    } else if (m.pnl < 0) {
      losers++;
      lossesPnl += m.pnl;
    }

    if (!bestMarket || m.pnl > bestMarket.pnl) bestMarket = m;
    if (!worstMarket || m.pnl < worstMarket.pnl) worstMarket = m;

    if (streakOpen && m.pnl !== 0) {
      const type = m.pnl > 0 ? "win" : "loss";
      if (!streakType) {
        streakType = type;
        streak = 1;
      } else if (type === streakType) {
        streak++;
      } else {
        streakOpen = false;
      }
    }

    const key = m.crypto.key;
    if (!coinsByKey[key]) coinsByKey[key] = createMarketStats({ key, marketsByKey: {} });
    const coin = coinsByKey[key];
    addMarketStats(coin, m);

    const timeframe = m.marketTimeframe;
    if (!coin.marketsByKey[timeframe.key]) {
      coin.marketsByKey[timeframe.key] = createMarketStats({ key: timeframe.key, label: timeframe.label });
    }
    addMarketStats(coin.marketsByKey[timeframe.key], m);
  }

  const total = winners + losers;
  const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const globalFeeImpact = totalGrossPnl > 0 ? (totalFees / totalGrossPnl) * 100 : 0;
  const winrate = total > 0 ? (winners / total) * 100 : 0;
  const avgWin = winners > 0 ? winsPnl / winners : 0;
  const avgLoss = losers > 0 ? Math.abs(lossesPnl / losers) : 0;
  const grossLoss = Math.abs(lossesPnl);
  const profitFactor = grossLoss > 0 ? winsPnl / grossLoss : winsPnl > 0 ? Infinity : 0;
  const walletBalance = trades.reduce((acc, t) =>
    acc + (t.side === "BUY" ? -((Number(t.size) || 0) * (Number(t.price) || 0)) : (Number(t.size) || 0) * (Number(t.price) || 0)), 0);
  const streakLabel = streakType === "win"
    ? `🔥 ${streak} ganadas`
    : streakType === "loss"
    ? `❄️ ${streak} perdidas`
    : "-";

  return {
    coins: Object.values(coinsByKey).map(coin => ({
      ...coin,
      markets: [...MARKET_TIMEFRAMES, OTHER_MARKET_TIMEFRAME]
        .map(option => coin.marketsByKey[option.key])
        .filter(Boolean),
    })),
    totalPnl,
    totalGrossPnl,
    totalFees,
    totalCost,
    totalPct,
    globalFeeImpact,
    winners,
    losers,
    winrate,
    avgWin,
    avgLoss,
    profitFactor,
    maxWin: bestMarket?.pnl ?? 0,
    maxLoss: worstMarket?.pnl ?? 0,
    streakType,
    streakLabel,
    walletBalance,
  };
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

async function fetchManualFromRepo() {
  if (manualTradesCache) return manualTradesCache;
  manualTradesCache = (async () => {
  try {
    const res = await fetch("/manual-trades.json");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
  })();
  return manualTradesCache;
}

function getManualTradesForWallet(wallet, repoTrades) {
  const normalizedWallet = normalizeWallet(wallet);
  const walletOption = getWalletOptionByAddress(wallet);
  return repoTrades
    .filter(t => t.proxyWallet && normalizeWallet(t.proxyWallet) === normalizedWallet)
    .map(t => ({ ...t, _manual: true, _manualWalletLabel: walletOption?.label || shortWallet(wallet) }));
}


export default function App() {
  const [selectedWalletKey, setSelectedWalletKey] = useState(DEFAULT_WALLET_OPTION.key);
  const [trades,   setTrades]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [filter,     setFilter]     = useState("all");
  const [expanded,   setExpanded]   = useState({});
  const [tokensOpen,   setTokensOpen]   = useState(false);
  const [summaryOpen,  setSummaryOpen]  = useState(false);
  const [timeFilter, setTimeFilter] = useState("all");
  const [timeAnchorSecs, setTimeAnchorSecs] = useState(0);

  // ── Trades manuales (cargados desde /manual-trades.json) ──
  const [manualTrades, setManualTrades] = useState([]);

  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const [filterDate, setFilterDate] = useState(defaultDate);

  function selectTimeFilter(key) {
    setTimeFilter(key);
    if (key !== "all") {
      setTimeAnchorSecs(Math.floor(new Date().getTime() / 1000));
      setFilterDate(""); // limpiar fecha exacta
    }
  }
  function selectDate(val) {
    setFilterDate(val);
    if (val) setTimeFilter("all"); // limpiar ventana temporal
  }

  const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const [copiedId, setCopiedId] = useState(null);
  function copyTitle(e, conditionId, title) {
    e.stopPropagation();
    navigator.clipboard.writeText(title).then(() => {
      setCopiedId(conditionId);
      setTimeout(() => setCopiedId(id => id === conditionId ? null : id), 1500);
    });
  }

  // Trades fusionados (API + manuales del repositorio)
  const allTrades = useMemo(() => [...trades, ...manualTrades], [trades, manualTrades]);
  const selectedWallet = useMemo(
    () => WALLET_OPTIONS.find(option => option.key === selectedWalletKey) || DEFAULT_WALLET_OPTION,
    [selectedWalletKey],
  );

  const load = useCallback(async (addr, { initial = false } = {}) => {
    const wallet = normalizeWallet(addr);
    if (!initial) {
      setLoading(true);
      setError(null);
    }
    try {
      const url = `/api/polymarket/trades?user=${encodeURIComponent(wallet)}&limit=500&offset=0&takerOnly=false`;
      const [apiTrades, repoTrades] = await Promise.all([
        fetch(url).then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }),
        fetchManualFromRepo(),
      ]);
      setTrades(Array.isArray(apiTrades) ? apiTrades : []);
      setManualTrades(getManualTradesForWallet(wallet, repoTrades));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(DEFAULT_WALLET, { initial: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function selectWallet(key) {
    const walletOption = WALLET_OPTIONS.find(option => option.key === key) || DEFAULT_WALLET_OPTION;
    setSelectedWalletKey(walletOption.key);
    void load(walletOption.address);
  }

  const markets  = useMemo(() => groupByMarket(allTrades), [allTrades]);
  const filtered = useMemo(() => markets.filter(m => {
    if (filter === "win"  && m.pnl <= 0) return false;
    if (filter === "loss" && m.pnl >= 0) return false;
    if (!RESULT_FILTERS.includes(filter) && m.crypto.key !== filter) return false;
    // Filtro ventana temporal (tiene prioridad sobre fecha exacta)
    if (timeFilter !== "all") {
      const opt = TIME_OPTIONS_BY_KEY.get(timeFilter);
      if (opt && m.lastTs < timeAnchorSecs - opt.secs) return false;
    } else if (filterDate) {
      const marketDate = new Date(m.lastTs * 1000).toISOString().slice(0, 10);
      if (marketDate !== filterDate) return false;
    }
    return true;
  }), [markets, filter, timeFilter, timeAnchorSecs, filterDate]);

  const {
    coins,
    totalPnl,
    totalGrossPnl,
    totalFees,
    totalCost,
    totalPct,
    globalFeeImpact,
    winners,
    losers,
    winrate,
    avgWin,
    avgLoss,
    profitFactor,
    maxWin,
    maxLoss,
    streakType,
    streakLabel,
    walletBalance,
  } = useMemo(() => getDashboardStats(filtered, allTrades), [filtered, allTrades]);

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
          <select
            className="wallet-select"
            value={selectedWalletKey}
            onChange={e => selectWallet(e.target.value)}
            disabled={loading}
            title={selectedWallet.address}
          >
            {WALLET_OPTIONS.map(option => (
              <option key={option.key} value={option.key}>
                {option.label} - {shortWallet(option.address)}
              </option>
            ))}
          </select>
          <span className="wallet-address" title={selectedWallet.address}>
            {selectedWallet.address}
          </span>
          <button className="btn-load" onClick={() => load(selectedWallet.address)}>Cargar</button>
          <button
            title={manualTrades.length > 0 ? `${manualTrades.length} trades manuales ${selectedWallet.label} cargados desde el repositorio` : `No hay trades manuales ${selectedWallet.label} en el repositorio`}
            style={{
              background: manualTrades.length > 0 ? "#7c3aed33" : "#1a1f2e",
              border: `1px solid ${manualTrades.length > 0 ? "#7c3aed" : "#1e2535"}`,
              borderRadius: 8, padding: "6px 13px",
              color: manualTrades.length > 0 ? "#a78bfa" : "#64748b",
              fontSize: 12, fontWeight: 600, cursor: "default",
              display: "flex", alignItems: "center", gap: 6,
            }}>
            <span>{selectedWallet.label}</span>
            ✏ Manuales
            {manualTrades.length > 0 && (
              <span style={{
                background: "#7c3aed", color: "#fff", borderRadius: 10,
                fontSize: 10, fontWeight: 700, padding: "1px 6px",
              }}>{manualTrades.length}</span>
            )}
          </button>
        </div>
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
                <span style={{ fontSize:11, color:"#334155" }}>
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
                        {c.markets.length > 0 && (
                          <div className="token-market-list">
                            {c.markets.map(market => {
                              const marketWr = market.total > 0 ? (market.wins / market.total) * 100 : 0;
                              return (
                                <div key={market.key} className="token-market-row">
                                  <span className="token-market-label">{market.label}</span>
                                  <span className="token-market-meta">
                                    {market.total} mercado{market.total !== 1 ? "s" : ""} - WR {marketWr.toFixed(0)}%
                                  </span>
                                  <span
                                    className="token-market-pnl"
                                    style={{ color: market.pnl >= 0 ? "#4ade80" : "#f87171" }}
                                  >
                                    {fmt(market.pnl)} $
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Filter pills ── */}
          <div className="pills">
            {RESULT_FILTERS.map(f => (
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
            {TIME_FILTER_OPTIONS.map(o => {
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
                  🕐 Últimas {TIME_OPTIONS_BY_KEY.get(timeFilter)?.label}
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
              const { sym, col } = m.crypto;
              const win     = m.pnl >= 0;
              const firstBuy = m.firstBuy;
              const isOpen  = expanded[m.conditionId];
              const hasManual = m.hasManual;

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
                        <button
                          title="Copiar título"
                          onClick={e => copyTitle(e, m.conditionId, m.title)}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            padding: "2px 5px", borderRadius: 4,
                            color: copiedId === m.conditionId ? "#4ade80" : "#475569",
                            fontSize: 16, lineHeight: 1, flexShrink: 0,
                            transition: "color .2s",
                          }}>
                          {copiedId === m.conditionId ? "✓" : "⧉"}
                        </button>
                        {m.slug && (
                          <a
                            href={`https://polymarket.com/es/event/${m.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir mercado en Polymarket"
                            onClick={e => e.stopPropagation()}
                            style={{
                              color: "#475569",
                              fontSize: 16,
                              lineHeight: 1,
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "2px 5px",
                            }}
                            className="market-link-icon"
                          >
                            ↗
                          </a>
                        )}
                        {hasManual && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 6px",
                            background: "#7c3aed33", color: "#a78bfa",
                            border: "1px solid #7c3aed66",
                          }}>✏ manual</span>
                        )}
                        {hasManual && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 6px",
                            background: "#0f172a", color: "#a78bfa",
                            border: "1px solid #7c3aed44",
                          }}>{m.manualWalletLabel || selectedWallet.label}</span>
                        )}
                        <span style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 6px",
                          background: "#0f172a", color: "#38bdf8",
                          border: "1px solid #0ea5e944",
                        }}>{m.marketTimeframe.label}</span>
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
                          {m.sortedTrades.map((t, i) => (
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
                                }}>{t._manualWalletLabel || selectedWallet.label} manual</span>
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
