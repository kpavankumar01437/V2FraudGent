const API_BASE_URL = (window.V2FRAUDGENT_API_BASE_URL || new URLSearchParams(window.location.search).get('api') || 'http://127.0.0.1:8012').replace(/\/$/, '');

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function setToast(message) {
  const existing = $('.toast');
  existing?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function closeMobileMenu() {
  $('#sidebar')?.classList.remove('open');
  $('[data-mobile-backdrop]')?.classList.remove('open');
  document.body.classList.remove('menu-open');
}

$('[data-menu-toggle]')?.addEventListener('click', () => {
  $('#sidebar')?.classList.add('open');
  $('[data-mobile-backdrop]')?.classList.add('open');
  document.body.classList.add('menu-open');
});

$('[data-mobile-backdrop]')?.addEventListener('click', closeMobileMenu);

$$('nav a').forEach((link) => {
  link.addEventListener('click', () => {
    $$('nav a').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
    closeMobileMenu();
  });
});

$('[data-review-queue]')?.addEventListener('click', () => {
  $('#transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setToast('Review queue opened. Live transaction filtering will connect to the API in the next integration stage.');
});

function renderAgentOffline(message) {
  const badge = $('[data-connection-badge]');
  const dot = $('[data-status-dot]');
  const statusText = $('[data-status-text]');

  badge?.classList.remove('checking', 'online');
  badge?.classList.add('offline');
  if (badge) badge.textContent = 'OFFLINE';

  if (dot) dot.style.background = '#ef9c9c';
  if (statusText) statusText.textContent = 'Research V2 offline';

  const copy = $('[data-connection-copy]');
  if (copy) copy.textContent = message || `Unable to reach ${API_BASE_URL}`;
}

function renderAgentOnline(health) {
  const badge = $('[data-connection-badge]');
  const dot = $('[data-status-dot]');
  const statusText = $('[data-status-text]');

  badge?.classList.remove('checking', 'offline');
  badge?.classList.add('online');
  if (badge) badge.textContent = 'ONLINE';
  if (dot) dot.style.background = '#9bd65b';
  if (statusText) statusText.textContent = 'Research V2 online';

  const copy = $('[data-connection-copy]');
  if (copy) copy.textContent = `${API_BASE_URL} · health endpoint responding`;
  if ($('[data-agent-model]')) $('[data-agent-model]').textContent = health.model_version || health.model || 'Research V2';
  if ($('[data-agent-features]')) $('[data-agent-features]').textContent = String(health.feature_count ?? '—');
  if ($('[data-agent-trees]')) $('[data-agent-trees]').textContent = String(health.model_trees ?? '—');

  const pill = $('[data-workspace-pill]');
  if (pill) pill.textContent = 'API connected';
}

async function checkAgent() {
  const badge = $('[data-connection-badge]');
  if (badge) {
    badge.classList.remove('online', 'offline');
    badge.classList.add('checking');
    badge.textContent = 'Checking';
  }

  const copy = $('[data-connection-copy]');
  if (copy) copy.textContent = `Connecting to ${API_BASE_URL}…`;

  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Health check returned HTTP ${response.status}`);
    }

    const health = await response.json();
    if (health?.status !== 'ok') {
      throw new Error('API responded without status=ok');
    }

    renderAgentOnline(health);
  } catch (error) {
    renderAgentOffline(error instanceof Error ? error.message : 'Unable to reach the API');
  }
}

$('[data-connect-agent]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Connecting…';
  await checkAgent();
  button.disabled = false;
  button.textContent = 'Reconnect';
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 700) closeMobileMenu();
});

const today = new Date();
const dateLabel = $('[data-today-label]');
if (dateLabel) {
  dateLabel.textContent = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(today).toUpperCase();
}

checkAgent();