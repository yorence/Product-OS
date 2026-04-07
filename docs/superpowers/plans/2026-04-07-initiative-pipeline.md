# Initiative Pipeline & Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add initiative readiness tracking with auto-scoring, a pipeline kanban board, and an interactive dependency DAG with critical path highlighting.

**Architecture:** Extend STATE with `initiativeStatus` and `criticalPath`. Auto-score all themes on first doc generation via a lightweight value-only Perplexity prompt. Compute readiness (Blocked/Ready/In Progress/Done) client-side from dependency data. New sidebar view with kanban board + 2D force-directed DAG reusing the existing 3d-force-graph library.

**Tech Stack:** Vanilla JS, existing Perplexity API via `perplexityCall()` and `runPool()`, 3d-force-graph (2D mode), CSS grid for kanban.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `public/js/config.js` | Add `initiativeStatus`, `criticalPath` to STATE, restore from sessionStorage |
| `public/js/pipeline.js` (new) | `computeStatus()`, `computeAllStatuses()`, `computeCriticalPath()`, `findThemeByName()`, `toggleInitiativeStatus()`, `renderPipeline()`, `renderKanban()`, `renderPipelineDAG()` |
| `public/js/projects.js` | Add `generateValueOnly()`, modify `generateProjectDocs()` to trigger batch scoring |
| `public/js/views.js` | Add Readiness column + enhanced Dependencies to themes table, add `pipeline` to view router, update category headers |
| `public/css/app.css` | Kanban styles, status badges, pipeline DAG container |
| `public/index.html` | Add sidebar button, view panel, script tag for pipeline.js |

---

### Task 1: Extend STATE and Persistence

**Files:**
- Modify: `public/js/config.js:62-79`

- [ ] **Step 1: Add new STATE fields and restore from sessionStorage**

In `public/js/config.js`, add `initiativeStatus` and `criticalPath` to the STATE object, and restore `initiativeStatus` from sessionStorage below the existing `projectDocs` restore:

```javascript
// In STATE object (after themeSort line):
  initiativeStatus: {},  // { [themeId]: 'in_progress' | 'done' }
  criticalPath: []       // [themeId, ...] ordered chain
```

After the existing `try { const pd = ...` block, add:

```javascript
try { const is = sessionStorage.getItem('initiative_status'); if (is) STATE.initiativeStatus = JSON.parse(is); } catch(e) {}
```

- [ ] **Step 2: Update disconnect() to reset new fields**

In `public/js/api.js`, find the `disconnect()` function's STATE reset object and add `initiativeStatus:{}, criticalPath:[]` to it.

- [ ] **Step 3: Commit**

```bash
git add public/js/config.js public/js/api.js
git commit -m "feat: add initiativeStatus and criticalPath to STATE with sessionStorage persistence"
```

---

### Task 2: Create pipeline.js — Status Computation & Critical Path

**Files:**
- Create: `public/js/pipeline.js`

- [ ] **Step 1: Create pipeline.js with status computation functions**

Create `public/js/pipeline.js` with:

