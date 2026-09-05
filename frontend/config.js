// Runtime API configuration.

const localHosts = new Set([
  '127.0.0.1',
  'localhost',
]);

const isLocalDev =
  localHosts.has(window.location.hostname) &&
  window.location.port === '5500';

if (isLocalDev) {
  // Local browser development.
  // app.js falls back to http://127.0.0.1:8012.
} else {
  // Production frontend hosted on Vercel.
  window.V2FRAUDGENT_API_BASE_URL =
    'https://www.V2FraudGent.com/public-api';
}