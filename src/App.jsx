import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const API_BASE = import.meta.env.DEV ? "/trades-proxy" : "/api/trades";
const PAGE_SIZE = 500;

const PERIODS = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "Todo", value: "all" },
];

const fmt = (n, dec = 2) => (n == null ? "—" : Number(n).toFixed(dec));
const fmtPct = n => (n == null ? "—" : `${n >= 0 ? "+" : ""}${fmt(n)}%`);
const fmtUSDC = n => (n == null ? "—" : `${n >= 0 ? "+" : ""}${fmt(n)} USDC`);

// Utilidad para obtener la fecha actual en formato YYYY-MM-DD
function todayStr() {
  const d = new Date();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function periodStart(p) {
  const now = Date.now();
  if (p === "1h") return now - 3600_000;
  if (p === "24h") return now - 86400_000;
  if (p === "7d") return now - 7 * 86400_000;
  if (p === "30d") return now - 30 * 86400_000;
  return 0;
}

function parseTrades(raw) {
  return raw.map(t => {
    const ts = t.timestamp ? new Date(t.timestamp * 1000) : new Date(t.createdAt || t.created_at || 0);
    const side = (t.side || "").toUpperCase();
    const outcome = (t.outcome || t.outcomeIndex || "").toString();
    const size = parseFloat(t.size || t.tradeAmount || 0);
    const price = parseFloat(t.price || 0);
    return {
      id: t.id || t.transactionHash || Math.random().toString(36),
      ts,
      market: t.market || t.conditionId || "—",
      marketSlug: t.marketSlug || t.title || t.question || t.market || "—",
      asset: t.asset || "",
      icon: t.icon || (t.assetIcon || t.raw?.icon) || undefined, // Propaga icon si existe
      side,
      outcome,
      size,
      price,
      raw: t,
    };
  });
}

function computePnL(trades) {
  // Usar FIFO para emparejar ventas con compras previas
  const positions = {};
  const closed = [];
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);

  for (const t of sorted) {
    // Agrupar por asset y outcome para evitar perder trades por nombres distintos
    const key = `${t.asset || t.market}_${t.outcome}`;
    if (!positions[key]) positions[key] = { buys: [], market: t.marketSlug, outcome: t.outcome };
    const pos = positions[key];

    if (t.side === "BUY") {
      pos.buys.push({ size: t.size, price: t.price });
    } else if (t.side === "SELL") {
      let sellSize = t.size;
      let totalCost = 0;
      let totalSize = 0;
      // Emparejar ventas con compras FIFO
      while (sellSize > 0 && pos.buys.length > 0) {
        const buy = pos.buys[0];
        const matchedSize = Math.min(buy.size, sellSize);
        totalCost += matchedSize * buy.price;
        totalSize += matchedSize;
        buy.size -= matchedSize;
        sellSize -= matchedSize;
        if (buy.size === 0) pos.buys.shift();
      }
      // Si no hay compras previas, usar el precio de venta como referencia
      const entryPrice = totalSize > 0 ? totalCost / totalSize : t.price;
      const pnl = (t.price - entryPrice) * t.size;
      const pct = entryPrice > 0 ? ((t.price - entryPrice) / entryPrice) * 100 : 0;
      closed.push({ ...t, pnl, pct, posSize: t.size, win: pnl >= 0, entryPrice, icon: t.icon });
    }
  }

  return closed;
}

