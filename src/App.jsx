import { useState, useMemo, useCallback } from "react";
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
      side,
      outcome,
      size,
      price,
      raw: t,
    };
  });
}

function computePnL(trades) {
  const positions = {};
  const closed = [];
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);

  for (const t of sorted) {
    const key = `${t.market}_${t.outcome}`;
    if (!positions[key]) positions[key] = { size: 0, cost: 0, market: t.marketSlug, outcome: t.outcome };
    const pos = positions[key];

    if (t.side === "BUY") {
      pos.cost += t.size * t.price;
      pos.size += t.size;
    } else if (t.side === "SELL") {
      const avgCost = pos.size > 0 ? pos.cost / pos.size : t.price;
      const pnl = (t.price - avgCost) * t.size;
      const pct = avgCost > 0 ? ((t.price - avgCost) / avgCost) * 100 : 0;
      closed.push({ ...t, pnl, pct, posSize: t.size, win: pnl >= 0 });
      pos.size = Math.max(0, pos.size - t.size);
      pos.cost = pos.size > 0 ? avgCost * pos.size : 0;
    }
  }

  return closed;
}

export default function App() {
  const [wallet, setWallet] = useState("0xe1c70472413b93FD6FFEDF45869c7AA0A909ACd5");
  const [allTrades, setAllTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sideFilter, setSideFilter] = useState("all");
  const [tab, setTab] = useState("table");
  const [sortCol, setSortCol] = useState("ts");
  const [sortDir, setSortDir] = useState("desc");

  const fetchTrades = useCallback(async () => {
    if (!wallet.trim()) return;
    setLoading(true);
    setError("");
    const seen = new Set();
    let all = [];
    let offset = 0;
    try {
      while (true) {
        const url = `${API_BASE}?user=${wallet.trim()}&limit=${PAGE_SIZE}&offset=${offset}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        for (const t of data) {
          const id = t.id || t.transactionHash;
          if (id && seen.has(id)) continue;
          if (id) seen.add(id);
          all.push(t);
        }
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      setAllTrades(parseTrades(all));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  const filtered = useMemo(() => {
    const start = periodStart(period);
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to = dateTo ? new Date(dateTo).getTime() + 86400_000 : Infinity;
    return allTrades.filter(t => {
      const ms = t.ts.getTime();
      if (period !== "all" && ms < start) return false;
      if (dateFrom && ms < from) return false;
      if (dateTo && ms > to) return false;
      if (sideFilter !== "all" && t.side !== sideFilter) return false;
      return true;
    });
  }, [allTrades, period, dateFrom, dateTo, sideFilter]);

  const pnlTrades = useMemo(() => computePnL(filtered), [filtered]);

  const stats = useMemo(() => {
    const wins = pnlTrades.filter(t => t.win);
    const losses = pnlTrades.filter(t => !t.win);
    const totalPnl = pnlTrades.reduce((s, t) => s + t.pnl, 0);
    const winRate = pnlTrades.length ? (wins.length / pnlTrades.length) * 100 : 0;
    const best = pnlTrades.length ? Math.max(...pnlTrades.map(t => t.pnl)) : 0;
    const worst = pnlTrades.length ? Math.min(...pnlTrades.map(t => t.pnl)) : 0;
    return { total: pnlTrades.length, wins: wins.length, losses: losses.length, totalPnl, winRate, best, worst };
  }, [pnlTrades]);

  const cumPnlData = useMemo(() => {
    const sorted = [...pnlTrades].sort((a, b) => a.ts - b.ts);
    let cum = 0;
    return sorted.map(t => {
      cum += t.pnl;
      return {
        date: t.ts.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
        pnl: parseFloat(cum.toFixed(4)),
      };
    });
  }, [pnlTrades]);

  const dailyPnlData = useMemo(() => {
    const map = {};
    for (const t of pnlTrades) {
      const d = t.ts.toLocaleDateString("es-ES");
      map[d] = (map[d] || 0) + t.pnl;
    }
    return Object.entries(map)
      .sort((a, b) => new Date(a[0].split("/").reverse().join("-")) - new Date(b[0].split("/").reverse().join("-")))
      .map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(4)) }));
  }, [pnlTrades]);

  const sortedTrades = useMemo(() => {
    const t = [...pnlTrades];
    t.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === "ts") { va = a.ts.getTime(); vb = b.ts.getTime(); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return t;
  }, [pnlTrades, sortCol, sortDir]);

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

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
          {loading ? "Cargando…" : "Cargar datos"}
        </button>
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
            <span style={{ fontSize: 12, color: "#475569", marginLeft: "auto" }}>{filtered.length} trades · {pnlTrades.length} cerrados</span>
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
            {["table", "charts"].map(t => (
              <button key={t} style={s.tabBtn(tab === t)} onClick={() => setTab(t)}>
                {t === "table" ? "Historial" : "Gráficos"}
              </button>
            ))}
          </div>

          {tab === "table" && (
            pnlTrades.length === 0
              ? <div style={s.empty}>No hay trades cerrados en este período.<br /><span style={{ fontSize: 12 }}>Los trades necesitan una operación de venta para calcular P&L.</span></div>
              : <div style={{ overflowX: "auto" }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {[["ts","Fecha/Hora"],["marketSlug","Mercado"],["outcome","Posición"],["posSize","Tamaño"],["win","W/L"],["pnl","P&L (USDC)"],["pct","% P&L"]].map(([col, label]) => (
                          <th key={col} style={s.th} onClick={() => toggleSort(col)}>
                            {label} {sortCol === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTrades.map((t, i) => (
                        <tr key={t.id + i} style={{ background: i % 2 === 0 ? "transparent" : "#161b2a" }}>
                          <td style={s.td}>{t.ts.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                          <td style={{ ...s.td, maxWidth: 200 }} title={t.marketSlug}>{t.marketSlug}</td>
                          <td style={s.td}>{t.outcome || t.side}</td>
                          <td style={s.td}>{fmt(t.posSize, 4)}</td>
                          <td style={s.td}><span style={s.badge(t.win)}>{t.win ? "WIN" : "LOSS"}</span></td>
                          <td style={{ ...s.td, color: t.pnl >= 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>{fmtUSDC(t.pnl)}</td>
                          <td style={{ ...s.td, color: t.pct >= 0 ? "#4ade80" : "#f87171" }}>{fmtPct(t.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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