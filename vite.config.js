import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/trades-proxy': {
        target: 'https://data-api.polymarket.com',
        changeOrigin: true,
        rewrite: path => path.replace('/trades-proxy', '/trades'),
      }
    }
  }
})