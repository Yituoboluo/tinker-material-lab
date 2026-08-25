import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const loader = document.getElementById('app-loader')
if (loader) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      loader.classList.add('is-ready')
      window.setTimeout(() => loader.remove(), 240)
    })
  })
}