```javascript
// Initiative Pipeline — status computation, critical path, rendering
// ═══════════════════════════════════════════════════════════════════

// ── Status Computation ──────────────────────────────────────────

function findThemeByName(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  return STATE.topics.find(t => t.name.toLowerCase().trim() === lower) || null;
}

function computeStatus(themeId, visited) {
  if (!visited) visited = new Set();
  if (visited.has(themeId)) return 'ready'; // break cycles
  visited.add(themeId);

  // Manual overrides take precedence
  if (STATE.initiativeStatus[themeId] === 'done') return 'done';
  if (STATE.initiativeStatus[themeId] === 'in_progress') return 'in_progress';

  // Check blockers
  const bv = STATE.projectDocs?.[themeId]?.value;
  if (!bv) return 'ready'; // no score yet = treat as ready (scores will exist after auto-scoring)

  const blockers = bv.blocked_by || [];
  for (const blockerName of blockers) {
    const blocker = findThemeByName(blockerName);
    if (blocker && computeStatus(blocker.id, new Set(visited)) !== 'done') {
      return 'blocked';
    }
  }

  return 'ready';
}

function computeAllStatuses() {
  const statuses = {};
  STATE.topics.forEach(t => {
    statuses[t.id] = computeStatus(t.id);
  });
  return statuses;
}

// Status display config
const STATUS_CONFIG = {
  blocked:     { label: 'Blocked',     color: 'var(--red)',      bg: '#fde8e8',       order: 0 },
  ready:       { label: 'Ready',       color: 'var(--green-text)', bg: 'var(--green-10)', order: 1 },
  in_progress: { label: 'In Progress', color: 'var(--blue)',     bg: 'var(--blue-10)',  order: 2 },
  done:        { label: 'Done',        color: 'var(--charcoal)', bg: 'var(--gray-10)',  order: 3 }
};

function statusBadgeHtml(status) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ready;
  const check = status === 'done' ? ' &#10003;' : '';
  return `<span style="font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${cfg.color};background:${cfg.bg};padding:3px 8px;white-space:nowrap">${cfg.label}${check}</span>`;
}

// ── Manual Status Toggle ────────────────────────────────────────

function toggleInitiativeStatus(themeId, event) {
  if (event) event.stopPropagation();

  const current = computeStatus(themeId);
  // Cycle: ready → in_progress → done → (clear override → recompute)
  // Cannot toggle if blocked
  if (current === 'blocked') return;

  const override = STATE.initiativeStatus[themeId];
  if (!override) {
    STATE.initiativeStatus[themeId] = 'in_progress';
  } else if (override === 'in_progress') {
    STATE.initiativeStatus[themeId] = 'done';
  } else {
    delete STATE.initiativeStatus[themeId]; // clear override → recomputes to ready or blocked
  }

  // Persist
  try { sessionStorage.setItem('initiative_status', JSON.stringify(STATE.initiativeStatus)); } catch(e) {}

  // Recompute critical path
  computeCriticalPath();

  // Re-render current view
  if (STATE.currentView === 'pipeline') renderPipeline();
  if (STATE.currentView === 'topics') renderTopicsGrid();
}

// ── Critical Path Algorithm ─────────────────────────────────────

function computeCriticalPath() {
  const themes = STATE.topics;
  if (!themes.length) { STATE.criticalPath = []; return; }

  // Build adjacency: blocker → [blocked theme ids]
  // Edge direction: from blocker to the theme it blocks
  const adj = {};    // adj[blockerId] = [blockedId, ...]
  const inDeg = {};  // in-degree for topo sort
  const iceOf = {};  // ICE scores for tie-breaking

  themes.forEach(t => {
    adj[t.id] = adj[t.id] || [];
    inDeg[t.id] = inDeg[t.id] || 0;
    const bv = STATE.projectDocs?.[t.id]?.value || {};
    const ice = (bv.score && bv.effort != null && bv.confidence != null)
      ? (bv.score + bv.effort + bv.confidence) / 3 : 0;
    iceOf[t.id] = ice;
  });

  // Build edges from blocks arrays
  const edges = [];
  themes.forEach(t => {
    const bv = STATE.projectDocs?.[t.id]?.value || {};
    (bv.blocks || []).forEach(blockedName => {
      const blocked = findThemeByName(blockedName);
      if (blocked) {
        adj[t.id] = adj[t.id] || [];
        adj[t.id].push(blocked.id);
        inDeg[blocked.id] = (inDeg[blocked.id] || 0) + 1;
        edges.push({ from: t.id, to: blocked.id });
      }
    });
  });

  if (!edges.length) { STATE.criticalPath = []; return; }

  // Cycle detection & breaking via Kahn's algorithm
  // If topo sort doesn't consume all nodes, there are cycles
  const queue = [];
  const topoOrder = [];
  themes.forEach(t => { if ((inDeg[t.id] || 0) === 0) queue.push(t.id); });

  while (queue.length) {
    const node = queue.shift();
    topoOrder.push(node);
    (adj[node] || []).forEach(next => {
      inDeg[next]--;
      if (inDeg[next] === 0) queue.push(next);
    });
  }

  // If cycles remain, log warning and skip them
  if (topoOrder.length < themes.length) {
    console.warn('Dependency cycle detected — critical path may be incomplete');
  }

  // Longest path via DP on topo order
  const dist = {};
  const prev = {};
  topoOrder.forEach(id => { dist[id] = 0; prev[id] = null; });

  topoOrder.forEach(node => {
    (adj[node] || []).forEach(next => {
      if (dist[node] + 1 > (dist[next] || 0)) {
        dist[next] = dist[node] + 1;
        prev[next] = node;
      }
    });
  });

  // Find the node with max distance — that's the end of the critical path
  let endNode = null;
  let maxDist = 0;
  topoOrder.forEach(id => {
    if ((dist[id] || 0) > maxDist) {
      maxDist = dist[id];
      endNode = id;
    }
  });

  // Trace back
  const path = [];
  let cur = endNode;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur] ?? null;
  }

  STATE.criticalPath = path.length > 1 ? path : [];
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/pipeline.js
git commit -m "feat: add pipeline.js with status computation, toggle, and critical path algorithm"
```

---

### Task 3: Add Value-Only Auto-Scoring

**Files:**
- Modify: `public/js/projects.js:120-300`

- [ ] **Step 1: Add generateValueOnly() function**

