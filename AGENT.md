# AGENT.md

## Lógica y estructura del proyecto

### 1. Frontend (React)
- Ubicado en `src/`.
- Utiliza React (JSX) y Vite para desarrollo rápido y recarga en caliente.
- El punto de entrada es `src/main.jsx`, que monta el componente principal `App.jsx`.
- `App.jsx` gestiona la lógica de visualización y consumo de la API.
- El cálculo de P&L (Profit & Loss) se realiza en el frontend, agrupando operaciones por mercado y outcome, y calculando el beneficio al cerrar posiciones (venta).
- Se muestra el precio medio de entrada (`entryPrice`) y el P&L de cada trade cerrado.

### 2. Backend/API
- Ubicado en `api/`.
- El archivo principal es `api/trades.js`, que expone endpoints para obtener datos de trades desde Polymarket.
- La API actúa como proxy y no realiza cálculos de P&L, solo retorna los datos crudos de Polymarket.

### 3. Configuración y despliegue
- `vite.config.js` configura el entorno de desarrollo y build.
- `vercel.json` permite el despliegue automático en Vercel, incluyendo rutas para la API.

## Optimización para IA
- La lógica de agrupación y cálculo de P&L está centralizada en `computePnL` en el frontend.
- Para optimizar el uso de IA, se recomienda estructurar los datos de entrada (trades) de forma consistente, asegurando que los campos `side`, `size`, `price`, `market`, `outcome` estén presentes y normalizados.
- Si se desea delegar el cálculo de P&L a la IA, proporcionar siempre el historial completo de operaciones ordenado por fecha.
- Para análisis avanzados (predicción, clustering, etc.), exportar los datos en formato JSON estructurado.

## Ejemplo de estructura de trade
```json
{
  "side": "BUY" | "SELL",
  "size": 5,
  "price": 0.9,
  "market": "...",
  "outcome": "Up",
  "timestamp": 1776151173,
  ...
}
```

## Recomendaciones
- Mantener la consistencia de los datos para facilitar el análisis automatizado.
- Documentar cualquier cambio en la estructura de los datos o lógica de cálculo.
- Para IA, proveer ejemplos de datos y resultados esperados para facilitar el entrenamiento o ajuste de modelos.
