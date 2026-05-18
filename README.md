# SigmaTracker

SigmaTracker es una aplicación web para el seguimiento y análisis avanzado de operaciones (trades) en **Polymarket**. Proporciona métricas profesionales de trading: P&L desglosado en bruto/fees/neto, estadísticas por token, winrate, racha, profit factor y análisis detallado por mercado.

## Características principales

### 📊 Dashboard de resumen global
| Métrica | Descripción |
|---|---|
| **P&L Neto** | Ganancias/pérdidas después de fees |
| **P&L Bruto** | Ganancias/pérdidas antes de fees |
| **Fees totales** | Total de comisiones pagadas |
| **Retorno %** | Rentabilidad sobre capital invertido |
| **Winrate** | % de mercados cerrados en positivo |
| **Profit Factor** | Ratio ganancias brutas / pérdidas brutas |
| **Avg Win / Loss** | Media de ganancia por win vs pérdida por loss |
| **Mayor ganancia** | Mejor operación individual |
| **Mayor pérdida** | Peor operación individual |
| **Racha actual** | 🔥 streak ganador / ❄️ streak perdedor |
| **Balance wallet** | Flujo neto de capital (entradas - salidas) |
| **Invertido** | Capital total desplegado |

### 🪙 P&L por token (colapsable)
Desglose automático por activo detectado en el título del mercado (BTC, ETH, SOL, XRP…):
- P&L Neto y Fees por token
- Winrate individual (X ganadas / N totales)
- Capital invertido por token

### 🔍 Análisis por mercado (expandible al hacer clic)
Cada fila muestra en cabecera:
- Número total de trades, compras (B) vs ventas (S)
- Capital invertido y duración del mercado
- P&L Bruto, Fees y P&L Neto
- Badge **"⚠ Fees consuming X% of profits"** (naranja/rojo si impacto > 10 / 30%)

Al expandir, se despliega un grid con:
| Métrica | Descripción |
|---|---|
| P&L Bruto / Fees / Neto | Desglose completo de resultado |
| Compras / Ventas | Nº y volumen por lado |
| Precio medio entrada | Precio ponderado de todas las compras |
| Precio medio salida | Precio ponderado de todas las ventas |
| Tamaño medio de trade | Unidades medias por operación |
| Primer / Último trade | Timestamps de apertura y cierre |
| Duración | Tiempo entre primera y última operación |

Además incluye el **log individual** de cada trade: lado, precio, tamaño, fecha/hora y fee %.

### 🔎 Filtros
- **Por resultado:** Todos / Ganadoras / Perdedoras
- **Por token:** pills dinámicos por cada criptomoneda detectada
- **Por fecha:** selector de fecha con botón de reset

### ⚠️ Alerta de fees global
Si el total de fees supera el 5% del P&L bruto, se muestra un banner de advertencia con el porcentaje exacto.

---

## API utilizada

SigmaTracker consume la **Polymarket Data API**:

- **Base URL:** `https://data-api.polymarket.com`
- **Documentación oficial:** [https://docs.polymarket.com](https://docs.polymarket.com)

### Endpoint principal

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/trades?user={wallet}&limit={n}&offset={n}&takerOnly={bool}` | Historial de trades de una wallet |

**Ejemplo:**
```
GET https://data-api.polymarket.com/trades?user=0xe1c70...&limit=500&offset=0&takerOnly=false
```

### Proxy serverless (CORS)

Todas las peticiones se enrutan a través de un proxy serverless incluido en el proyecto:

- **Ruta local:** `/api/polymarket/[...path]`
- **Archivo:** `api/polymarket/[...path].js`
- **Funcionamiento:** Reenvía cualquier petición de `/api/polymarket/*` hacia `https://data-api.polymarket.com/*`, propagando método, cabeceras y cuerpo.

---

## Instalación y uso local

1. Clona el repositorio:
   ```bash
   git clone <URL-del-repositorio>
   cd SigmaTracker
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Inicia la aplicación en modo desarrollo:
   ```bash
   npm run dev
   ```

   > **Nota:** En desarrollo local el proxy serverless no está activo. Para probarlo con el proxy, usa `vercel dev` ([Vercel CLI](https://vercel.com/docs/cli)).

4. Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

---

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor de desarrollo con HMR |
| `npm run build` | Genera el build de producción |
| `npm run preview` | Previsualiza el build de producción |
| `npm run lint` | Ejecuta ESLint sobre el proyecto |

---

## Estructura del proyecto

```
SigmaTracker/
├── api/
│   └── polymarket/
│       └── [...path].js   # Proxy serverless → Polymarket Data API
├── public/                # Recursos estáticos (favicon, iconos)
├── src/
│   ├── App.jsx            # Componente principal: lógica, cálculos y UI
│   ├── App.css            # Estilos de la aplicación
│   └── main.jsx           # Punto de entrada React
├── vercel.json            # Configuración de despliegue en Vercel
├── vite.config.js         # Configuración de Vite
└── eslint.config.js       # Configuración de ESLint
```

---

## Tecnologías utilizadas

- [React 19](https://react.dev/)
- [Vite 8](https://vitejs.dev/)
- [JavaScript ES6+](https://developer.mozilla.org/es/docs/Web/JavaScript)
- [Polymarket Data API](https://docs.polymarket.com)
- [Vercel](https://vercel.com/) — despliegue + serverless functions
- ESLint

---

## Despliegue en Vercel

El proyecto está configurado para desplegarse en **Vercel**. El proxy serverless se ejecuta automáticamente como una Vercel Function.

```bash
vercel deploy
```

---

## Licencia

MIT
