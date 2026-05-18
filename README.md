# SigmaTracker

SigmaTracker es una aplicación web para el seguimiento y análisis de operaciones (trades) en **Polymarket**. Permite consultar el historial de trades de cualquier wallet, calcular el P&L (ganancias/pérdidas) por mercado y global, filtrar por tipo de resultado, criptomoneda y fecha, y visualizar estadísticas detalladas del rendimiento.

## Características principales

- Consulta el historial de trades de cualquier wallet de Polymarket.
- Cálculo automático de P&L (ganancias/pérdidas) por mercado y global.
- Filtros por resultado (ganadoras/perdedoras), criptomoneda y fecha.
- Balance total de la wallet calculado en tiempo real.
- Proxy serverless para evitar problemas de CORS con la API de Polymarket.
- Despliegue optimizado en **Vercel**.

## API utilizada

SigmaTracker consume la **Polymarket Data API**:

- **Base URL:** `https://data-api.polymarket.com`
- **Documentación oficial:** [https://docs.polymarket.com](https://docs.polymarket.com)

### Endpoint principal

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/trades?user={wallet}&limit={n}&offset={n}&takerOnly={bool}` | Obtiene el historial de trades de una wallet |

**Ejemplo de llamada:**
```
GET https://data-api.polymarket.com/trades?user=0xe1c70...&limit=500&offset=0&takerOnly=false
```

### Proxy serverless

Para evitar restricciones CORS, todas las peticiones a la API de Polymarket se enrutan a través de un proxy serverless incluido en el proyecto:

- **Ruta local:** `/api/polymarket/[...path]`
- **Archivo:** `api/polymarket/[...path].js`
- **Funcionamiento:** Reenvía cualquier petición de `/api/polymarket/*` hacia `https://data-api.polymarket.com/*`, propagando método, cabeceras y cuerpo.

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

   > **Nota:** En desarrollo local, el proxy serverless no está activo. Para probarlo con el proxy, despliega en Vercel o usa `vercel dev` localmente (requiere [Vercel CLI](https://vercel.com/docs/cli)).

4. Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor de desarrollo con HMR |
| `npm run build` | Genera el build de producción |
| `npm run preview` | Previsualiza el build de producción |
| `npm run lint` | Ejecuta ESLint sobre el proyecto |

## Estructura del proyecto

```
SigmaTracker/
├── api/
│   └── polymarket/
│       └── [...path].js   # Proxy serverless hacia Polymarket Data API
├── public/                # Recursos estáticos
├── src/
│   ├── App.jsx            # Componente principal (lógica y UI)
│   ├── App.css            # Estilos de la aplicación
│   └── main.jsx           # Punto de entrada
├── vercel.json            # Configuración de despliegue en Vercel
├── vite.config.js         # Configuración de Vite
└── eslint.config.js       # Configuración de ESLint
```

## Tecnologías utilizadas

- [React 19](https://react.dev/)
- [Vite 8](https://vitejs.dev/)
- [JavaScript (ES6+)](https://developer.mozilla.org/es/docs/Web/JavaScript)
- [Polymarket Data API](https://docs.polymarket.com)
- [Vercel](https://vercel.com/) (despliegue y serverless functions)
- ESLint

## Despliegue

El proyecto está configurado para desplegarse en **Vercel**. El proxy serverless en `api/polymarket/[...path].js` se ejecuta automáticamente como una Vercel Function al hacer el deploy.

```bash
vercel deploy
```

## Licencia

MIT
