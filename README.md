# Polymarket Tracker

Este proyecto es una aplicación para rastrear y visualizar operaciones (trades) en Polymarket, una plataforma de mercados de predicción descentralizados. Permite consultar, analizar y mostrar información relevante sobre los trades realizados en diferentes mercados, facilitando el seguimiento y análisis de tendencias.

## Características principales
- Consulta de operaciones recientes en Polymarket.
- Visualización de datos de trades en tiempo real o bajo demanda.
- Interfaz amigable construida con React y Vite.
- API propia para obtener y procesar datos de trades.

## Estructura del proyecto
- `src/`: Código fuente del frontend (React).
- `api/`: Endpoints para la obtención de datos de trades.
- `index.html`, `vite.config.js`, `package.json`: Configuración general del proyecto.

## Requisitos previos
- Node.js >= 18.x
- npm >= 9.x

## Instalación y ejecución

1. Instala las dependencias:
   ```powershell
   npm install
   ```

2. Inicia el servidor de desarrollo:
   ```powershell
   npm run dev
   ```

3. Accede a la aplicación en tu navegador en la URL que aparece en consola (por defecto: http://localhost:5173).

## Despliegue

El proyecto está preparado para ser desplegado en Vercel. Puedes modificar `vercel.json` según tus necesidades.

## Licencia

MIT

