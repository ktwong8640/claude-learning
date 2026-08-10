// Copy this file to js/google-config.js and fill in your own values, then commit it —
// GitHub Pages only serves what's in the repo, and there's no build step to inject
// secrets at deploy time. See README.md → "Google Drive & Sheets sync" for how to get a
// Client ID and API key.
//
// Neither value here is a secret you need to protect like a password: the Client ID is
// meant to be public (it only works from the origins you authorize in Google Cloud
// Console), and the API key should be locked down to HTTP referrers + the Picker API
// there too. That's what makes committing this file safe.
//
// NEVER put a Client Secret here or anywhere in this repo. This app's client-side OAuth
// flow doesn't use one — unlike the two values below, a Client Secret is a real
// credential and publishing it would be a genuine security problem.
//
// (If you'd rather keep even these two values out of git history, add js/google-config.js
// back to .gitignore and inject it at deploy time instead — e.g. a GitHub Actions secret.)

window.GOOGLE_CONFIG = {
  // OAuth 2.0 Client ID (Web application) from Google Cloud Console → APIs & Services → Credentials.
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',

  // Browser API key from the same Credentials page, restricted to your site's origin(s).
  // Only used to open the Google Drive folder picker.
  apiKey: 'YOUR_API_KEY',
};
