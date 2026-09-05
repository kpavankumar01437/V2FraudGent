const API_BASE_URL = (window.V2FRAUDGENT_API_BASE_URL || new URLSearchParams(window.location.search).get('api') || 'http://127.0.0.1:8012').replace(/\/$/, '');

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let transactions = [];
let transactionFilter = 'all';

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

function scrollToTransactions() {
  $('#transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getVisibleTransactions(items = transactions) {
  if (transactionFilter === 'review') {
    return items.filter((item) => item.recommended_action !== 'ALLOW_MONITOR');
  }
  return items;
}

function setTransactionFilter(filter) {
  transactionFilter = filter;
  renderTransactions(getVisibleTransactions());

  const visibleCount = getVisibleTransactions().length;
  const message = filter === 'review'
    ? `Showing ${visibleCount} review decision(s).`
    : `Showing ${visibleCount} live decision(s).`;

  setToast(message);
}

function showModal(title, subtitle, contentBuilder) {
  const existing = $('#v2-modal');
  existing?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'v2-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999', 'display:flex',
    'align-items:center', 'justify-content:center', 'padding:24px',
    'background:rgba(7,10,14,.62)', 'backdrop-filter:blur(6px)'
  ].join(';');

  const panel = document.createElement('section');
  panel.style.cssText = [
    'width:min(620px,100%)', 'max-height:min(760px,90vh)', 'overflow:auto',
    'background:#12161c', 'border:1px solid rgba(255,255,255,.10)',
    'border-radius:18px', 'box-shadow:0 24px 80px rgba(0,0,0,.42)',
    'padding:24px', 'color:#f4f7fa'
  ].join(';');

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px;';

  const headingWrap = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = title;
  heading.style.margin = '0 0 6px';
  const sub = document.createElement('p');
  sub.textContent = subtitle;
  sub.style.cssText = 'margin:0;opacity:.68;font-size:14px;line-height:1.5;';
  headingWrap.append(heading, sub);

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close dialog');
  close.textContent = '×';
  close.style.cssText = 'border:0;background:rgba(255,255,255,.07);color:inherit;border-radius:10px;width:36px;height:36px;font-size:24px;line-height:1;cursor:pointer;';
  close.addEventListener('click', () => overlay.remove());

  head.append(headingWrap, close);

  const content = document.createElement('div');
  contentBuilder(content);

  panel.append(head, content);
  overlay.appendChild(panel);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  close.focus();
}

function addDetailRow(container, label, value) {
  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:170px 1fr;gap:16px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);';
  const labelNode = document.createElement('span');
  labelNode.textContent = label;
  labelNode.style.opacity = '.62';
  const valueNode = document.createElement('strong');
  valueNode.textContent = value;
  valueNode.style.fontWeight = '600';
  row.append(labelNode, valueNode);
  container.appendChild(row);
}

function showModelDetails() {
  showModal(
    'Research V2 policy details',
    'Frozen configuration currently reported by the scoring service.',
    (content) => {
      addDetailRow(content, 'Model', 'research_v2_65_15_20');
      addDetailRow(content, 'Feature count', '92');
      addDetailRow(content, 'Trees', '860');
      addDetailRow(content, 'Review threshold', '0.55');
      addDetailRow(content, 'High-risk threshold', '0.85');
      addDetailRow(content, 'Calibration', 'Sigmoid logit calibration');
      addDetailRow(content, 'Decision mode', 'Research V2 chronological scoring');
      addDetailRow(content, 'Webhook scope', 'payment.captured');
      const note = document.createElement('p');
      note.textContent = 'The browser does not perform fraud scoring. Decisions come from the canonical Research V2 API runtime.';
      note.style.cssText = 'margin:18px 0 0;opacity:.72;line-height:1.6;font-size:14px;';
      content.appendChild(note);
    }
  );
}

