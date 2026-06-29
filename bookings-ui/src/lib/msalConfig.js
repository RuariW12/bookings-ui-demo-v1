import { PublicClientApplication } from '@azure/msal-browser'

const msalConfig = {
  auth: {
    clientId: 'PLACEHOLDER-CLIENT-ID',
    authority: 'https://login.microsoftonline.com/PLACEHOLDER-TENANT-ID',
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