Add this function before `generateProjectDocs()` in `public/js/projects.js`:

```javascript
// Generate ONLY the business case (value) for a single theme — lightweight prompt
async function generateValueOnly(topicId) {
  const t = STATE.topics.find(x => x.id === topicId);
  if (!t || !STATE.perplexityKey) return;
  if (STATE.projectDocs?.[topicId]?.value?.score) return; // already scored

  const otherThemes = STATE.topics.filter(x => x.id !== topicId).map(x =>
    `- "${x.name}": ${x.description || 'No description'}`
  ).join('\n');

  const relatedMeetingIds = new Set(t.segments.map(s => s.meetingId));
  const meetingSummaries = STATE.meetings
    .filter(m => relatedMeetingIds.has(m.recording_id))
    .map(m => {
      const title = m.title || m.meeting_title || 'Untitled';
      const summary = m.default_summary?.markdown_formatted || '';
      return summary ? `[${title}]\n${summary.substring(0, 200)}` : '';
    }).filter(Boolean).join('\n\n').substring(0, 1500);

  const prompt = `You are scoring the business value of an initiative at Kaufman Rossin (professional services firm).

INITIATIVE: ${t.name}
DESCRIPTION: ${t.description || 'See context below.'}

OTHER ACTIVE INITIATIVES (for dependency analysis):
${otherThemes}

MEETING CONTEXT:
${meetingSummaries}

FIRM POLICIES (abbreviated):
${getPoliciesContext().substring(0, 800)}

Generate a business case assessment. Use web search for 2-3 supporting research findings.

JSON only, no fences:
{
  "score": 8,
  "score_rationale": "Why this score (1-10) based on business impact, urgency, strategic alignment",
  "effort": 6,
  "effort_rationale": "Why this effort score (0=hardest, 10=easiest). Consider complexity, dependencies, unknowns.",
  "confidence": 7,
  "confidence_rationale": "Why this confidence (0=lowest, 10=highest certainty value will be realized).",
  "business_impact": "2-3 sentences on revenue/efficiency/risk/client impact",
  "research": [{"finding":"...","source":"...","url":"...","relevance":"..."}],
  "roi_estimate": "Qualitative/quantitative ROI estimate",
  "blocks": ["Names of OTHER initiatives this one blocks/is prerequisite for"],
  "blocked_by": ["Names of OTHER initiatives that must happen before this one"],
  "risks_of_inaction": "Consequences if not pursued"
}`;

  const raw = await perplexityCall(STATE.perplexityKey, prompt, 2000);
  const value = JSON.parse(raw);

  // Store value-only result
  if (!STATE.projectDocs[topicId]) STATE.projectDocs[topicId] = {};
  STATE.projectDocs[topicId].value = value;
  try { sessionStorage.setItem('project_docs', JSON.stringify(STATE.projectDocs)); } catch(e) {}
}
```

- [ ] **Step 2: Add batch scoring trigger function**

Add after `generateValueOnly()`:

```javascript
// Auto-score ALL unscored themes — triggered on first doc generation
async function batchScoreAllThemes(statusFn) {
  const unscored = STATE.topics.filter(t => !STATE.projectDocs?.[t.id]?.value?.score);
  if (!unscored.length) return;

  let done = 0;
  const tasks = unscored.map(t => () =>
    generateValueOnly(t.id)
      .catch(err => { console.warn(`Score failed for "${t.name}":`, err.message); })
  );

  await runPool(tasks, 3, () => {
    done++;
    if (statusFn) statusFn(`Scoring ${done}/${unscored.length} themes...`);
  });

  // Recompute critical path now that all scores exist
  computeCriticalPath();

  // Re-render if on themes or pipeline view
  if (STATE.currentView === 'topics') renderTopicsGrid();
  if (STATE.currentView === 'pipeline') renderPipeline();
}
```

- [ ] **Step 3: Modify generateProjectDocs() to trigger batch scoring**

In `generateProjectDocs()`, after the line `renderProjectPage(topicId);` (around line 297), add:

```javascript
    // Auto-score all other themes in background
    batchScoreAllThemes((msg) => {
      const bar = document.getElementById('batchScoreStatus');
      if (bar) bar.textContent = msg;
    });
```

Also, right before the `try {` block that calls Perplexity (around line 275), add a status bar element to the page:

After the `allTabs.forEach(...)` loading block, add:

```javascript
  // Show batch scoring status
  const projPanel = document.getElementById('view-project');
  const existingBar = document.getElementById('batchScoreStatus');
  if (!existingBar && projPanel) {
    const bar = document.createElement('div');
    bar.id = 'batchScoreStatus';
    bar.style.cssText = 'font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);padding:.5rem 0;text-align:center';
    projPanel.prepend(bar);
  }
```

