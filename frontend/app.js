const API_BASE_URL = (window.V2FRAUDGENT_API_BASE_URL || new URLSearchParams(window.location.search).get('api') || 'http://127.0.0.1:8012').replace(/\/$/, '');

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let transactions = [];
let transactionFilter = 'all';
let lastHealth = null;

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

function formatAmount(amount, currency = 'INR') {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '—';

  if (String(currency).toUpperCase() === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(numericAmount);
  }

  return `${numericAmount.toFixed(2)} ${String(currency).toUpperCase()}`;
}

function formatTransactionTime(createdAt) {
  const timestamp = Number(createdAt);
  if (!Number.isFinite(timestamp)) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function formatTransactionDate(createdAt) {
  const timestamp = Number(createdAt);
  if (!Number.isFinite(timestamp)) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function scoreClass(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return 'low';
  if (numericScore >= 0.85) return 'high-score';
  if (numericScore >= 0.55) return 'medium-score';
  return 'low';
}

function decisionClass(action) {
  return action === 'ALLOW_MONITOR' ? 'allowed' : 'review';
}

function getVisibleTransactions(items = transactions) {
  if (transactionFilter === 'review') {
    return items.filter((item) => item.recommended_action !== 'ALLOW_MONITOR');
  }
  return items;
}

function showModal(title, subtitle, contentBuilder) {
  const existing = $('#v2-modal');
  existing?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'v2-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const panel = document.createElement('section');
  panel.className = 'v2-modal-panel';

  const head = document.createElement('div');
  head.className = 'v2-modal-head';

  const headingWrap = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = title;
  heading.style.margin = '0 0 6px';

  const sub = document.createElement('p');
  sub.textContent = subtitle;
  sub.className = 'muted';
  sub.style.margin = '0';

  headingWrap.append(heading, sub);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'v2-modal-close';
  close.setAttribute('aria-label', 'Close dialog');
  close.textContent = '×';
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
  row.className = 'v2-detail-row';

  const labelNode = document.createElement('span');
  labelNode.textContent = label;

  const valueNode = document.createElement('strong');
  valueNode.textContent = value ?? '—';

  row.append(labelNode, valueNode);
  container.appendChild(row);
}

function showModelDetails() {
  const health = lastHealth || {};

  showModal(
    'Research V2 policy details',
    'Configuration reported by the connected scoring service.',
    (content) => {
      addDetailRow(content, 'Model', health.model_version || health.model || 'research_v2');
      addDetailRow(content, 'Feature count', String(health.feature_count ?? '—'));
      addDetailRow(content, 'Trees', String(health.model_trees ?? '—'));
      addDetailRow(content, 'Review threshold', String(health.review_threshold ?? '—'));
      addDetailRow(content, 'High-risk threshold', String(health.high_threshold ?? '—'));
      addDetailRow(content, 'Calibration', 'Sigmoid logit calibration');
      addDetailRow(content, 'Decision mode', 'Research V2 chronological scoring');
      addDetailRow(content, 'Webhook scope', 'payment.captured');

      const note = document.createElement('p');
      note.textContent = 'The browser does not perform fraud scoring. Decisions come from the canonical Research V2 API runtime.';
      note.className = 'muted';
      note.style.margin = '18px 0 0';
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
      addDetailRow(content, 'Date', formatTransactionDate(transaction.created_at));
      addDetailRow(content, 'Amount', formatAmount(transaction.amount, transaction.currency));
      addDetailRow(content, 'Raw probability', Number.isFinite(Number(transaction.raw_probability)) ? Number(transaction.raw_probability).toFixed(6) : '—');
      addDetailRow(content, 'Calibrated score', Number.isFinite(Number(transaction.calibrated_risk_score)) ? Number(transaction.calibrated_risk_score).toFixed(6) : '—');
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
        empty.className = 'muted';
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
    'Search the decisions currently loaded from the audit API.',
    (content) => {
      const input = document.createElement('input');
      input.type = 'search';
      input.placeholder = 'Transaction ID, risk zone, decision…';
      input.autocomplete = 'off';
      input.setAttribute('aria-label', 'Search live decisions');
      input.className = 'v2-search-input';

      const resultNote = document.createElement('p');
      resultNote.className = 'muted';
      resultNote.style.margin = '12px 0 0';

      const applySearch = () => {
        const query = input.value.trim().toLowerCase();
        transactionFilter = query ? 'search' : 'all';

        const matches = query
          ? transactions.filter((item) => {
              const haystack = [
                item.transaction_id,
                item.risk_zone,
                item.recommended_action,
                item.event_id,
              ].filter(Boolean).join(' ').toLowerCase();
              return haystack.includes(query);
            })
          : transactions;

        resultNote.textContent = query
          ? `${matches.length} matching decision(s).`
          : `${transactions.length} live decision(s) available.`;

        renderTransactions(matches);
      };

      input.addEventListener('input', applySearch);
      content.append(input, resultNote);
      resultNote.textContent = `${transactions.length} live decision(s) available.`;
      window.setTimeout(() => input.focus(), 0);
    }
  );
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

function renderTransactions(items) {
  const body = $('[data-transactions-body]');
  if (!body) return;

  body.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;

    const muted = document.createElement('span');
    muted.className = 'muted';
    muted.textContent = transactionFilter === 'review'
      ? 'No review decisions in the loaded live audit window.'
      : transactionFilter === 'search'
        ? 'No decisions match this search.'
        : 'No live decisions yet.';

    cell.appendChild(muted);
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  items.forEach((transaction) => {
    const row = document.createElement('tr');
    row.tabIndex = 0;
    row.style.cursor = 'pointer';
    row.setAttribute('aria-label', `Open details for ${transaction.transaction_id || 'transaction'}`);

    const transactionCell = document.createElement('td');
    const transactionStrong = document.createElement('strong');
    const transactionSmall = document.createElement('small');
    transactionStrong.textContent = transaction.transaction_id || 'Unknown transaction';
    transactionSmall.textContent = `${transaction.risk_zone || 'UNKNOWN'} · Research V2`;
    transactionCell.append(transactionStrong, transactionSmall);

    const timeCell = document.createElement('td');
    timeCell.textContent = formatTransactionTime(transaction.created_at);

    const amountCell = document.createElement('td');
    amountCell.textContent = formatAmount(transaction.amount, transaction.currency);

    const scoreCell = document.createElement('td');
    const score = document.createElement('span');
    score.className = `score ${scoreClass(transaction.calibrated_risk_score)}`;
    const numericScore = Number(transaction.calibrated_risk_score);
    score.textContent = Number.isFinite(numericScore) ? numericScore.toFixed(3) : '—';
    scoreCell.appendChild(score);

    const decisionCell = document.createElement('td');
    const decision = document.createElement('span');
    decision.className = `decision ${decisionClass(transaction.recommended_action)}`;
    decision.textContent = transaction.recommended_action === 'ALLOW_MONITOR' ? 'Allowed' : 'Review';
    decisionCell.appendChild(decision);

    row.append(transactionCell, timeCell, amountCell, scoreCell, decisionCell);

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

function renderAttention(items) {
  const container = $('[data-attention-list]');
  if (!container) return;

  container.replaceChildren();

  const attention = items
    .filter((item) => item.recommended_action !== 'ALLOW_MONITOR')
    .sort((a, b) => Number(b.calibrated_risk_score || 0) - Number(a.calibrated_risk_score || 0))
    .slice(0, 3);

  if (attention.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'attention-item';
    const text = document.createElement('span');
    text.className = 'muted';
    text.textContent = 'No review decisions in the loaded live audit window.';
    empty.appendChild(text);
    container.appendChild(empty);
    return;
  }

  attention.forEach((transaction) => {
    const item = document.createElement('div');
    item.className = 'attention-item';
    item.tabIndex = 0;
    item.style.cursor = 'pointer';

    const risk = document.createElement('span');
    risk.className = `risk ${Number(transaction.calibrated_risk_score) >= 0.85 ? 'high' : 'medium'}`;
    risk.textContent = Number(transaction.calibrated_risk_score) >= 0.85 ? 'HIGH' : 'MED';

    const middle = document.createElement('div');
    const id = document.createElement('strong');
    id.textContent = transaction.transaction_id || 'Unknown transaction';
    const reason = document.createElement('p');
    const evidence = Array.isArray(transaction.primary_evidence) && transaction.primary_evidence.length
      ? transaction.primary_evidence[0]
      : 'Research V2 review decision';
    reason.textContent = typeof evidence === 'string' ? evidence : JSON.stringify(evidence);
    middle.append(id, reason);

    const amount = document.createElement('b');
    amount.textContent = formatAmount(transaction.amount, transaction.currency);

    item.append(risk, middle, amount);
    const openDetails = () => showTransactionDetails(transaction);
    item.addEventListener('click', openDetails);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetails();
      }
    });

    container.appendChild(item);
  });
}

function renderMetrics(items) {
  const list = Array.isArray(items) ? items : [];
  const decisions = list.length;
  const reviews = list.filter((item) => item.recommended_action !== 'ALLOW_MONITOR').length;
  const high = list.filter((item) => Number(item.calibrated_risk_score) >= 0.85).length;
  const scores = list.map((item) => Number(item.calibrated_risk_score)).filter(Number.isFinite);
  const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;

  const decisionsNode = $('[data-metric-decisions]');
  const reviewNode = $('[data-metric-review]');
  const highNode = $('[data-metric-high]');
  const averageNode = $('[data-metric-average]');

  if (decisionsNode) decisionsNode.textContent = String(decisions);
  if (reviewNode) reviewNode.textContent = String(reviews);
  if (highNode) highNode.textContent = String(high);
  if (averageNode) averageNode.textContent = average == null ? '—' : average.toFixed(3);

  $('[data-metric-decisions-note]')?.replaceChildren(document.createTextNode('Loaded from live audit API · max 200'));
  $('[data-metric-review-note]')?.replaceChildren(document.createTextNode('Research V2 review threshold'));
  $('[data-metric-high-note]')?.replaceChildren(document.createTextNode('Risk score ≥ 0.85'));
}

function getBucketSettings(hours) {
  if (hours >= 168) {
    return { count: 7, bucketMs: 24 * 60 * 60 * 1000, date: { day: 'numeric', month: 'short' } };
  }
  return { count: 24, bucketMs: 60 * 60 * 1000, date: { hour: 'numeric' } };
}

function renderChart(items, hours = 24) {
  const line = $('[data-chart-line]');
  const area = $('[data-chart-area]');
  const labels = $('[data-chart-labels]');
  if (!line || !area || !labels) return;

  const settings = getBucketSettings(hours);
  const now = Date.now();
  const end = Math.floor(now / settings.bucketMs) * settings.bucketMs + settings.bucketMs;
  const start = end - settings.count * settings.bucketMs;
  const buckets = Array.from({ length: settings.count }, () => 0);

  items.forEach((item) => {
    const timestamp = Number(item.created_at) * 1000;
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp >= end) return;
    const index = Math.floor((timestamp - start) / settings.bucketMs);
    if (index >= 0 && index < buckets.length) buckets[index] += 1;
  });

  const max = Math.max(...buckets, 1);
  const width = 720;
  const baseline = 220;
  const top = 22;
  const step = width / Math.max(buckets.length - 1, 1);
  const points = buckets.map((count, index) => {
    const x = index * step;
    const y = baseline - ((count / max) * (baseline - top));
    return [x, y];
  });

  const linePath = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L ${width} ${baseline} L 0 ${baseline} Z`;
  line.setAttribute('d', linePath || `M0 ${baseline}`);
  area.setAttribute('d', areaPath);

  labels.replaceChildren();
  const formatter = new Intl.DateTimeFormat('en-IN', settings.date);
  const labelIndexes = Array.from({ length: 7 }, (_, index) => Math.round(index * (buckets.length - 1) / 6));

  labelIndexes.forEach((bucketIndex) => {
    const span = document.createElement('span');
    const bucketTime = start + bucketIndex * settings.bucketMs;
    span.textContent = formatter.format(new Date(bucketTime));
    labels.appendChild(span);
  });
}

function renderPolicy(health) {
  if (!health) return;
  $('[data-policy-features]') && ($('[data-policy-features]').textContent = `${health.feature_count ?? '—'} features`);
  $('[data-policy-review]') && ($('[data-policy-review]').textContent = String(health.review_threshold ?? '—'));
  $('[data-policy-high]') && ($('[data-policy-high]').textContent = String(health.high_threshold ?? '—'));
}

async function loadTransactions() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/transactions?limit=200`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Transaction endpoint returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data?.status !== 'ok') {
      throw new Error('Transaction endpoint responded without status=ok');
    }

    transactions = Array.isArray(data.transactions) ? data.transactions : [];
    renderMetrics(transactions);
    renderAttention(transactions);
    renderTransactions(getVisibleTransactions());
    renderChart(transactions, Number($('[data-period-select]')?.value || 24));
  } catch (error) {
    transactions = [];
    renderMetrics([]);
    renderAttention([]);
    renderTransactions([]);
    renderChart([], Number($('[data-period-select]')?.value || 24));
    console.error('Unable to load live transactions:', error);
  }
}

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
  const pill = $('[data-workspace-pill]');
  if (pill) pill.textContent = 'API offline';
}

function renderAgentOnline(health) {
  lastHealth = health;

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
  if ($('[data-workspace-pill]')) $('[data-workspace-pill]').textContent = 'API connected';
  renderPolicy(health);
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

    if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}`);

    const health = await response.json();
    if (health?.status !== 'ok') throw new Error('API responded without status=ok');

    renderAgentOnline(health);
  } catch (error) {
    renderAgentOffline(error instanceof Error ? error.message : 'Unable to reach the API');
  }
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

$('[data-model-details]')?.addEventListener('click', (event) => {
  event.preventDefault();
  showModelDetails();
});

$('.icon-btn')?.addEventListener('click', openSearch);
$('.shortcut')?.addEventListener('click', openSearch);
$('[data-period-select]')?.addEventListener('change', (event) => {
  const hours = Number(event.currentTarget.value) || 24;
  renderChart(transactions, hours);
});

$('[data-connect-agent]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Connecting…';
  await checkAgent();
  await loadTransactions();
  button.disabled = false;
  button.textContent = 'Reconnect';
  setToast('Connection and live decisions refreshed.');
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
  }

  if (event.key === 'Escape') {
    $('#v2-modal')?.remove();
  }
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
window.setInterval(() => {
  loadTransactions();
}, 15000);