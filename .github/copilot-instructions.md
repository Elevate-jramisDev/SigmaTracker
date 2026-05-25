# SigmaTracker — Copilot Instructions

## Project Overview

SigmaTracker is a single-page web app that tracks and analyses a user's trading activity on [Polymarket](https://polymarket.com). Given a wallet address it fetches all trades via a proxy API, groups them by market (condition ID), and displays P&L, win-rate, streaks, fee impact, and per-token breakdowns in a dark-themed dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 (JSX, functional components, hooks) |
| Build tool | Vite 8 with `@vitejs/plugin-react` |
| Linter | ESLint 10 (flat config, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) |
| Hosting / serverless | Vercel (serverless functions under `api/`) |
| Language | JavaScript (ES Modules, `"type": "module"`) |
| Styling | Plain CSS (`src/App.css`, `src/index.css`) + inline styles |

There is **no TypeScript**, **no CSS framework** (no Tailwind, no MUI), and **no routing library**.

---

## Project Structure

```
SigmaTracker/
├── index.html              # Vite HTML entry point
├── vite.config.js          # Vite config – dev proxy for /api/polymarket
├── eslint.config.js        # Flat ESLint config
├── vercel.json             # Vercel deployment config (currently empty)
├── package.json
│
├── api/                    # Vercel serverless functions (Node.js)
│   ├── polymarket.js       # Catch-all reverse proxy → data-api.polymarket.com
│   └── polymarket/
│       └── [...path].js    # Dynamic catch-all route for Vercel
│
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── routes.json
│
└── src/
    ├── main.jsx            # React DOM root
    ├── App.jsx             # Entire application (single component file)
    ├── App.css             # Component-scoped styles
    └── index.css           # Global / reset styles
```

> The whole UI lives in **`src/App.jsx`** — it is intentionally a monolithic file. Do not split it into separate component files unless explicitly asked.

---

## Key Architectural Concepts

### Data Flow
1. `load(address)` fetches `/api/polymarket/trades?user=<addr>&limit=500` (proxied in dev by Vite, and in production by the Vercel serverless function in `api/polymarket.js`).
2. Raw trades are passed to `groupByMarket(trades)` which aggregates them by `conditionId` into market-level summaries (P&L, fees, buy/sell stats, duration…).
3. Derived stats (winrate, profit factor, streak, coin summary) are computed directly in the component render body using `useMemo` / array reduce.

### State
All state is local to the `App` component — no global state manager (no Redux, Zustand, Context, etc.).

```js
const [trades, setTrades]         // raw API response array
const [filter, setFilter]         // market filter: "all" | "win" | "loss" | <coinKey>
const [timeFilter, setTimeFilter] // time window: "all" | "1h" | "4h" | "6h" | "12h" | "24h" | "7d" | "30d"
const [filterDate, setFilterDate] // exact date string YYYY-MM-DD
const [expanded, setExpanded]     // object {conditionId: bool} for row expand/collapse
```

### API Proxy
- **Dev**: Vite dev server proxies `/api/polymarket/*` → `https://data-api.polymarket.com/*` (configured in `vite.config.js`).
- **Production**: `api/polymarket.js` is a Vercel Node serverless function that does the same reverse proxy.

---

## Coding Conventions

- **Functional components only** — no class components.
- **Named helper functions above the component** — pure utility functions (`groupByMarket`, `coinSummary`, `getCrypto`, `fmt*` formatters) are defined at module scope, not inside the component.
- **No CSS modules** — styles use class names defined in `App.css` plus inline `style={{}}` objects for dynamic/conditional values.
- **Color palette** — use the established dark palette:
  - `#0d0f14` page background
  - `#1a1f2e` card background
  - `#1e2535` borders
  - `#4ade80` positive / green
  - `#f87171` negative / red
  - `#fb923c` fees / orange
  - `#94a3b8` neutral text
- **Number formatting** — always use the provided helpers; do not add new ones unless truly necessary:
  - `fmt(n)` → signed 3-decimal number (e.g. `+0.100`)
  - `fmtPct(n)` → signed percentage (e.g. `+5.3%`)
  - `fmtDate(ts)` → human-readable date from Unix timestamp
  - `fmtDuration(secs)` → human-readable duration
- **Currency** — amounts use the `$` suffix (e.g. `+0.100 $`), not as a prefix.
- **UI language** — all labels and user-facing text are in **Spanish**.
- **Code identifiers and comments** may be in English or Spanish.
- **ESLint** — follow the existing flat config; do not disable hooks lint rules.

---

## Test Framework

No test framework is currently configured. If tests are added, use **Vitest** (the natural companion to Vite) together with `@testing-library/react` for component tests. Do not introduce Jest or any other test runner.

---

## Building & Running

### Prerequisites
- Node.js ≥ 18
- npm

### Install dependencies
```powershell
npm install
```

### Development server (with API proxy)
```powershell
npm run dev
```
Opens at `http://localhost:5173`. The Vite dev server proxies `/api/polymarket/*` to Polymarket's data API automatically — no separate backend process is needed.

### Production build
```powershell
npm run build
```
Output is placed in `dist/`. Static assets are fingerprinted by Vite.

### Preview production build locally
```powershell
npm run preview
```

### Lint
```powershell
npm run lint
```

### Deploy
The project is deployed on **Vercel**. Push to the connected branch; Vercel will:
1. Run `npm run build` → serve `dist/` as static output.
2. Deploy `api/` as serverless functions.

No environment variables are required — the proxy target (`https://data-api.polymarket.com`) is hard-coded in both `vite.config.js` and `api/polymarket.js`.

---

## Things to Avoid

- Do **not** introduce a router (React Router, etc.) — the app is intentionally single-page with no URL routing.
- Do **not** add a CSS framework — keep styling in `App.css` / inline styles.
- Do **not** split `App.jsx` into multiple files without explicit instruction.
- Do **not** add TypeScript without explicit instruction.
- Do **not** commit real wallet addresses other than the default demo address already present in the source.

