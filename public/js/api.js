// Fathom API and connection management
// ═══════ API ═══════
// Build a Fathom API URL with query params
function buildFathomUrl(endpoint, params = {}) {
  let url = '/external/v1' + endpoint;
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach(val => sp.append(k, val));
    else sp.append(k, v);
  });
  const qs = sp.toString();
  return qs ? url + '?' + qs : url;
}

// Try fetching via a specific strategy
async function tryFetch(strategy, apiPath, apiKey) {
  let fetchUrl, opts = { method: 'GET', headers: { 'Accept': 'application/json' } };
  const fullTarget = 'https://api.fathom.ai' + apiPath;

  switch (strategy) {
    case 'local':
      fetchUrl = 'http://localhost:3001/fathom' + apiPath;
      opts.headers['X-Api-Key'] = apiKey;
      break;
    case 'corsproxy':
      fetchUrl = 'https://corsproxy.io/?' + encodeURIComponent(fullTarget);
      opts.headers['X-Api-Key'] = apiKey;
      break;
    case 'allorigins':
      fetchUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(fullTarget);
      opts.headers['X-Api-Key'] = apiKey;
      break;
    default:
      fetchUrl = fullTarget;
      opts.headers['X-Api-Key'] = apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  opts.signal = controller.signal;

  try {
    const res = await fetch(fetchUrl, opts);
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.items) throw new Error('Invalid response format');
    return data;
  } catch(e) {
    clearTimeout(timeout);
    throw e;
  }
}

// Auto-detect the best working connection strategy
async function detectStrategy(apiKey) {
  const strategies = ['local', 'corsproxy', 'allorigins', 'direct'];
  const labels = { local: 'Local server (localhost:3001)', corsproxy: 'corsproxy.io', allorigins: 'allorigins.win', direct: 'Direct connection' };
  const testPath = buildFathomUrl('/meetings', {});

  for (const s of strategies) {
    setProgress(`Trying ${labels[s]}...`);
    try {
      await tryFetch(s, testPath, apiKey);
      setProgress(`Connected via ${labels[s]}`);
      return s;
    } catch(e) {
      setProgress(`${labels[s]} failed, trying next...`);
    }
  }
  throw new Error('All connection methods failed. Use the "Load JSON File" option instead — run start-server.bat for the best experience.');
}

async function fathomAPI(endpoint, params = {}) {
  const apiPath = buildFathomUrl(endpoint, params);
  return tryFetch(STATE.strategy, apiPath, STATE.apiKey);
}

// Fetch meetings page by page, calling onPage after each page arrives
async function fetchMeetingsProgressive(onPage, onDone) {
  let cursor = null, page = 0;
  try {
    do {
      page++;
      const params = { include_transcript: 'true', include_summary: 'true', include_action_items: 'true' };
      if (cursor) params.cursor = cursor;
      const data = await fathomAPI('/meetings', params);
      const items = data.items || [];
      STATE.meetings = STATE.meetings.concat(items);
      cursor = data.next_cursor || null;
      onPage(page, items.length, !!cursor);
    } while (cursor && page < 20);
    onDone(null);
  } catch(e) {
    onDone(e);
  }
}

// ═══════ CONNECT ═══════
async function connectToFathom() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) { showConnectError('Please enter your Fathom API key.'); return; }
  hideConnectError();
  STATE.apiKey = key;
  STATE.isDemo = false;
  STATE.meetings = [];
  STATE.topics = [];
  STATE.topicsUnlocked = false;

  try {
    // Quick strategy detection (stays on connect screen briefly)
    setProgress('Detecting connection...');
    STATE.strategy = await detectStrategy(key);
  } catch(e) {
    showConnectError('Connection failed: ' + e.message);
    return;
  }

  // Enter the app immediately with skeleton UI
  enterApp();
  STATE.isLoading = true;
  renderMeetingsSkeleton();

  // Fetch pages in background, updating UI progressively
  fetchMeetingsProgressive(
    (page, count, hasMore) => {
      // Update UI after each page
      document.getElementById('meetingCount').textContent = STATE.meetings.length;
      updateLoadingStatus(page, STATE.meetings.length, hasMore);
      // Re-render the table with what we have so far
      if (STATE.currentView === 'meetings') renderMeetings();
    },
    (err) => {
      STATE.isLoading = false;
      if (err) {
        console.error('Fetch error on later page:', err);
        // Still show what we got
      }
      hideLoadingStatus();
      document.getElementById('meetingCount').textContent = STATE.meetings.length;
      if (STATE.currentView === 'meetings') renderMeetings();
      // Cache
      try { localStorage.setItem('fathom_cache', JSON.stringify({ ts: Date.now(), meetings: STATE.meetings })); } catch(e) {}
    }
  );
}

