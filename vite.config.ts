import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Extra hostnames the dev server answers on (a tunnel, a LAN name…), from ALLOWED_HOSTS in .env.
  const allowedHosts = (loadEnv(mode, process.cwd(), '').ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    // Only scan the app's real entry for dependencies.
    optimizeDeps: { entries: ['index.html'] },
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts,
      proxy: { '/api': 'http://localhost:3001' },
      // The API writes the SQLite db and sessions here; never watch or reload on them.
      watch: { ignored: ['**/data/**', '**/server/**'] },
    },
  }
})
