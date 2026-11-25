import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { clearReloadFlag, reloadForNewVersion } from '@/components/error-boundary'

// A page's code file failed to load, usually because the app was rebuilt while this tab was open.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})
clearReloadFlag()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
