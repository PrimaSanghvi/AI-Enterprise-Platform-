import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext'
import { TenantProvider } from './contexts/TenantContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TenantProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </TenantProvider>
  </StrictMode>,
)