- [ ] **Step 4: Commit**

```bash
git add public/js/projects.js
git commit -m "feat: add value-only auto-scoring for all themes on first doc generation"
```

---

### Task 4: Add Readiness Column & Enhanced Dependencies to Themes Table

**Files:**
- Modify: `public/js/views.js:254-420`

- [ ] **Step 1: Add readiness sort case and column**

In `renderTopicsGrid()`, add a `readiness` sort case inside the `sortFn` switch:

```javascript
      case 'readiness':
        const statusOrder = { blocked: 0, ready: 1, in_progress: 2, done: 3 };
        va = statusOrder[computeStatus(a.id)] ?? 1;
        vb = statusOrder[computeStatus(b.id)] ?? 1;
        if (va !== vb) return sort.dir === 'asc' ? va - vb : vb - va;
        // Secondary sort: ICE descending
        return (getThemeICE(b) ?? -1) - (getThemeICE(a) ?? -1);
```

- [ ] **Step 2: Update the table header row**

Replace the existing `<thead><tr>` in `renderTopicsGrid()` with:

```javascript
  let html = `<table class="data-table"><thead><tr>
    <th style="width:10px"></th>
    <th class="sortable" onclick="sortThemes('readiness')" style="width:80px">Status${arrow('readiness')}</th>
    <th class="sortable" onclick="sortThemes('name')">Theme${arrow('name')}</th>
    <th class="sortable" onclick="sortThemes('ice')" style="width:55px">ICE${arrow('ice')}</th>
    <th class="sortable" onclick="sortThemes('score')" style="width:55px">Impact${arrow('score')}</th>
    <th class="sortable" onclick="sortThemes('confidence')" style="width:55px">Conf.${arrow('confidence')}</th>
    <th class="sortable" onclick="sortThemes('effort')" style="width:55px">Ease${arrow('effort')}</th>
    <th class="sortable" onclick="sortThemes('meetings')" style="width:55px">Mtgs${arrow('meetings')}</th>
    <th style="width:160px">Dependencies</th>
  </tr></thead><tbody>`;
```

(Removes the old "Status" column for docs-ready, replaces with "Status" for readiness.)

- [ ] **Step 3: Update theme row rendering**

In the `themes.forEach(t => {...})` block, replace the status and dependencies rendering:

For readiness status cell, add after the color bar `<td>`:

```javascript
      <td style="text-align:center">${statusBadgeHtml(computeStatus(t.id))}</td>
```

For the dependencies column, replace the existing `depHtml` construction with:

```javascript
    let depHtml = '';
    blockedBy.forEach(b => {
      const blockerTheme = findThemeByName(b);
      const resolved = blockerTheme && computeStatus(blockerTheme.id) === 'done';
      if (resolved) {
        depHtml += `<span style="font-family:var(--fd);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--green-text);background:var(--green-10);padding:2px 5px;display:inline-block;margin:1px;text-decoration:line-through;cursor:pointer" onclick="event.stopPropagation();showView('project-${blockerTheme.id}')">&#10003; ${esc(b)}</span>`;
      } else {
        const clickHandler = blockerTheme ? `onclick="event.stopPropagation();showView('project-${blockerTheme.id}')"` : '';
        depHtml += `<span style="font-family:var(--fd);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--red);background:#fde8e8;padding:2px 5px;display:inline-block;margin:1px;${blockerTheme ? 'cursor:pointer' : ''}" ${clickHandler}>&#9888; ${esc(b)}</span>`;
      }
    });
    blocks.forEach(b => {
      const enabledTheme = findThemeByName(b);
      const clickHandler = enabledTheme ? `onclick="event.stopPropagation();showView('project-${enabledTheme.id}')"` : '';
      depHtml += `<span style="font-family:var(--fd);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--green-text);background:var(--green-10);padding:2px 5px;display:inline-block;margin:1px;${enabledTheme ? 'cursor:pointer' : ''}" ${clickHandler}>&#10132; ${esc(b)}</span>`;
    });
    if (!depHtml) depHtml = '<span style="color:var(--text-muted);font-size:12px">—</span>';
```

Remove the old standalone "Status" `<td>` (the one that showed "Ready" tag for docs).

- [ ] **Step 4: Update category header with readiness summary**

In the category header row, replace the theme count badge with a readiness summary. After the existing count badge, add:

```javascript
    // Compute readiness summary for category
    const catStatuses = themes.map(t => computeStatus(t.id));
    const catSummary = ['blocked','ready','in_progress','done']
      .map(s => {
        const count = catStatuses.filter(x => x === s).length;
        return count ? `${count} ${STATUS_CONFIG[s].label.toLowerCase()}` : '';
      }).filter(Boolean).join(', ');
