import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './auth/AuthContext'
import { AuthGate } from './auth/AuthGate'
import { ThemeProvider } from './contexts/ThemeContext'
import { TenantProvider } from './contexts/TenantContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TenantProvider>
      <ThemeProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </TenantProvider>
  </StrictMode>,
)