export default function App() {
  const [wallet, setWallet] = useState("0xe1c70472413b93FD6FFEDF45869c7AA0A909ACd5");
  const [allTrades, setAllTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("24h");
      // Al montar, cargar automáticamente los datos de la API si no hay datos
      useEffect(() => {
        if (allTrades.length === 0 && !loading && !error) {
          fetchTrades();
        }
      }, []); // Solo una vez al montar
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [sideFilter, setSideFilter] = useState("all");
  const [tab, setTab] = useState("table");
  const [sortCol, setSortCol] = useState("ts");
  const [sortDir, setSortDir] = useState("desc");
  const [compareResult, setCompareResult] = useState(null);
  const [dataSource, setDataSource] = useState(null); // "api" | "json"
  const fileInputRef = useRef();
  const loadJsonRef = useRef();

  const fetchTrades = useCallback(async () => {
    if (!wallet.trim()) return;
    setLoading(true);
    setError("");
    // Usar SOLO transactionHash para deduplicar (el campo id puede colisionar entre BUY y SELL)
    const seen = new Set();
    let all = [];
    let offset = 0;
    try {
      while (true) {
        const url = `${API_BASE}?user=${wallet.trim()}&limit=${PAGE_SIZE}&offset=${offset}&takerOnly=false`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        for (const t of data) {
          // Usar transactionHash como clave única (no t.id, que puede no ser único por trade)
          const key = t.transactionHash || t.id;
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          all.push(t);
        }
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      setAllTrades(parseTrades(all));
      setDataSource("api");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  function handleLoadFromJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target.result);
        if (!Array.isArray(json)) throw new Error("El JSON debe ser un array");
        // Deduplicar por transactionHash igual que la API
        const seen = new Set();
        const deduped = [];
        for (const t of json) {
          const key = t.transactionHash || t.id;
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          deduped.push(t);
        }
        setAllTrades(parseTrades(deduped));
        setDataSource("json");
        setError("");
        setCompareResult(null);
      } catch (err) {
        setError("Error cargando JSON: " + err.message);
      }
    };
    reader.readAsText(file);
    // Reset input para permitir cargar el mismo fichero otra vez
    e.target.value = "";
  }

  // Log temporal para depuración: contar trades del día 14 antes del filtrado
  if (allTrades.length > 0) {
    const dia14 = allTrades.filter(t => {
      const d = t.ts;
      return d.getFullYear() === 2026 && d.getMonth() === 3 && d.getDate() === 14;
    });
    console.log("Trades en allTrades para el 14/04/2026:", dia14.length, dia14.map(t => t.ts.toISOString()));
  }

  // Calcular P&L SIEMPRE sobre el historial completo
  const allClosedTrades = useMemo(() => computePnL(allTrades), [allTrades]);

  // Filtrar los trades cerrados por fecha, periodo, etc.
  const filteredClosed = useMemo(() => {
    const start = periodStart(period);
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to = dateTo ? new Date(dateTo).getTime() + 86400_000 : Infinity;
    return allClosedTrades.filter(t => {
      const ms = t.ts.getTime();
      if (period !== "all" && ms < start) return false;
      if (dateFrom && ms < from) return false;
      if (dateTo && ms > to) return false;
      if (sideFilter !== "all" && t.side !== sideFilter) return false;
      return true;
    });
  }, [allClosedTrades, period, dateFrom, dateTo, sideFilter]);

  const stats = useMemo(() => {
    const wins = filteredClosed.filter(t => t.win);
    const losses = filteredClosed.filter(t => !t.win);
    const totalPnl = filteredClosed.reduce((s, t) => s + t.pnl, 0);
    const winRate = filteredClosed.length ? (wins.length / filteredClosed.length) * 100 : 0;
    const best = filteredClosed.length ? Math.max(...filteredClosed.map(t => t.pnl)) : 0;
    const worst = filteredClosed.length ? Math.min(...filteredClosed.map(t => t.pnl)) : 0;
    return { total: filteredClosed.length, wins: wins.length, losses: losses.length, totalPnl, winRate, best, worst };
  }, [filteredClosed]);

  const cumPnlData = useMemo(() => {
    const sorted = [...filteredClosed].sort((a, b) => a.ts - b.ts);
    let cum = 0;
    return sorted.map(t => {
      cum += t.pnl;
      return {
        date: t.ts.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
        pnl: parseFloat(cum.toFixed(4)),
      };
    });
  }, [filteredClosed]);

  const dailyPnlData = useMemo(() => {
    const map = {};
    for (const t of filteredClosed) {
      const d = t.ts.toLocaleDateString("es-ES");
      map[d] = (map[d] || 0) + t.pnl;
    }
    return Object.entries(map)
      .sort((a, b) => new Date(a[0].split("/").reverse().join("-")) - new Date(b[0].split("/").reverse().join("-")))
      .map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(4)) }));
  }, [filteredClosed]);

  const sortedTrades = useMemo(() => {
    const t = [...filteredClosed];
    t.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === "ts") { va = a.ts.getTime(); vb = b.ts.getTime(); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return t;
  }, [filteredClosed, sortCol, sortDir]);

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  function compareTrades(uploaded) {
    // Normaliza los IDs
    const getId = t => t.id || t.transactionHash || t.txHash || t.hash || "";
    const localIds = new Set(allTrades.map(getId));
    const uploadedIds = new Set(uploaded.map(getId));
    const missing = uploaded.filter(t => !localIds.has(getId(t)));
    const extra = allTrades.filter(t => !uploadedIds.has(getId(t)));
    // Diferencias de campos clave
    const diffs = [];
    for (const t of uploaded) {
      const id = getId(t);
      const local = allTrades.find(x => getId(x) === id);
      if (local) {
        ["asset","side","size","price","outcome","timestamp"].forEach(k => {
          if (String(local[k]) !== String(t[k])) {
            diffs.push({ id, field: k, local: local[k], uploaded: t[k] });
          }
        });
      }
    }
    setCompareResult({ missing, extra, diffs });
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target.result);
        if (!Array.isArray(json)) throw new Error("El JSON debe ser un array");
        compareTrades(json);
      } catch (err) {
        setCompareResult({ error: err.message });
      }
    };
    reader.readAsText(file);
  }

  const s = {
    wrap: { fontFamily: "system-ui, sans-serif", background: "#0f1117", color: "#e2e8f0", minHeight: "100vh", padding: "24px 20px" },
    header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 },
    logo: { width: 36, height: 36, background: "#4f46e5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#fff" },
    title: { margin: 0, fontSize: 20, fontWeight: 600, color: "#f1f5f9" },
    subtitle: { margin: 0, fontSize: 13, color: "#94a3b8" },
    inputRow: { display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" },
    input: { flex: 1, minWidth: 260, background: "#1e2433", border: "1px solid #2d3748", borderRadius: 8, color: "#e2e8f0", padding: "10px 14px", fontSize: 13, outline: "none" },
    btn: { background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" },
    filterRow: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" },
    periodBtn: active => ({ background: active ? "#4f46e5" : "#1e2433", color: active ? "#fff" : "#94a3b8", border: `1px solid ${active ? "#4f46e5" : "#2d3748"}`, borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400 }),
    dateInput: { background: "#1e2433", border: "1px solid #2d3748", borderRadius: 6, color: "#e2e8f0", padding: "6px 10px", fontSize: 12, outline: "none" },
    select: { background: "#1e2433", border: "1px solid #2d3748", borderRadius: 6, color: "#e2e8f0", padding: "6px 10px", fontSize: 12, outline: "none" },
    kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 },
    kpi: color => ({ background: "#1e2433", borderRadius: 10, padding: "14px 16px", borderLeft: `3px solid ${color || "#4f46e5"}` }),
    kpiLabel: { fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" },
    kpiVal: color => ({ fontSize: 22, fontWeight: 700, color: color || "#f1f5f9" }),
    tabs: { display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #2d3748" },
    tabBtn: active => ({ background: "none", border: "none", borderBottom: `2px solid ${active ? "#4f46e5" : "transparent"}`, color: active ? "#818cf8" : "#64748b", padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400 }),
    table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
    th: { textAlign: "left", padding: "8px 10px", color: "#64748b", borderBottom: "1px solid #2d3748", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" },
    td: { padding: "9px 10px", borderBottom: "1px solid #1a2035", color: "#cbd5e1", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    chartWrap: { background: "#1e2433", borderRadius: 12, padding: "20px 16px", marginBottom: 16 },
    chartTitle: { fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 16 },
    error: { background: "#2d1b1b", border: "1px solid #7f1d1d", borderRadius: 8, padding: "12px 16px", color: "#fca5a5", marginBottom: 16, fontSize: 13 },
    empty: { textAlign: "center", padding: "60px 20px", color: "#475569" },
    badge: win => ({ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: win ? "#052e16" : "#2d1b1b", color: win ? "#4ade80" : "#f87171" }),
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.logo}>P</div>
        <div>
          <p style={s.title}>Polymarket Tracker</p>
          <p style={s.subtitle}>Rendimiento del bot de trading</p>
        </div>
      </div>

      <div style={s.inputRow}>
        <input
          style={s.input}
          placeholder="Dirección de wallet (0x...)"
          value={wallet}
          onChange={e => setWallet(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchTrades()}
        />
        <button style={s.btn} onClick={fetchTrades} disabled={loading}>
          {loading ? "Cargando…" : "Cargar desde API"}
        </button>
        <button style={{ ...s.btn, background: "#0f766e" }} onClick={() => loadJsonRef.current.click()} disabled={loading}>
          Cargar desde JSON
        </button>
        <input type="file" accept="application/json" ref={loadJsonRef} style={{ display: "none" }} onChange={handleLoadFromJson} />
        {dataSource && (
          <span style={{ fontSize: 11, color: dataSource === "json" ? "#34d399" : "#60a5fa", background: "#1e2433", borderRadius: 4, padding: "4px 8px", alignSelf: "center" }}>
            {dataSource === "json" ? "📄 Datos: JSON local" : "🌐 Datos: API"}
          </span>
        )}
      </div>

      {error && <div style={s.error}>Error: {error}</div>}

      {allTrades.length > 0 && (
        <>
          <div style={s.filterRow}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Período:</span>
            {PERIODS.map(p => (
              <button key={p.value} style={s.periodBtn(period === p.value)} onClick={() => { setPeriod(p.value); setDateFrom(""); setDateTo(""); }}>{p.label}</button>
            ))}
            <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>Desde:</span>
            <input type="date" style={s.dateInput} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPeriod("all"); }} />
            <span style={{ fontSize: 12, color: "#64748b" }}>Hasta:</span>
            <input type="date" style={s.dateInput} value={dateTo} onChange={e => { setDateTo(e.target.value); setPeriod("all"); }} />
            <select style={s.select} value={sideFilter} onChange={e => setSideFilter(e.target.value)}>
              <option value="all">Todas</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
            <span style={{ fontSize: 12, color: "#475569", marginLeft: "auto" }}>{filteredClosed.length} trades · {allClosedTrades.length} cerrados</span>
          </div>

          <div style={s.kpiGrid}>
            <div style={s.kpi("#4f46e5")}><div style={s.kpiLabel}>Trades cerrados</div><div style={s.kpiVal()}>{stats.total}</div></div>
            <div style={s.kpi(stats.totalPnl >= 0 ? "#22c55e" : "#ef4444")}><div style={s.kpiLabel}>P&L Total</div><div style={s.kpiVal(stats.totalPnl >= 0 ? "#4ade80" : "#f87171")}>{fmtUSDC(stats.totalPnl)}</div></div>
            <div style={s.kpi("#facc15")}><div style={s.kpiLabel}>Win Rate</div><div style={s.kpiVal("#fde68a")}>{fmt(stats.winRate, 1)}%</div></div>
            <div style={s.kpi("#22c55e")}><div style={s.kpiLabel}>Wins / Losses</div><div style={s.kpiVal()}><span style={{ color: "#4ade80" }}>{stats.wins}</span> / <span style={{ color: "#f87171" }}>{stats.losses}</span></div></div>
            <div style={s.kpi("#22c55e")}><div style={s.kpiLabel}>Mejor trade</div><div style={s.kpiVal("#4ade80")}>{fmtUSDC(stats.best)}</div></div>
            <div style={s.kpi("#ef4444")}><div style={s.kpiLabel}>Peor trade</div><div style={s.kpiVal("#f87171")}>{fmtUSDC(stats.worst)}</div></div>
          </div>

          <div style={s.tabs}>
            {["table", "charts", "raw"].map(t => (
              <button key={t} style={s.tabBtn(tab === t)} onClick={() => setTab(t)}>
                {t === "table" ? "Historial" : t === "charts" ? "Gráficos" : "Todos los trades"}
              </button>
            ))}
          </div>

          {tab === "table" && (
            allClosedTrades.length === 0
              ? <div style={s.empty}>No hay trades cerrados en este período.<br /><span style={{ fontSize: 12 }}>Los trades necesitan una operación de venta para calcular P&L.</span></div>
              : <div style={{ overflowX: "auto" }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th} onClick={() => toggleSort("ts")}>Fecha/Hora {sortCol === "ts" ? (sortDir === "desc" ? "↓" : "↑") : ""}</th>
                        <th style={s.th} onClick={() => toggleSort("marketSlug")}>Mercado {sortCol === "marketSlug" ? (sortDir === "desc" ? "↓" : "↑") : ""}</th>
                        <th style={s.th} onClick={() => toggleSort("outcome")}>Posición {sortCol === "outcome" ? (sortDir === "desc" ? "↓" : "↑") : ""}</th>
                        <th style={s.th} onClick={() => toggleSort("posSize")}>Tamaño {sortCol === "posSize" ? (sortDir === "desc" ? "↓" : "↑") : ""}</th>
                        <th style={s.th} onClick={() => toggleSort("entryPrice")}>Precio entrada {sortCol === "entryPrice" ? (sortDir === "desc" ? "↓" : "↑") : ""}</th>
                        <th style={s.th} onClick={() => toggleSort("win")}>W/L {sortCol === "win" ? (sortDir === "desc" ? "↓" : "↑") : ""}</th>
                        <th style={s.th} onClick={() => toggleSort("pnl")}>P&L (USDC) {sortCol === "pnl" ? (sortDir === "desc" ? "↓" : "↑") : ""}</th>
                        <th style={s.th} onClick={() => toggleSort("pct")}>% P&L {sortCol === "pct" ? (sortDir === "desc" ? "↓" : "↑") : ""}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTrades.map((t, i) => (
                        <tr key={t.id + '-' + i} style={{ background: i % 2 === 0 ? "transparent" : "#161b2a" }}>
                          <td style={s.td}>{t.ts.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                          <td style={{ ...s.td, maxWidth: 300, display: "flex", alignItems: "center", gap: 8 }} title={t.marketSlug}>
                            {t.icon && <img src={t.icon} alt="icon" style={{ width: 20, height: 20, borderRadius: 4, verticalAlign: "middle" }} />}
                            {t.marketSlug}
                          </td>
                          <td style={s.td}>{t.outcome || t.side}</td>
                          <td style={s.td}>{fmt(t.posSize, 4)}</td>
                          <td style={s.td}>{fmt(t.entryPrice, 4)}</td>
                          <td style={s.td}><span style={s.badge(t.win)}>{t.win ? "WIN" : "LOSS"}</span></td>
                          <td style={{ ...s.td, color: t.pnl >= 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>{fmtUSDC(t.pnl)}</td>
                          <td style={{ ...s.td, color: t.pct >= 0 ? "#4ade80" : "#f87171" }}>{fmtPct(t.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          )}

          {tab === "raw" && (
            <>
              <div style={{ margin: "10px 0" }}>
                <button style={s.btn} onClick={() => fileInputRef.current.click()}>Comparar con JSON</button>
                <input type="file" accept="application/json" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />
              </div>
              {compareResult && (
                <div style={{ background: "#1e2433", borderRadius: 8, padding: 16, marginBottom: 16, color: "#facc15" }}>
                  {compareResult.error && <div style={{ color: "#f87171" }}>Error: {compareResult.error}</div>}
                  {compareResult.missing && compareResult.missing.length > 0 && (
                    <div>Faltan en la tabla: <b>{compareResult.missing.length}</b></div>
                  )}
                  {compareResult.extra && compareResult.extra.length > 0 && (
                    <div>Sobran en la tabla: <b>{compareResult.extra.length}</b></div>
                  )}
                  {compareResult.diffs && compareResult.diffs.length > 0 && (
                    <div>Diferencias de campos: <b>{compareResult.diffs.length}</b>
                      <details style={{ color: "#fde68a" }}>
                        <summary>Ver detalles</summary>
                        <ul>
                          {compareResult.diffs.map((d, i) => (
                            <li key={i}>ID: {d.id}, campo: {d.field}, tabla: {String(d.local)}, JSON: {String(d.uploaded)}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  )}
                  {compareResult && !compareResult.error && compareResult.missing.length === 0 && compareResult.extra.length === 0 && compareResult.diffs.length === 0 && (
                    <div style={{ color: "#22c55e" }}>¡Todos los trades coinciden!</div>
                  )}
                </div>
              )}
              {allTrades.length === 0
                ? <div style={s.empty}>No hay trades.</div>
                : <div style={{ overflowX: "auto" }}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Fecha/Hora</th>
                          <th style={s.th}>Mercado</th>
                          <th style={s.th}>Asset</th>
                          <th style={s.th}>Side</th>
                          <th style={s.th}>Size</th>
                          <th style={s.th}>Price</th>
                          <th style={s.th}>Outcome</th>
                          <th style={s.th}>TxHash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allTrades.map((t, i) => (
                          <tr key={t.id + '-' + i} style={{ background: i % 2 === 0 ? "transparent" : "#161b2a" }}>
                            <td style={s.td}>{t.ts.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                            <td
                              style={{
                                ...s.td,
                                maxWidth: undefined,
                                whiteSpace: "normal",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                overflow: "visible",
                                textOverflow: "unset"
                              }}
                              title={t.marketSlug}
                            >
                              {t.icon && <img src={t.icon} alt="icon" style={{ width: 20, height: 20, borderRadius: 4, verticalAlign: "middle" }} />}
                              <span>{t.marketSlug}</span>
                            </td>
                            <td style={s.td}>{t.asset}</td>
                            <td style={s.td}>{t.side}</td>
                            <td style={s.td}>{fmt(t.size, 4)}</td>
                            <td style={s.td}>{fmt(t.price, 4)}</td>
                            <td style={s.td}>{t.outcome}</td>
                            <td style={s.td}>{t.id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </>
          )}

          {tab === "charts" && (
            <div>
              <div style={s.chartWrap}>
                <div style={s.chartTitle}>P&L acumulado</div>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cumPnlData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#1e2433", border: "1px solid #2d3748", borderRadius: 8, color: "#e2e8f0", fontSize: 12 }} formatter={v => [`${Number(v).toFixed(4)} USDC`, "P&L"]} />
                      <Line type="monotone" dataKey="pnl" stroke="#818cf8" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                <div style={s.chartWrap}>
                  <div style={s.chartTitle}>P&L diario</div>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyPnlData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                        <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "#1e2433", border: "1px solid #2d3748", borderRadius: 8, color: "#e2e8f0", fontSize: 12 }} formatter={v => [`${Number(v).toFixed(4)} USDC`, "P&L"]} />
                        <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                          {dailyPnlData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "#22c55e" : "#ef4444"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={s.chartWrap}>
                  <div style={s.chartTitle}>Win / Loss</div>
                  <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", gap: 32 }}>
                    <ResponsiveContainer width="60%" height="100%">
                      <PieChart>
                        <Pie data={[{ name: "Win", value: stats.wins }, { name: "Loss", value: stats.losses }]} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value">
                          <Cell fill="#22c55e" />
                          <Cell fill="#ef4444" />
                        </Pie>
                        <Tooltip contentStyle={{ background: "#1e2433", border: "1px solid #2d3748", borderRadius: 8, color: "#e2e8f0", fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#22c55e", display: "inline-block" }} /><span style={{ color: "#94a3b8" }}>Wins</span><strong style={{ color: "#4ade80", marginLeft: 4 }}>{stats.wins}</strong></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#ef4444", display: "inline-block" }} /><span style={{ color: "#94a3b8" }}>Losses</span><strong style={{ color: "#f87171", marginLeft: 4 }}>{stats.losses}</strong></div>
                      <div style={{ borderTop: "1px solid #2d3748", paddingTop: 10, color: "#facc15", fontWeight: 700, fontSize: 16 }}>{fmt(stats.winRate, 1)}%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && allTrades.length === 0 && !error && (
        <div style={s.empty}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 15, color: "#475569" }}>Introduce una wallet y pulsa "Cargar datos"</div>
        </div>
      )}
    </div>
  );
}