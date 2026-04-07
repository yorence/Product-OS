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
    return await res.json();
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
      const data = await tryFetch(s, testPath, apiKey);
      if (!data.items) throw new Error('Invalid response format');
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

// Fetch a single meeting's full details (transcript, summary, action items)
async function fetchMeetingDetail(meetingId) {
  const apiPath = buildFathomUrl(`/meetings/${meetingId}`, {
    include_transcript: 'true',
    include_summary: 'true',
    include_action_items: 'true'
  });
  return tryFetch(STATE.strategy, apiPath, STATE.apiKey);
}

// Backfill transcripts/summaries for meetings in parallel batches
async function backfillMeetingDetails(onProgress) {
  const BATCH_SIZE = 5; // concurrent requests
  const toFill = STATE.meetings.filter(m => !m._detailLoaded);
  if (!toFill.length) return;

  // Test if individual meeting endpoint works
  try {
    const test = await fetchMeetingDetail(toFill[0].recording_id);
    const target = STATE.meetings.find(m => m.recording_id === toFill[0].recording_id);
    if (target && test) {
      if (test.transcript) target.transcript = test.transcript;
      if (test.default_summary) target.default_summary = test.default_summary;
      if (test.action_items) target.action_items = test.action_items;
      target._detailLoaded = true;
    }
  } catch(e) {
    // Individual endpoint not available — fall back to paginated fetch with details
    console.warn('Individual meeting endpoint not available, falling back to paginated detail fetch');
    await backfillViaPagination(onProgress);
    return;
  }

  let done = 1;
  if (onProgress) onProgress(done, toFill.length);

  const remaining = toFill.slice(1);
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(m => fetchMeetingDetail(m.recording_id))
    );

    results.forEach((result, idx) => {
      const meeting = batch[idx];
      const target = STATE.meetings.find(m => m.recording_id === meeting.recording_id);
      if (result.status === 'fulfilled' && result.value && target) {
        const detail = result.value;
        if (detail.transcript) target.transcript = detail.transcript;
        if (detail.default_summary) target.default_summary = detail.default_summary;
        if (detail.action_items) target.action_items = detail.action_items;
        target._detailLoaded = true;
      } else if (target) {
        // Mark as loaded even on failure so we don't retry endlessly
        target._detailLoaded = true;
      }
    });

    done += batch.length;
    if (onProgress) onProgress(done, toFill.length);
  }
}

// Fallback: re-fetch all meetings with details via pagination (original approach)
async function backfillViaPagination(onProgress) {
  let cursor = null, page = 0;
  const meetingMap = new Map(STATE.meetings.map(m => [m.recording_id, m]));
  do {
    page++;
    const params = { include_transcript: 'true', include_summary: 'true', include_action_items: 'true' };
    if (cursor) params.cursor = cursor;
    const data = await fathomAPI('/meetings', params);
    (data.items || []).forEach(item => {
      const target = meetingMap.get(item.recording_id);
      if (target) {
        if (item.transcript) target.transcript = item.transcript;
        if (item.default_summary) target.default_summary = item.default_summary;
        if (item.action_items) target.action_items = item.action_items;
        target._detailLoaded = true;
      }
    });
    cursor = data.next_cursor || null;
    const filled = STATE.meetings.filter(m => m._detailLoaded).length;
    if (onProgress) onProgress(filled, STATE.meetings.length);
  } while (cursor && page < 50);

  // Mark any remaining meetings as loaded (API didn't return them — possibly no transcript)
  STATE.meetings.forEach(m => { m._detailLoaded = true; });
}

