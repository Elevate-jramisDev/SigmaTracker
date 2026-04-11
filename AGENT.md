# AGENT.md

## Lógica y estructura del proyecto

### 1. Frontend (React)
- Ubicado en `src/`.
- Utiliza React (JSX) y Vite para desarrollo rápido y recarga en caliente.
- El punto de entrada es `src/main.jsx`, que monta el componente principal `App.jsx`.
- `App.jsx` gestiona la lógica de visualización y consumo de la API.

### 2. Backend/API
- Ubicado en `api/`.
- El archivo principal es `api/trades.js`, que expone endpoints para obtener datos de trades desde Polymarket.
- La API puede ser consumida tanto por el frontend como por otros servicios.

### 3. Configuración y despliegue
- `vite.config.js` configura el entorno de desarrollo y build.
- `vercel.json` permite el despliegue automático en Vercel, incluyendo rutas para la API.

## Optimización para uso de IA

- **Separación clara de responsabilidades:** El frontend y la API están desacoplados, facilitando la extensión o integración de agentes inteligentes.
- **Estructura modular:** Permite añadir fácilmente nuevos endpoints, componentes o lógica de IA.
- **Documentación y convenciones:** El código sigue convenciones estándar de React y Node.js, facilitando la comprensión y modificación por agentes automáticos.
- **Puntos de integración sugeridos:**
  - Añadir lógica de IA en la API (`api/`) para análisis avanzado de trades.
  - Crear hooks o componentes en React para mostrar recomendaciones generadas por IA.
  - Utilizar archivos de configuración (`package.json`, `vercel.json`) para definir scripts automáticos o flujos de CI/CD.

## Recomendaciones para agentes
- Analizar y modificar la lógica de la API para implementar nuevas estrategias de análisis.
- Añadir tests automáticos para asegurar la robustez de los cambios.
- Mantener la documentación actualizada para facilitar futuras integraciones.

