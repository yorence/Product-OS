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

async function fetchAllMeetings() {
  let all = [], cursor = null, page = 0;
  do {
    showLoading(`Fetching meetings (page ${++page})...`);
    const params = { include_transcript: 'true', include_summary: 'true', include_action_items: 'true' };
    if (cursor) params.cursor = cursor;
    const data = await fathomAPI('/meetings', params);
    all = all.concat(data.items || []);
    cursor = data.next_cursor || null;
  } while (cursor && page < 1); // TODO: change back to 20 to load all pages
  return all;
}

// ═══════ CONNECT ═══════
async function connectToFathom() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) { showConnectError('Please enter your Fathom API key.'); return; }
  hideConnectError();
  STATE.apiKey = key;
  STATE.isDemo = false;

  try {
    // Auto-detect best connection strategy
    showLoading('Detecting connection method...');
    STATE.strategy = await detectStrategy(key);

    // Fetch all meetings with pagination
    STATE.meetings = await fetchAllMeetings();
    STATE.topics = []; // Topics are synthesized on-demand via Perplexity
    STATE.topicsUnlocked = false;

    // Save to localStorage for faster reload
    try { localStorage.setItem('fathom_cache', JSON.stringify({ ts: Date.now(), meetings: STATE.meetings })); } catch(e) {}

    hideLoading();
    enterApp();
  } catch (e) {
    hideLoading();
    showConnectError(e.message);
  }
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
  document.getElementById('meetingCount').textContent = STATE.meetings.length;
  document.getElementById('topicCount').textContent = STATE.topics.length;
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  const stratLabels = { local:'Local Server', corsproxy:'corsproxy.io', allorigins:'allorigins.win', direct:'Direct', file:'File' };
  dot.className = 'dot ' + (STATE.isDemo ? 'dot-yellow' : 'dot-green');
  txt.textContent = STATE.isDemo ? 'Demo Mode' : ('Connected' + (STATE.strategy ? ' via ' + (stratLabels[STATE.strategy]||STATE.strategy) : ''));
  showView('meetings');
}

async function refreshData() {
  if (STATE.isDemo) return;
  try {
    showLoading('Refreshing...');
    STATE.meetings = await fetchAllMeetings();
    STATE.topics = [];
    STATE.topicsUnlocked = false;
    try { sessionStorage.removeItem('llm_topics'); } catch(e) {}
    hideLoading();
    document.getElementById('meetingCount').textContent = STATE.meetings.length;
    document.getElementById('topicCount').textContent = '?';
    showView(STATE.currentView);
  } catch(e) { hideLoading(); alert('Refresh failed: ' + e.message); }
}
