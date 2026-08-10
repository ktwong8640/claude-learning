// Committed intentionally: neither value below is a secret. The Client ID only works from
// the origins authorized in Google Cloud Console, and the API key is restricted there to
// this site's origin and the Google Picker API only. Never put a Client Secret here — this
// app's client-side OAuth flow doesn't use one, and it would be unsafe to publish.

window.GOOGLE_CONFIG = {
  clientId: '76259355647-ntet92ggqpl6sojbaobpk58ar39b2dmd.apps.googleusercontent.com',
  apiKey: 'AIzaSyCrZ4PprbZkBTCGGwQZdhck4G8TTsLFVqw',
};