function renderMeetingsSkeleton() {
  const container = document.getElementById('meetingsTableContainer');
  const stats = document.getElementById('meetingStats');
  // Skeleton stat cards
  stats.innerHTML = `
    <div class="stat-card"><div class="skeleton" style="width:80px;height:12px;margin-bottom:6px"></div><div class="skeleton" style="width:40px;height:24px"></div></div>
    <div class="stat-card"><div class="skeleton" style="width:80px;height:12px;margin-bottom:6px"></div><div class="skeleton" style="width:60px;height:24px"></div></div>
    <div class="stat-card"><div class="skeleton" style="width:80px;height:12px;margin-bottom:6px"></div><div class="skeleton" style="width:40px;height:24px"></div></div>
    <div class="stat-card" style="border-left-color:var(--green);background:linear-gradient(135deg,var(--green-10),white)"><div class="skeleton" style="width:100px;height:12px;margin-bottom:6px"></div><div class="skeleton" style="width:90px;height:16px"></div></div>
  `;
  // Skeleton table
  let rows = '';
  for (let i = 0; i < 8; i++) {
    rows += `<div class="skeleton-row">
      <div class="skeleton skeleton-cell skeleton-cell-wide"></div>
      <div class="skeleton skeleton-cell skeleton-cell-med"></div>
      <div class="skeleton skeleton-cell skeleton-cell-sm"></div>
      <div class="skeleton skeleton-cell skeleton-cell-sm"></div>
      <div class="skeleton skeleton-cell skeleton-cell-med"></div>
    </div>`;
  }
  container.innerHTML = `
    <div id="loadingStatusBar"></div>
    <div style="background:white;border:1px solid var(--border)">
      <div style="display:flex;gap:1rem;padding:.65rem 1rem;background:var(--blue)">
        <div style="flex:2;height:12px;background:rgba(255,255,255,.15);border-radius:2px"></div>
        <div style="flex:1;height:12px;background:rgba(255,255,255,.1);border-radius:2px"></div>
        <div style="width:60px;height:12px;background:rgba(255,255,255,.1);border-radius:2px"></div>
        <div style="width:60px;height:12px;background:rgba(255,255,255,.1);border-radius:2px"></div>
        <div style="flex:1;height:12px;background:rgba(255,255,255,.1);border-radius:2px"></div>
      </div>
      ${rows}
    </div>
  `;
}

function updateLoadingStatus(page, totalLoaded, hasMore) {
  const bar = document.getElementById('loadingStatusBar');
  if (!bar) return;
  const pct = hasMore ? Math.min(page * 5, 95) : 100;
  bar.innerHTML = `
    <div class="loading-bar-wrap"><div class="loading-bar" style="width:${pct}%"></div></div>
    <div class="loading-status"><span class="pulse-dot"></span> Loading meetings... ${totalLoaded} loaded (page ${page})${hasMore ? '' : ' — done'}</div>
  `;
}

function hideLoadingStatus() {
  const bar = document.getElementById('loadingStatusBar');
  if (bar) bar.innerHTML = '';
}

function loadFromFile(file) {
  if (!file) return;
  showLoading('Loading from file...');
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      let data = JSON.parse(e.target.result);
      // Support both raw array and {items:[]} format
      if (data.items) data = data.items;
      if (!Array.isArray(data)) throw new Error('Invalid format');
      STATE.meetings = data;
      STATE.isDemo = false;
      STATE.strategy = 'file';
      STATE.topics = [];
      STATE.topicsUnlocked = false;
      hideLoading();
      enterApp();
    } catch(err) {
      hideLoading();
      showConnectError('Invalid JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function setProgress(msg) {
  const el = document.getElementById('connectProgress');
  if (el) { el.style.display = 'block'; el.textContent = msg; }
}

function hideConnectError() {
  document.getElementById('connectError').style.display = 'none';
}

function loadDemoData() {
  STATE.isDemo = true;
  STATE.meetings = generateDemoMeetings();
  STATE.topics = [];
  STATE.topicsUnlocked = false;
  enterApp();
}

function disconnect() {
  STATE = { apiKey:'', perplexityKey:'', strategy:'', meetings:[], topics:[], topicsUnlocked:false, currentView:'meetings', isDemo:false };
  try { localStorage.removeItem('fathom_cache'); sessionStorage.removeItem('llm_topics'); } catch(e) {}
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('connectScreen').classList.remove('hidden');
}

function enterApp() {
  document.getElementById('connectScreen').classList.add('hidden');
  document.getElementById('sidebar').classList.remove('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('meetingCount').textContent = STATE.meetings.length || '...';
  document.getElementById('topicCount').textContent = STATE.topics.length || '?';
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  const stratLabels = { local:'Local Server', corsproxy:'corsproxy.io', allorigins:'allorigins.win', direct:'Direct', file:'File' };
  dot.className = 'dot ' + (STATE.isDemo ? 'dot-yellow' : STATE.isLoading ? 'dot-yellow' : 'dot-green');
  txt.textContent = STATE.isDemo ? 'Demo Mode' : STATE.isLoading ? 'Loading...' : ('Connected' + (STATE.strategy ? ' via ' + (stratLabels[STATE.strategy]||STATE.strategy) : ''));
  showView('meetings');
}

async function refreshData() {
  if (STATE.isDemo) return;
  STATE.meetings = [];
  STATE.topics = [];
  STATE.topicsUnlocked = false;
  STATE.isLoading = true;
  try { sessionStorage.removeItem('llm_topics'); } catch(e) {}
  renderMeetingsSkeleton();
  fetchMeetingsProgressive(
    (page, count, hasMore) => {
      document.getElementById('meetingCount').textContent = STATE.meetings.length;
      updateLoadingStatus(page, STATE.meetings.length, hasMore);
      if (STATE.currentView === 'meetings') renderMeetings();
    },
    (err) => {
      STATE.isLoading = false;
      hideLoadingStatus();
      document.getElementById('meetingCount').textContent = STATE.meetings.length;
      document.getElementById('topicCount').textContent = '?';
      if (STATE.currentView === 'meetings') renderMeetings();
      try { localStorage.setItem('fathom_cache', JSON.stringify({ ts: Date.now(), meetings: STATE.meetings })); } catch(e) {}
    }
  );
}
