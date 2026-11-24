import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // Only scan the app's real entry for dependencies.
  optimizeDeps: { entries: ['index.html'] },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
    // The API writes the SQLite db and sessions here; never watch or reload on them.
    watch: { ignored: ['**/data/**', '**/server/**'] },
  },
})
