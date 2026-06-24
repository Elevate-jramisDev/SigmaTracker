# SigmaTracker

SigmaTracker es una aplicación web para seguir y analizar operaciones de una wallet en Polymarket. Combina trades de la Data API con trades manuales definidos en el repositorio y calcula métricas de rendimiento por mercado, token y ventana temporal.

## Características

- Dashboard de P&L bruto, fees, P&L neto, retorno, winrate, profit factor, racha, inversión y balance.
- Agrupación de trades por mercado con detalle expandible y log individual de operaciones.
- Resumen colapsable de P&L por token detectado en el título del mercado.
- Filtros por resultado, token, rango de fechas y ventanas relativas de 1h a 30d.
- Selector de wallet con las cuentas TST y PRO; cambiar la wallet dispara la recarga automática.
- Carga de trades manuales desde `public/manual-trades.json`, filtrados por `proxyWallet`, sin controles manuales visibles en el header.
- Valoración de mercados cerrados con `realizedPnl` de `closed-positions` para evitar que una posición ganadora sin trade `SELL` aparezca como pérdida.
- Proxy local/Vercel para la Polymarket Data API bajo `/api/polymarket/*`.

## Optimización actual

- Los cálculos pesados del dashboard están memoizados con `useMemo`.
- El resumen global se calcula en una sola pasada sobre los mercados filtrados.
- Los mercados se agrupan con `Map` y se normalizan los valores numéricos antes de calcular P&L.
- Cada mercado guarda su `crypto`, `firstBuy`, `hasManual` y `sortedTrades` durante la agrupación para evitar búsquedas y ordenaciones repetidas en render.
- Los trades manuales del repositorio se cachean tras la primera lectura y se filtran por wallet antes de fusionarlos con la API.
- La carga inicial evita setters síncronos dentro de `useEffect`, aborta peticiones obsoletas al cambiar de wallet y muestra progreso durante la paginación.
- Las posiciones cerradas se paginan por wallet, se filtran localmente por `conditionId` y se fusionan con los mercados antes de calcular P&L.

## API utilizada

SigmaTracker consume la Polymarket Data API:

```text
GET https://data-api.polymarket.com/trades?user={wallet}&limit=500&offset={0,500,1000...}&takerOnly=false
```

En la app se llama mediante:

```text
/api/polymarket/trades?user={wallet}&limit=500&offset={0,500,1000...}&takerOnly=false
/api/polymarket/closed-positions?user={wallet}&limit=50&offset={0,50,100...}
```

La app pagina secuencialmente en bloques de 500 trades hasta que la API devuelve una pagina incompleta, evitando quedarse solo con la ventana mas reciente. Despues pagina `closed-positions` en bloques de 50 posiciones cerradas y usa `realizedPnl` cuando existe una posicion cerrada, de forma que los mercados resueltos sin trade `SELL` no aparezcan como perdidos por el coste de compra. En desarrollo, Vite redirige esa ruta con `server.proxy`. En Vercel, la función serverless de `api/polymarket/[...path].js` actúa como proxy.

## Trades manuales

Los trades manuales viven en:

```text
public/manual-trades.json
```

Cada entrada debe incluir `proxyWallet`. SigmaTracker solo mezcla manuales cuyo `proxyWallet` coincide con la wallet elegida en el selector, separando asi los registros TST y PRO. Los manuales se aplican en segundo plano y siguen marcados dentro del detalle de cada mercado cuando correspondan.

## Instalación

```bash
npm install
```

## Uso local

```bash
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173).

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia Vite con HMR. |
| `npm run build` | Genera el build de producción. |
| `npm run preview` | Sirve el build generado. |
| `npm run lint` | Ejecuta ESLint sobre frontend y funciones API. |

En Windows con PowerShell restringido, usa `npm.cmd run lint` o `npm.cmd run build`.

## Estructura

```text
SigmaTracker/
├── api/
│   ├── manual-trades.js
│   ├── polymarket.js
│   └── polymarket/
│       └── [...path].js
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   ├── manual-trades.json
│   └── routes.json
├── src/
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── eslint.config.js
├── package.json
├── vercel.json
└── vite.config.js
```

## Verificación

```bash
npm.cmd run lint
npm.cmd run build
```

Ambos comandos deben terminar sin errores antes de desplegar.

## Despliegue

El proyecto está preparado para Vercel:

```bash
vercel deploy
```

La función serverless del proxy se ejecuta automáticamente en producción.

## Licencia

MIT
