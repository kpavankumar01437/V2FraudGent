// Runtime API configuration.
// Local development keeps the existing backend default on port 8012.
// Production deployments can serve the console and API from the same origin.
const localHosts = new Set(['127.0.0.1', 'localhost']);
const isLocalDev = localHosts.has(window.location.hostname) && window.location.port === '5500';

if (!isLocalDev) {
  window.V2FRAUDGENT_API_BASE_URL = window.location.origin;
}
