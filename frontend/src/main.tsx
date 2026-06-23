import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './auth/AuthContext'
import { AuthGate } from './auth/AuthGate'
import { ThemeProvider } from './contexts/ThemeContext'
import { TenantProvider } from './contexts/TenantContext'
import { loadRuntimeConfig } from './auth/authClient'

// Resolve runtime config (Google client ID) from the gateway before rendering,
// so the login page reads it from the deployed env rather than a build-time value.
async function bootstrap() {
  await loadRuntimeConfig()
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
}

bootstrap()
