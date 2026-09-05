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

function formatAmount(amount, currency = 'INR') {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return '—';
  }

  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(numericAmount);
  }

  return `${numericAmount.toFixed(2)} ${currency}`;
}

function formatTransactionTime(createdAt) {
  const timestamp = Number(createdAt);

  if (!Number.isFinite(timestamp)) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function scoreClass(score) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) {
    return 'low';
  }

  if (numericScore >= 0.85) {
    return 'high-score';
  }

  if (numericScore >= 0.55) {
    return 'medium-score';
  }

  return 'low';
}

function decisionClass(action) {
  return action === 'ALLOW_MONITOR'
    ? 'allowed'
    : 'review';
}

function renderTransactions(transactions) {
  const body = $('[data-transactions-body]');

  if (!body) {
    return;
  }

  body.replaceChildren();

  if (!Array.isArray(transactions) || transactions.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');

    cell.colSpan = 5;
    cell.innerHTML = '<span class="muted">No live decisions yet.</span>';

    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  transactions.forEach((transaction) => {
    const row = document.createElement('tr');

    const transactionCell = document.createElement('td');
    const transactionStrong = document.createElement('strong');
    const transactionSmall = document.createElement('small');

    transactionStrong.textContent =
      transaction.transaction_id || 'Unknown transaction';

    transactionSmall.textContent =
      `${transaction.risk_zone || 'UNKNOWN'} · Research V2`;

    transactionCell.append(
      transactionStrong,
      transactionSmall
    );

    const timeCell = document.createElement('td');
    timeCell.textContent = formatTransactionTime(
      transaction.created_at
    );

    const amountCell = document.createElement('td');
    amountCell.textContent = formatAmount(
      transaction.amount,
      transaction.currency
    );

    const scoreCell = document.createElement('td');
    const score = document.createElement('span');
    score.className = `score ${scoreClass(
      transaction.calibrated_risk_score
    )}`;

    score.textContent = Number.isFinite(
      Number(transaction.calibrated_risk_score)
    )
      ? Number(transaction.calibrated_risk_score).toFixed(3)
      : '—';

    scoreCell.appendChild(score);

    const decisionCell = document.createElement('td');
    const decision = document.createElement('span');

    decision.className =
      `decision ${decisionClass(
        transaction.recommended_action
      )}`;

    decision.textContent =
      transaction.recommended_action === 'ALLOW_MONITOR'
        ? 'Allowed'
        : 'Review';

    decisionCell.appendChild(decision);

    row.append(
      transactionCell,
      timeCell,
      amountCell,
      scoreCell,
      decisionCell
    );

    body.appendChild(row);
  });
}

async function loadTransactions() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/transactions?limit=10`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      throw new Error(
        `Transaction endpoint returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (data?.status !== 'ok') {
      throw new Error(
        'Transaction endpoint responded without status=ok'
      );
    }

    renderTransactions(data.transactions);
  } catch (error) {
    renderTransactions([]);

    console.error(
      'Unable to load live transactions:',
      error
    );
  }
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
loadTransactions();