```

And render it in the category header row after the count span:

```javascript
          <span style="font-family:var(--fb);font-size:12px;color:var(--blue-60);margin-left:8px">${catSummary}</span>
```

- [ ] **Step 5: Commit**

```bash
git add public/js/views.js
git commit -m "feat: add readiness column and clickable dependency links to themes table"
```

---

### Task 5: Add Pipeline View — HTML, Sidebar, Router

**Files:**
- Modify: `public/index.html:55-92` (sidebar), `public/index.html:163-166` (view panels)
- Modify: `public/js/views.js:1-35` (router)

- [ ] **Step 1: Add sidebar button for Pipeline view**

In `public/index.html`, add the pipeline button after the Themes Index button and before the Knowledge Graph button:

```html
    <button onclick="showView('pipeline')" data-view="pipeline">
      <span class="icon">&#9776;</span> Initiative Pipeline
    </button>
```

- [ ] **Step 2: Add the view panel**

In `public/index.html`, add before the `<!-- Project Detail View -->` comment (around line 163):

```html
    <!-- Initiative Pipeline -->
    <div id="view-pipeline" class="view-panel hidden"></div>
```

- [ ] **Step 3: Add pipeline.js script tag**

In `public/index.html`, add after the `graph.js` script tag at the bottom:

```html
<script src="js/pipeline.js"></script>
```

- [ ] **Step 4: Add pipeline to the view router**

In `public/js/views.js`, in the `showView()` function, add to the `titles` object:

```javascript
  const titles = { meetings:'All Meetings', topics:'Themes Index', graph3d:'Knowledge Graph', policies:'Firm Policies', pipeline:'Initiative Pipeline' };
