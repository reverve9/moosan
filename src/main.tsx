import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/theme/index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for PWA install eligibility.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* swallow — install prompt simply won't appear if SW fails */
    })
  })
}
