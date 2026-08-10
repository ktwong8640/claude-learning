// Copy this file to js/google-config.js (already gitignored) and fill in your own values.
// See README.md → "Google Drive & Sheets sync" for how to get a Client ID and API key.
//
// Neither value here is a secret you need to protect like a password: the Client ID is
// meant to be public (it only works from the origins you authorize in Google Cloud
// Console), and the API key should be locked down to HTTP referrers there too. That's
// what makes a pure client-side integration like this safe without a backend server.

window.GOOGLE_CONFIG = {
  // OAuth 2.0 Client ID (Web application) from Google Cloud Console → APIs & Services → Credentials.
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',

  // Browser API key from the same Credentials page, restricted to your site's origin(s).
  // Only used to open the Google Drive folder picker.
  apiKey: 'YOUR_API_KEY',
};
