import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Reads client/.env*; real environment variables (e.g. from docker-compose) take priority.
  const env = loadEnv(mode, __dirname, ['VITE_', 'API_PROXY_TARGET'])
  // Backend URL for the dev proxy. docker-compose sets it to http://server:4000.
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:4000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': apiTarget,
        '/health': apiTarget,
      },
      // File change events don't cross Docker bind mounts on Windows/macOS; poll instead.
      watch: env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    },
  }
})
