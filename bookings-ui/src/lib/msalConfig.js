import { PublicClientApplication } from '@azure/msal-browser'

const envOr = (v, fallback) => (!v || v === 'UNSET' ? fallback : v)

const CLIENT_ID = envOr(import.meta.env.VITE_ENTRA_CLIENT_ID, '70a9935f-ada2-45a8-9ec5-7c55eb5bb62d')
const TENANT_ID = envOr(import.meta.env.VITE_ENTRA_TENANT_ID, '901c038b-4638-4259-b115-c1753c7735aa')

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

export const loginRequest = {
  scopes: ['User.Read'],
}

export const msalInstance = new PublicClientApplication(msalConfig)