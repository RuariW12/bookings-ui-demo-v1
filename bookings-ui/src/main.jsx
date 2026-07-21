import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'
import { AuthProvider } from './lib/auth.jsx'
import { msalInstance } from './lib/msalConfig.js'

async function bootstrap() {
  await msalInstance.initialize()

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </StrictMode>,
  )
}

bootstrap()