function showTransactionDetails(transaction) {
  showModal(
    transaction.transaction_id || 'Transaction details',
    'Decision returned by the Research V2 scoring API.',
    (content) => {
      addDetailRow(content, 'Transaction', transaction.transaction_id || 'Unknown');
      addDetailRow(content, 'Time', formatTransactionTime(transaction.created_at));
      addDetailRow(content, 'Amount', formatAmount(transaction.amount, transaction.currency));
      addDetailRow(content, 'Risk score', Number.isFinite(Number(transaction.calibrated_risk_score)) ? Number(transaction.calibrated_risk_score).toFixed(6) : '—');
      addDetailRow(content, 'Risk zone', transaction.risk_zone || '—');
      addDetailRow(content, 'Decision', transaction.recommended_action || '—');
      addDetailRow(content, 'Event ID', transaction.event_id || '—');

      const evidenceTitle = document.createElement('h3');
      evidenceTitle.textContent = 'Evidence';
      evidenceTitle.style.cssText = 'margin:20px 0 8px;font-size:15px;';
      content.appendChild(evidenceTitle);

      const evidence = [
        ...(Array.isArray(transaction.primary_evidence) ? transaction.primary_evidence : []),
        ...(Array.isArray(transaction.supporting_evidence) ? transaction.supporting_evidence : []),
      ];

      if (evidence.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No evidence items were returned for this decision.';
        empty.style.opacity = '.68';
        content.appendChild(empty);
        return;
      }

      const list = document.createElement('ul');
      list.style.cssText = 'margin:0;padding-left:20px;line-height:1.7;';
      evidence.forEach((item) => {
        const entry = document.createElement('li');
        entry.textContent = typeof item === 'string' ? item : JSON.stringify(item);
        list.appendChild(entry);
      });
      content.appendChild(list);
    }
  );
}

function openSearch() {
  showModal(
    'Search live decisions',
    'Search the transactions currently returned by the audit API.',
    (content) => {
      const input = document.createElement('input');
      input.type = 'search';
      input.placeholder = 'Transaction ID, risk zone, decision…';
      input.autocomplete = 'off';
      input.style.cssText = 'width:100%;box-sizing:border-box;background:#0d1117;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:12px 14px;font:inherit;outline:none;';

      const resultNote = document.createElement('p');
      resultNote.style.cssText = 'margin:12px 0 0;opacity:.68;font-size:13px;';

      const applySearch = () => {
        const query = input.value.trim().toLowerCase();
        if (!query) {
          resultNote.textContent = `${transactions.length} live decision(s) available.`;
          transactionFilter = 'all';
          renderTransactions(transactions);
          return;
        }

        const matches = transactions.filter((item) => {
          const haystack = [
            item.transaction_id,
            item.risk_zone,
            item.recommended_action,
            item.event_id,
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(query);
        });

        resultNote.textContent = `${matches.length} matching decision(s).`;
        transactionFilter = 'search';
        renderTransactions(matches);
        scrollToTransactions();
      };

      input.addEventListener('input', applySearch);
      content.append(input, resultNote);
      resultNote.textContent = `${transactions.length} live decision(s) available.`;
      window.setTimeout(() => input.focus(), 0);
    }
  );
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
  setTransactionFilter('review');
  scrollToTransactions();
});

$$('a[href="#transactions"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    setTransactionFilter('all');
    scrollToTransactions();
  });
});

$$('a[href="#model"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    showModelDetails();
  });
});

$('.icon-btn')?.addEventListener('click', openSearch);
$('.shortcut')?.addEventListener('click', openSearch);

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
  }
  if (event.key === 'Escape') {
    $('#v2-modal')?.remove();
  }
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

function renderTransactions(items) {
  const body = $('[data-transactions-body]');

  if (!body) {
    return;
  }

  body.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');

    cell.colSpan = 5;
    const message = transactionFilter === 'review'
      ? 'No review decisions in the current live audit window.'
      : 'No live decisions yet.';
    const muted = document.createElement('span');
    muted.className = 'muted';
    muted.textContent = message;
    cell.appendChild(muted);

    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  items.forEach((transaction) => {
    const row = document.createElement('tr');
    row.tabIndex = 0;
    row.style.cursor = 'pointer';

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

    const openDetails = () => showTransactionDetails(transaction);
    row.addEventListener('click', openDetails);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetails();
      }
    });

    body.appendChild(row);
  });
}

async function loadTransactions() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/transactions?limit=50`,
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

    transactions = Array.isArray(data.transactions)
      ? data.transactions
      : [];

    renderTransactions(getVisibleTransactions());
  } catch (error) {
    transactions = [];
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
  await loadTransactions();
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
