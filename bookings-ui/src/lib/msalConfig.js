import { PublicClientApplication } from '@azure/msal-browser'

const TENANT_ID = '901c038b-4638-4259-b115-c1753c7735aa'

const msalConfig = {
  auth: {
    clientId: '70a9935f-ada2-45a8-9ec5-7c55eb5bb62d',
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
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