```

And add to the if/else chain:

```javascript
  else if (view === 'pipeline') renderPipeline();
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/views.js
git commit -m "feat: add pipeline sidebar button, view panel, and route"
```

---

### Task 6: Implement Kanban Board Rendering

**Files:**
- Modify: `public/js/pipeline.js`
- Modify: `public/css/app.css`

- [ ] **Step 1: Add kanban CSS**

Append to `public/css/app.css`:

```css
  /* ── Kanban Board ── */
  .kanban { display:grid; grid-template-columns:repeat(4,1fr); gap:2px; background:var(--gray-20); margin-bottom:2rem; }
  .kanban-col { background:var(--bg); min-height:200px; display:flex; flex-direction:column; }
  .kanban-col-header { padding:12px 16px; background:white; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
  .kanban-col-title { font-family:var(--fd); font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
  .kanban-col-count { font-family:var(--fd); font-size:11px; font-weight:600; padding:2px 8px; background:var(--gray-10); color:var(--text-light); }
  .kanban-cards { padding:8px; flex:1; display:flex; flex-direction:column; gap:8px; overflow-y:auto; max-height:400px; }
  .kanban-card { background:white; border:1px solid var(--border); box-shadow:var(--sh-sm); padding:12px; cursor:pointer; transition:box-shadow var(--fast),transform var(--fast); display:flex; gap:10px; }
  .kanban-card:hover { box-shadow:var(--sh-md); transform:translateY(-1px); }
  .kanban-card-color { width:5px; flex-shrink:0; align-self:stretch; }
  .kanban-card-body { flex:1; min-width:0; }
  .kanban-card-name { font-family:var(--fd); font-size:13px; font-weight:700; color:var(--blue); margin-bottom:4px; }
  .kanban-card-meta { display:flex; align-items:center; gap:8px; margin-top:6px; }
  .kanban-card-cat { font-family:var(--fd); font-size:10px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--text-muted); }
  .kanban-card-btn { font-family:var(--fd); font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; padding:4px 10px; border:none; cursor:pointer; transition:all var(--fast); margin-top:8px; }
```

- [ ] **Step 2: Add renderPipeline() and renderKanban() to pipeline.js**

Append to `public/js/pipeline.js`:

```javascript
// ── Pipeline View Rendering ─────────────────────────────────────

function renderPipeline() {
  const panel = document.getElementById('view-pipeline');
  if (!panel) return;

  // Gate: need topics and at least some scores
  if (!STATE.topicsUnlocked || !STATE.topics.length) {
    panel.innerHTML = '<div style="text-align:center;padding:4rem 2rem"><div style="font-size:2.5rem;opacity:.3">&#9776;</div><h3 style="font-family:var(--fd);font-weight:800;font-size:20px;color:var(--blue);margin:1rem 0 .5rem">Initiative Pipeline</h3><p style="font-size:15px;color:var(--text-light)">Unlock themes first to view the initiative pipeline.</p><button class="btn btn-primary" onclick="showView(\'topics\')">Go to Themes</button></div>';
    return;
  }

  // Recompute
  computeCriticalPath();

  // Critical path header
  let cpHtml = '';
  if (STATE.criticalPath.length > 1) {
    const cpNames = STATE.criticalPath.map(id => {
      const t = STATE.topics.find(x => x.id === id);
      return t ? esc(t.name) : '?';
    });
    cpHtml = `<div style="padding:12px 16px;background:var(--blue-10);border-left:3px solid var(--blue);margin-bottom:1.5rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--blue)">Critical Path:</span>
      ${cpNames.map((n, i) => `<span style="font-family:var(--fd);font-size:13px;font-weight:700;color:var(--blue)">${n}</span>${i < cpNames.length - 1 ? '<span style="color:var(--blue-40)">&#10132;</span>' : ''}`).join('')}
      <span style="font-family:var(--fd);font-size:11px;color:var(--blue-60);margin-left:auto">${STATE.criticalPath.length} steps</span>
    </div>`;
  }

  panel.innerHTML = cpHtml + '<div id="kanban-container"></div><div id="pipeline-dag-container" style="margin-top:2rem"></div>';

  renderKanban();
  renderPipelineDAG();
}

function renderKanban() {
  const container = document.getElementById('kanban-container');
  if (!container) return;

  const columns = {
    blocked:     { themes: [], cfg: STATUS_CONFIG.blocked },
    ready:       { themes: [], cfg: STATUS_CONFIG.ready },
    in_progress: { themes: [], cfg: STATUS_CONFIG.in_progress },
    done:        { themes: [], cfg: STATUS_CONFIG.done }
  };

  // Sort themes into columns
  STATE.topics.forEach(t => {
    const status = computeStatus(t.id);
    if (columns[status]) columns[status].themes.push(t);
  });

  // Sort each column by ICE descending
  Object.values(columns).forEach(col => {
    col.themes.sort((a, b) => (getThemeICE(b) ?? -1) - (getThemeICE(a) ?? -1));
  });

  let html = '<div class="kanban">';

  ['blocked', 'ready', 'in_progress', 'done'].forEach(status => {
    const col = columns[status];
    const cfg = col.cfg;

    html += `<div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-title" style="color:${cfg.color}">${cfg.label}</span>
        <span class="kanban-col-count">${col.themes.length}</span>
      </div>
      <div class="kanban-cards">`;

    col.themes.forEach(t => {
      const bv = STATE.projectDocs?.[t.id]?.value || {};
      const ice = getThemeICE(t);
      const blockedBy = bv.blocked_by || [];

      // Action button
      let btnHtml = '';
      if (status === 'ready') {
        btnHtml = `<button class="kanban-card-btn" style="background:var(--blue);color:white" onclick="toggleInitiativeStatus(${t.id},event)">Start</button>`;
      } else if (status === 'in_progress') {
        btnHtml = `<button class="kanban-card-btn" style="background:var(--green);color:var(--blue)" onclick="toggleInitiativeStatus(${t.id},event)">Complete</button>`;
      } else if (status === 'done') {
        btnHtml = `<button class="kanban-card-btn" style="background:var(--gray-10);color:var(--text-light)" onclick="toggleInitiativeStatus(${t.id},event)">Reopen</button>`;
      }

      // Blocker pills (only for blocked column)
      let blockerHtml = '';
      if (status === 'blocked') {
        blockerHtml = '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">' +
          blockedBy.map(b => {
            const bt = findThemeByName(b);
            const click = bt ? `onclick="event.stopPropagation();showView('project-${bt.id}')"` : '';
            return `<span style="font-family:var(--fd);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--red);background:#fde8e8;padding:2px 5px;${bt ? 'cursor:pointer' : ''}" ${click}>&#9888; ${esc(b)}</span>`;
          }).join('') + '</div>';
      }

      html += `<div class="kanban-card" onclick="showView('project-${t.id}')">
        <div class="kanban-card-color" style="background:${t.color}"></div>
        <div class="kanban-card-body">
          <div class="kanban-card-name">${esc(t.name)}</div>
          ${ice !== null ? `<span class="value-score ${ice >= 7 ? 'value-high' : ice >= 4 ? 'value-med' : 'value-low'}" style="width:26px;height:26px;font-size:12px">${ice}</span>` : ''}
          <div class="kanban-card-cat">${esc(t.category || 'General')}</div>
          ${blockerHtml}
          ${btnHtml}
        </div>
      </div>`;
    });

    html += '</div></div>';
  });

  html += '</div>';
  container.innerHTML = html;
}
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pipeline.js public/css/app.css
git commit -m "feat: implement kanban board with status columns and action buttons"
```

---

### Task 7: Implement Dependency DAG

**Files:**
- Modify: `public/js/pipeline.js`

- [ ] **Step 1: Add renderPipelineDAG() to pipeline.js**

Append to `public/js/pipeline.js`:

```javascript
// ── Dependency DAG ──────────────────────────────────────────────

let dagInstance = null;

function renderPipelineDAG() {
  const container = document.getElementById('pipeline-dag-container');
  if (!container) return;

  // Only show themes that have scores and at least one dependency relationship
  const scoredThemes = STATE.topics.filter(t => STATE.projectDocs?.[t.id]?.value);
  if (!scoredThemes.length) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:14px">Generate project docs to see the dependency graph.</div>';
    return;
  }

  // Build nodes and links
  const nodes = scoredThemes.map(t => {
    const ice = getThemeICE(t) || 3;
    const status = computeStatus(t.id);
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ready;
    return {
      id: t.id,
      name: t.name,
      ice: ice,
      status: status,
      color: cfg.color === 'var(--red)' ? '#a0200d' :
             cfg.color === 'var(--green-text)' ? '#5a7200' :
             cfg.color === 'var(--blue)' ? '#1d4c7e' : '#3c3c3c',
      val: Math.max(ice * 2, 6)
    };
  });

  const nodeIds = new Set(nodes.map(n => n.id));
  const links = [];
  scoredThemes.forEach(t => {
    const bv = STATE.projectDocs?.[t.id]?.value || {};
    (bv.blocks || []).forEach(blockedName => {
      const blocked = findThemeByName(blockedName);
      if (blocked && nodeIds.has(blocked.id)) {
        links.push({ source: t.id, target: blocked.id });
      }
    });
  });

  // Check if any links exist
  if (!links.length) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:14px">No dependency relationships found between themes.</div>';
    return;
  }

  // Critical path edge set for styling
  const cpSet = new Set();
  for (let i = 0; i < STATE.criticalPath.length - 1; i++) {
    cpSet.add(STATE.criticalPath[i] + '->' + STATE.criticalPath[i + 1]);
  }

  // Render container
  container.innerHTML = `
    <div style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--green-40)">Dependency Graph</div>
    <div style="display:flex;gap:2px">
      <div id="dag-graph" style="flex:1;height:400px;background:var(--charcoal);position:relative"></div>
      <div id="dag-detail" style="width:260px;background:white;border:1px solid var(--border);display:none;padding:16px;overflow-y:auto;max-height:400px"></div>
    </div>
    <div style="display:flex;gap:16px;margin-top:8px;font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#a0200d"></span>Blocked</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#5a7200"></span>Ready</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#1d4c7e"></span>In Progress</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#3c3c3c"></span>Done</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:16px;height:3px;background:var(--green)"></span>Critical Path</span>
    </div>`;

  const graphEl = document.getElementById('dag-graph');
  if (!graphEl) return;

  // Wait for element to be visible
  requestAnimationFrame(() => {
    const width = graphEl.clientWidth || 600;
    const height = graphEl.clientHeight || 400;

    if (dagInstance) { dagInstance._destructor?.(); dagInstance = null; }

    dagInstance = ForceGraph3D({ controlType: 'orbit' })(graphEl)
      .numDimensions(2)
      .width(width)
      .height(height)
      .backgroundColor('#3c3c3c')
      .graphData({ nodes, links })
      .nodeLabel(n => `${n.name} (ICE: ${n.ice})`)
      .nodeColor(n => n.color)
      .nodeVal(n => n.val)
      .linkDirectionalArrowLength(6)
      .linkDirectionalArrowRelPos(0.85)
      .linkColor(l => {
        const src = l.source?.id ?? l.source;
        const tgt = l.target?.id ?? l.target;
        return cpSet.has(src + '->' + tgt) ? '#aed136' : 'rgba(255,255,255,.2)';
      })
      .linkWidth(l => {
        const src = l.source?.id ?? l.source;
        const tgt = l.target?.id ?? l.target;
        return cpSet.has(src + '->' + tgt) ? 3 : 1;
      })
      .onNodeClick(node => showDAGDetail(node, links, nodes, cpSet));

    // Tweak forces for 2D DAG layout
    dagInstance.d3Force('charge').strength(-200);
    dagInstance.d3Force('link').distance(100);
  });
}

