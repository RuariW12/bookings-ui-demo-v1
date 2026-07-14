import { PublicClientApplication } from '@azure/msal-browser'

// Client/tenant IDs are not secrets (they ship in the browser bundle), but they
// differ per environment. infra/main.tf writes VITE_ENTRA_* into .env at boot and
// leaves them as the literal "UNSET" when no value is configured, so treat that
// as absent and fall back to the dev app registration.
const envOr = (v, fallback) => (!v || v === 'UNSET' ? fallback : v)

const CLIENT_ID = envOr(import.meta.env.VITE_ENTRA_CLIENT_ID, '70a9935f-ada2-45a8-9ec5-7c55eb5bb62d')
const TENANT_ID = envOr(import.meta.env.VITE_ENTRA_TENANT_ID, '901c038b-4638-4259-b115-c1753c7735aa')

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    // Authority is a URL, not a bare tenant GUID. Single-tenant: the tenant ID
    // pins sign-in to the Strategy directory.
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    // Adapts to wherever the app is served, so localhost and prod need no code
    // change. Each origin still has to be registered in Entra.
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

export const loginRequest = {
  scopes: ['User.Read', 'Mail.Send'],
}

export const msalInstance = new PublicClientApplication(msalConfig)

export async function getGraphToken() {
  const account = msalInstance.getAllAccounts()[0]
  if (!account) throw new Error('No signed-in account')
  const result = await msalInstance.acquireTokenSilent({
    scopes: ['Mail.Send'],
    account,
  })
  return result.accessToken
}