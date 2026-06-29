import { PublicClientApplication } from '@azure/msal-browser'

const msalConfig = {
  auth: {
    clientId: '70a9935f-ada2-45a8-9ec5-7c55eb5bb62d',
    authority: '901c038b-4638-4259-b115-c1753c7735aa',
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