function showDAGDetail(node, links, nodes, cpSet) {
  const panel = document.getElementById('dag-detail');
  if (!panel) return;

  const t = STATE.topics.find(x => x.id === node.id);
  if (!t) return;

  const bv = STATE.projectDocs?.[t.id]?.value || {};
  const status = computeStatus(t.id);
  const ice = getThemeICE(t);

  // Find upstream (blockers) and downstream (enables)
  const upstream = (bv.blocked_by || []).map(name => {
    const theme = findThemeByName(name);
    return { name, id: theme?.id, status: theme ? computeStatus(theme.id) : null };
  });
  const downstream = (bv.blocks || []).map(name => {
    const theme = findThemeByName(name);
    return { name, id: theme?.id, status: theme ? computeStatus(theme.id) : null };
  });

  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="margin-bottom:12px">
      ${statusBadgeHtml(status)}
    </div>
    <div style="font-family:var(--fd);font-size:16px;font-weight:800;color:var(--blue);margin-bottom:4px">${esc(t.name)}</div>
    <div style="font-size:13px;color:var(--text-light);line-height:1.5;margin-bottom:12px">${esc(t.description || '')}</div>
    ${ice !== null ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)">ICE</span><span class="value-score ${ice >= 7 ? 'value-high' : ice >= 4 ? 'value-med' : 'value-low'}" style="width:30px;height:30px;font-size:13px">${ice}</span></div>` : ''}
    ${upstream.length ? `<div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin-bottom:6px">Blocked By</div>
    ${upstream.map(u => `<div style="padding:4px 0;font-size:14px;${u.id != null ? 'cursor:pointer' : ''}" ${u.id != null ? `onclick="showView('project-${u.id}')"` : ''}>${u.status === 'done' ? '<span style="color:var(--green-text)">&#10003;</span> <s>' : '<span style="color:var(--red)">&#9888;</span> '}${esc(u.name)}${u.status === 'done' ? '</s>' : ''}</div>`).join('')}` : ''}
    ${downstream.length ? `<div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--green-text);margin:12px 0 6px">Enables</div>
    ${downstream.map(d => `<div style="padding:4px 0;font-size:14px;${d.id != null ? 'cursor:pointer' : ''}" ${d.id != null ? `onclick="showView('project-${d.id}')"` : ''}>&#10132; ${esc(d.name)}</div>`).join('')}` : ''}
    <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;margin-top:16px" onclick="showView('project-${t.id}')">Open Project Page</button>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/pipeline.js
git commit -m "feat: implement interactive 2D dependency DAG with critical path highlighting"
```

---

### Task 8: Add Status Toggle to Project Page Header

**Files:**
- Modify: `public/js/projects.js:21-71`

- [ ] **Step 1: Add status toggle button to project page header**

In `renderProjectPage()`, find the header section that renders the theme name and metadata (around line 54-66). After the `hasDocs` span, add a status toggle:

```javascript
      const projStatus = computeStatus(topicId);
      const canToggle = projStatus !== 'blocked';
```

And in the HTML template, after the `${hasDocs ? '<span class="tag tag-green">Docs Generated</span>' : ''}` line, add:

```javascript
        ${statusBadgeHtml(projStatus)}
        ${canToggle ? `<button class="btn btn-secondary btn-sm" onclick="toggleInitiativeStatus(${topicId},event)" style="margin-left:8px">${projStatus === 'ready' ? 'Start' : projStatus === 'in_progress' ? 'Complete' : projStatus === 'done' ? 'Reopen' : ''}</button>` : ''}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/projects.js
git commit -m "feat: add initiative status toggle to project page header"
```

---

### Task 9: Final Integration & Polish

**Files:**
- Modify: `public/js/pipeline.js`
- Modify: `public/css/app.css`

- [ ] **Step 1: Add responsive CSS for kanban**

Append to `public/css/app.css`:

```css
  @media(max-width:900px) {
    .kanban { grid-template-columns:1fr 1fr; }
  }
  @media(max-width:600px) {
    .kanban { grid-template-columns:1fr; }
  }
```

- [ ] **Step 2: Handle pipeline resize for DAG**

Add to `renderPipelineDAG()`, after the `dagInstance` creation, add a resize handler:

At the top of pipeline.js, add:

```javascript
let dagResizeHandler = null;
```

And at the end of `renderPipelineDAG()`, after `dagInstance.d3Force(...)`:

```javascript
    // Handle resize
    if (dagResizeHandler) window.removeEventListener('resize', dagResizeHandler);
    dagResizeHandler = () => {
      if (dagInstance && graphEl.clientWidth) {
        dagInstance.width(graphEl.clientWidth).height(graphEl.clientHeight || 400);
      }
    };
    window.addEventListener('resize', dagResizeHandler);
```

- [ ] **Step 3: Commit all changes**

```bash
git add public/js/pipeline.js public/css/app.css
git commit -m "feat: add responsive kanban layout and DAG resize handling"
```

- [ ] **Step 4: Final commit with all uncommitted changes**

```bash
git add -A
git commit -m "feat: complete initiative pipeline with kanban, DAG, auto-scoring, and readiness tracking"
git push
```