// Fetch meetings page by page (metadata only — fast), then backfill details in parallel
async function fetchMeetingsProgressive(onPage, onDone) {
  let cursor = null, page = 0;
  try {
    // Phase 1: Fetch meeting list quickly (no transcripts)
    do {
      page++;
      const params = {};
      if (cursor) params.cursor = cursor;
      const data = await fathomAPI('/meetings', params);
      const items = (data.items || []).map(m => ({ ...m, _detailLoaded: false }));
      STATE.meetings = STATE.meetings.concat(items);
      cursor = data.next_cursor || null;
      onPage(page, items.length, !!cursor, 'list');
    } while (cursor && page < 50);

    // Phase 2: Backfill transcripts/summaries in parallel
    onPage(page, 0, true, 'details');
    await backfillMeetingDetails((done, total) => {
      onPage(page, done, done < total, 'details');
    });

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

  // Clear stale cache
  try { localStorage.removeItem('fathom_cache'); } catch(e) {}

  try {
    // Quick strategy detection (stays on connect screen briefly)
    setProgress('Detecting connection...');
    STATE.strategy = await detectStrategy(key);
  } catch(e) {
    showConnectError('Connection failed: ' + e.message);
    return;
  }

  // Enter the app immediately — renderMeetings() will show skeleton since isLoading=true
  STATE.isLoading = true;
  enterApp();

  // Fetch pages in background, updating UI progressively
  fetchMeetingsProgressive(
    (page, count, hasMore, phase) => {
      document.getElementById('meetingCount').textContent = STATE.meetings.length;
      updateLoadingStatus(page, count, hasMore, phase);
      // Re-render current view as data arrives
      if (phase === 'list' && STATE.currentView === 'meetings') renderMeetings();
      if (STATE.currentView === 'topics' && !STATE.topicsUnlocked) renderTopics();
    },
    (err) => {
      STATE.isLoading = false;
      if (err) {
        console.error('Fetch error on later page:', err);
      }
      hideLoadingStatus();
      document.getElementById('meetingCount').textContent = STATE.meetings.length;
      if (STATE.currentView === 'meetings') renderMeetings();
      if (STATE.currentView === 'topics' && !STATE.topicsUnlocked) renderTopics();
      // Update status dot
      const dot = document.getElementById('statusDot');
      const txt = document.getElementById('statusText');
      if (dot) dot.className = 'dot dot-green';
      if (txt) txt.textContent = 'Connected' + (STATE.strategy ? ' via ' + ({ local:'Local Server', corsproxy:'corsproxy.io', allorigins:'allorigins.win', direct:'Direct', file:'File' }[STATE.strategy]||STATE.strategy) : '');
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
        <div style="flex:2;height:12px;background:rgba(255,255,255,.15);"></div>
        <div style="flex:1;height:12px;background:rgba(255,255,255,.1);"></div>
        <div style="width:60px;height:12px;background:rgba(255,255,255,.1);"></div>
        <div style="width:60px;height:12px;background:rgba(255,255,255,.1);"></div>
        <div style="flex:1;height:12px;background:rgba(255,255,255,.1);"></div>
      </div>
      ${rows}
    </div>
  `;
}

function updateLoadingStatus(page, count, hasMore, phase) {
  const bar = document.getElementById('loadingStatusBar');
  if (!bar) return;
  if (phase === 'details') {
    const total = STATE.meetings.length;
    const pct = total > 0 ? Math.min(Math.round((count / total) * 100), 100) : 0;
    bar.innerHTML = `
      <div class="loading-bar-wrap"><div class="loading-bar" style="width:${pct}%"></div></div>
      <div class="loading-status"><span class="pulse-dot"></span> Loading transcripts & summaries... ${count}/${total} meetings${hasMore ? '' : ' — done'}</div>
    `;
  } else {
    const pct = hasMore ? Math.min(page * 5, 50) : 50;
    bar.innerHTML = `
      <div class="loading-bar-wrap"><div class="loading-bar" style="width:${pct}%"></div></div>
      <div class="loading-status"><span class="pulse-dot"></span> Loading meeting list... ${STATE.meetings.length} found (page ${page})${hasMore ? '' : ''}</div>
    `;
  }
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
  STATE = { apiKey:'', perplexityKey:'', strategy:'', meetings:[], topics:[], topicsUnlocked:false, projectDocs:{}, currentView:'meetings', isDemo:false, isLoading:false, isSynthesizing:false, meetingSort:{col:'date',dir:'desc'}, themeSort:{col:'score',dir:'desc'}, initiativeStatus:{}, criticalPath:[] };
  try { localStorage.removeItem('fathom_cache'); sessionStorage.removeItem('llm_topics'); sessionStorage.removeItem('project_docs'); sessionStorage.removeItem('initiative_status'); } catch(e) {}
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
    (page, count, hasMore, phase) => {
      document.getElementById('meetingCount').textContent = STATE.meetings.length;
      updateLoadingStatus(page, count, hasMore, phase);
      if (phase === 'list' && STATE.currentView === 'meetings') renderMeetings();
      if (STATE.currentView === 'topics' && !STATE.topicsUnlocked) renderTopics();
    },
    (err) => {
      STATE.isLoading = false;
      hideLoadingStatus();
      document.getElementById('meetingCount').textContent = STATE.meetings.length;
      document.getElementById('topicCount').textContent = '?';
      if (STATE.currentView === 'meetings') renderMeetings();
      if (STATE.currentView === 'topics' && !STATE.topicsUnlocked) renderTopics();
      try { localStorage.setItem('fathom_cache', JSON.stringify({ ts: Date.now(), meetings: STATE.meetings })); } catch(e) {}
    }
  );
}
