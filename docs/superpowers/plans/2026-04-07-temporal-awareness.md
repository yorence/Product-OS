# Temporal Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add version history with meeting provenance, side-by-side diffs, and AI changelogs to project/theme pages.

**Architecture:** New `history.js` file handles all versioning: snapshot on generation, localStorage persistence with 5-version pruning, client-side LCS diff, background AI changelog via Perplexity. `projects.js` calls into history.js after doc generation. Project page gets a History tab, provenance badge, and meeting influence bars.

**Tech Stack:** Vanilla JS, localStorage, existing `perplexityCall()` for changelogs, client-side LCS diff algorithm.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `public/js/history.js` (new) | Version storage, diff computation, changelog generation, History tab rendering, provenance badge, meeting influence |
| `public/js/projects.js` | Call `saveVersion()` after generation, add History tab + provenance badge to project page |
| `public/index.html` | Add `<script>` tag for history.js |
| `public/css/app.css` | Timeline, diff highlights, provenance badge, influence bar, old-version banner styles |

---

### Task 1: Create history.js — Version Storage & Retrieval

**Files:**
- Create: `public/js/history.js`

- [ ] **Step 1: Create history.js with core storage functions**

Create `public/js/history.js`:

```javascript
// Version History — storage, diffing, changelogs, rendering
// ═══════════════════════════════════════════════════════════

const MAX_VERSIONS = 5;

// ── Storage ─────────────────────────────────────────────────

function getHistory(topicId) {
  try {
    const raw = localStorage.getItem('doc_history_' + topicId);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveHistory(topicId, history) {
  try {
    localStorage.setItem('doc_history_' + topicId, JSON.stringify(history));
  } catch (e) {
    console.warn('Failed to save version history:', e.message);
  }
}

function saveVersion(topicId, docs, type) {
  const history = getHistory(topicId);
  const prevVersion = history.length ? history[0].version : 0;

  // Gather provenance metadata
  const t = STATE.topics.find(x => x.id === topicId);
  const analyzable = STATE.meetings.filter(m =>
    (m.default_summary?.markdown_formatted?.length > 0) || (m.transcript?.length > 0)
  );
  const meetingIds = t ? t.videoIds.slice() : [];

  const entry = {
    version: prevVersion + 1,
    generated_at: Date.now(),
    meeting_ids: meetingIds,
    meeting_count: STATE.meetings.length,
    analyzable_count: analyzable.length,
    type: type, // 'full' | 'value_only'
    docs: JSON.parse(JSON.stringify(docs)), // deep clone
    changelog: null
  };

  // If latest is value_only and we're now doing a full generation, replace it
  if (type === 'full' && history.length && history[0].type === 'value_only') {
    entry.version = history[0].version; // keep same version number
    history[0] = entry;
  } else {
    history.unshift(entry);
  }

  // Prune to max
  while (history.length > MAX_VERSIONS) history.pop();

  saveHistory(topicId, history);

  // Generate changelog in background for full generations
  if (type === 'full' && history.length > 1) {
    generateChangelog(topicId, entry, history[1]);
  } else if (type === 'full') {
    // First generation — set a static changelog
    entry.changelog = 'Initial generation from ' + entry.analyzable_count + ' meetings.';
    saveHistory(topicId, history);
  }

  return entry;
}

function clearHistory(topicId) {
  try { localStorage.removeItem('doc_history_' + topicId); } catch (e) {}
}

function clearAllHistory() {
  STATE.topics.forEach(t => clearHistory(t.id));
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/history.js
git commit -m "feat: add history.js with version storage, save, and prune logic"
```

---

### Task 2: AI Changelog Generation

**Files:**
- Modify: `public/js/history.js`

- [ ] **Step 1: Add generateChangelog function**

Append to `public/js/history.js`:

```javascript
// ── AI Changelog ────────────────────────────────────────────

async function generateChangelog(topicId, newVersion, oldVersion) {
  if (!STATE.perplexityKey) return;

  const t = STATE.topics.find(x => x.id === topicId);
  const themeName = t ? t.name : 'Unknown';

  const oldVal = oldVersion?.docs?.value || {};
  const newVal = newVersion?.docs?.value || {};

  // Find new meetings
  const oldIds = new Set(oldVersion?.meeting_ids || []);
  const newMeetings = (newVersion.meeting_ids || []).filter(id => !oldIds.has(id));
  const newMeetingNames = newMeetings.map(id => {
    const m = STATE.meetings.find(x => x.recording_id === id);
    return m ? (m.title || 'Untitled') : 'Unknown';
  }).slice(0, 5); // cap at 5 names for prompt size

  const prompt = `Compare two versions of project docs for "${themeName}" at Kaufman Rossin.

PREVIOUS (v${oldVersion?.version || '?'}, ${new Date(oldVersion?.generated_at || 0).toLocaleDateString()}):
- Score: ${oldVal.score || '?'}, Effort: ${oldVal.effort ?? '?'}, Confidence: ${oldVal.confidence ?? '?'}
- Meetings: ${oldVersion?.analyzable_count || '?'}
${oldVersion?.docs?.brief ? '- Brief excerpt: ' + oldVersion.docs.brief.substring(0, 150) : ''}

CURRENT (v${newVersion.version}, ${new Date(newVersion.generated_at).toLocaleDateString()}):
- Score: ${newVal.score || '?'}, Effort: ${newVal.effort ?? '?'}, Confidence: ${newVal.confidence ?? '?'}
- Meetings: ${newVersion.analyzable_count}${newMeetingNames.length ? ' (' + newMeetingNames.length + ' new: "' + newMeetingNames.join('", "') + '")' : ''}
${newVersion.docs?.brief ? '- Brief excerpt: ' + newVersion.docs.brief.substring(0, 150) : ''}

Write 2-4 sentences summarizing what changed and why. Focus on score changes, new insights, shifted priorities, new/removed action items.`;

  try {
    const raw = await perplexityCall(STATE.perplexityKey, prompt, 300);
    // Store changelog in the version entry
    const history = getHistory(topicId);
    const target = history.find(v => v.version === newVersion.version);
    if (target) {
      target.changelog = raw.replace(/^["']|["']$/g, '').trim();
      saveHistory(topicId, history);
    }
    // Re-render history tab if it's currently visible
    const historyPanel = document.getElementById('ptab-history-' + topicId);
    if (historyPanel && historyPanel.classList.contains('active')) {
      historyPanel.innerHTML = renderHistoryTabContent(topicId);
    }
  } catch (e) {
    console.warn('Changelog generation failed:', e.message);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/history.js
git commit -m "feat: add background AI changelog generation via Perplexity"
```

---

### Task 3: Client-Side Diff Engine

**Files:**
- Modify: `public/js/history.js`

- [ ] **Step 1: Add LCS text diff and structured diff functions**

Append to `public/js/history.js`:

```javascript
// ── Diff Engine ─────────────────────────────────────────────

// Longest Common Subsequence for line-by-line text diff
function computeTextDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');

  // Build LCS table
  const m = oldLines.length, n = newLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'same', text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', text: oldLines[i - 1] });
      i--;
    }
  }

  return result;
}

// Structured diff for JSON objects (business case, prep)
function computeStructuredDiff(oldObj, newObj) {
  const allKeys = [...new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})])];
  const changes = [];

  allKeys.forEach(key => {
    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];

    // Skip docs/large nested objects — handled per-artifact
    if (key === 'docs') return;

    if (Array.isArray(oldVal) || Array.isArray(newVal)) {
      const oldArr = oldVal || [];
      const newArr = newVal || [];
      if (JSON.stringify(oldArr) !== JSON.stringify(newArr)) {
        changes.push({ key, type: 'array', old: oldArr, new: newArr });
      }
    } else if (typeof oldVal === 'object' || typeof newVal === 'object') {
      // Skip nested objects for now
    } else if (oldVal !== newVal) {
      changes.push({ key, type: 'value', old: oldVal, new: newVal });
    }
  });

  return changes;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/history.js
git commit -m "feat: add client-side LCS text diff and structured field diff"
```

---

### Task 4: History Tab Rendering

**Files:**
- Modify: `public/js/history.js`

- [ ] **Step 1: Add history tab content renderer**

Append to `public/js/history.js`:

```javascript
// ── History Tab Rendering ───────────────────────────────────

function renderHistoryTabContent(topicId) {
  const history = getHistory(topicId);

  if (!history.length) {
    return '<div style="text-align:center;padding:3rem;color:var(--text-muted)"><p>No version history yet. Generate project docs to create the first version.</p></div>';
  }

  let html = '<div class="version-timeline">';

  history.forEach((v, idx) => {
    const date = new Date(v.generated_at);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const isCurrent = idx === 0;
    const isFull = v.type === 'full';
    const prevVersion = history[idx + 1] || null;

    // New meetings since prior version
    let newMeetingsHtml = '';
    if (prevVersion) {
      const oldIds = new Set(prevVersion.meeting_ids || []);
      const newIds = (v.meeting_ids || []).filter(id => !oldIds.has(id));
      if (newIds.length) {
        const names = newIds.map(id => {
          const m = STATE.meetings.find(x => x.recording_id === id);
          return m ? esc(m.title || 'Untitled') : 'Unknown';
        });
        newMeetingsHtml = `<div style="font-size:13px;color:var(--text-light);margin-top:4px">${newIds.length} new meeting${newIds.length !== 1 ? 's' : ''} since v${prevVersion.version}: <span style="color:var(--charcoal)">${names.join(', ')}</span></div>`;
      }
    }

    // Changelog
    let changelogHtml = '';
    if (v.changelog) {
      changelogHtml = `<div style="font-family:var(--fb);font-size:14px;font-style:italic;color:var(--text-light);line-height:1.55;margin-top:6px;padding:8px 12px;background:var(--bg);border-left:2px solid var(--green-40)">${esc(v.changelog)}</div>`;
    } else if (isFull && idx < history.length - 1) {
      changelogHtml = '<div style="font-size:13px;color:var(--text-muted);margin-top:6px"><span class="loading-inline" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></span>Generating changelog...</div>';
    } else if (v.type === 'value_only') {
      changelogHtml = '<div style="font-size:13px;color:var(--text-muted);margin-top:4px">Value-only generation — no changelog</div>';
    }

    // Buttons
    const viewBtn = `<button class="btn btn-secondary btn-sm" onclick="viewOldVersion(${topicId},${v.version})" style="font-size:10px;padding:4px 10px">${isCurrent ? 'Current' : 'View'}</button>`;
    const compareBtn = prevVersion ? `<button class="btn btn-secondary btn-sm" onclick="showVersionDiff(${topicId},${prevVersion.version},${v.version})" style="font-size:10px;padding:4px 10px">Compare with v${prevVersion.version}</button>` : '';

    html += `<div class="version-entry" style="display:flex;gap:16px;padding:16px 0;${idx < history.length - 1 ? 'border-bottom:1px solid var(--gray-10);' : ''}">
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;width:24px">
        <div style="width:12px;height:12px;border-radius:50%;${isFull ? 'background:var(--blue)' : 'border:2px solid var(--blue-40);background:white'}"></div>
        ${idx < history.length - 1 ? '<div style="flex:1;width:1px;background:var(--gray-20)"></div>' : ''}
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-family:var(--fd);font-size:14px;font-weight:700;color:var(--blue)">v${v.version}</span>
          <span style="font-size:14px;color:var(--charcoal)">${dateStr}, ${timeStr}</span>
          ${isCurrent ? '<span style="font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--green-text);background:var(--green-10);padding:2px 8px">Current</span>' : ''}
          ${v.type === 'value_only' ? '<span style="font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);background:var(--gray-10);padding:2px 8px">Value Only</span>' : ''}
        </div>
        <div style="font-size:13px;color:var(--text-light);margin-top:2px">From ${v.analyzable_count} of ${v.meeting_count} meetings</div>
        ${newMeetingsHtml}
        ${changelogHtml}
        <div style="display:flex;gap:6px;margin-top:8px">${viewBtn} ${compareBtn}</div>
      </div>
    </div>`;
  });

  html += '</div>';
  return html;
}
```

- [ ] **Step 2: Add view/restore old version functions**

Append to `public/js/history.js`:

```javascript
// ── View Old Version ────────────────────────────────────────

let _viewingOldVersion = null; // { topicId, version } or null

function viewOldVersion(topicId, version) {
  const history = getHistory(topicId);
  const entry = history.find(v => v.version === version);
  if (!entry) return;

  const isCurrent = history[0]?.version === version;
  if (isCurrent) {
    restoreLatestVersion(topicId);
    return;
  }

  // Temporarily swap docs
  _viewingOldVersion = { topicId, version, originalDocs: STATE.projectDocs[topicId] };
  STATE.projectDocs[topicId] = entry.docs;
  renderProjectPage(topicId);

  // Add old-version banner at top of project panel
  const panel = document.getElementById('view-project');
  if (panel) {
    const banner = document.createElement('div');
    banner.id = 'old-version-banner';
    banner.style.cssText = 'padding:10px 16px;background:#fff8ec;border-left:3px solid #f39c12;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between';
    banner.innerHTML = `<span style="font-family:var(--fd);font-size:13px;font-weight:700;color:#b45309">Viewing v${version} (${new Date(entry.generated_at).toLocaleDateString()}) — not current</span><button class="btn btn-secondary btn-sm" onclick="restoreLatestVersion(${topicId})" style="font-size:10px;padding:4px 10px">Back to latest</button>`;
    panel.prepend(banner);
  }
}

function restoreLatestVersion(topicId) {
  if (_viewingOldVersion && _viewingOldVersion.topicId === topicId) {
    STATE.projectDocs[topicId] = _viewingOldVersion.originalDocs;
    _viewingOldVersion = null;
  }
  renderProjectPage(topicId);
}
```

- [ ] **Step 3: Commit**

```bash
git add public/js/history.js
git commit -m "feat: add history tab timeline, view old version, and restore"
```

---

### Task 5: Diff View Rendering

**Files:**
- Modify: `public/js/history.js`

- [ ] **Step 1: Add diff view renderer**

Append to `public/js/history.js`:

```javascript
// ── Diff View ───────────────────────────────────────────────

function showVersionDiff(topicId, oldVersionNum, newVersionNum) {
  const history = getHistory(topicId);
  const oldV = history.find(v => v.version === oldVersionNum);
  const newV = history.find(v => v.version === newVersionNum);
  if (!oldV || !newV) return;

  const panel = document.getElementById('ptab-history-' + topicId);
  if (!panel) return;

  let html = renderHistoryTabContent(topicId);

  // Diff header
  html += `<div style="margin-top:1.5rem;padding-top:1rem;border-top:2px solid var(--green-40)">
    <div style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin-bottom:12px">Comparing v${oldVersionNum} → v${newVersionNum}</div>`;

  // Business Case structured diff
  if (oldV.docs?.value || newV.docs?.value) {
    const valChanges = computeStructuredDiff(oldV.docs?.value || {}, newV.docs?.value || {});
    if (valChanges.length) {
      html += `<div style="background:white;border:1px solid var(--border);margin-bottom:1rem;box-shadow:var(--sh-sm);overflow:hidden">
        <div style="padding:10px 16px;border-bottom:2px solid var(--green-40)"><span style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--green-text)">Business Case</span></div>
        <div style="padding:12px 16px">`;
      valChanges.forEach(c => {
        if (c.type === 'value') {
          const changed = c.old != null && c.new != null && c.old !== c.new;
          html += `<div style="display:flex;gap:12px;padding:4px 0;font-size:14px">
            <span style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);width:120px;flex-shrink:0">${esc(c.key)}</span>
            ${changed ? `<span style="color:var(--red);text-decoration:line-through">${esc(String(c.old ?? ''))}</span> <span style="color:var(--green-text);font-weight:600">→ ${esc(String(c.new ?? ''))}</span>` : `<span style="color:var(--text-muted)">${esc(String(c.new ?? ''))}</span>`}
          </div>`;
        }
      });
      html += '</div></div>';
    }
  }

  // Markdown artifact diffs
  const mdArtifacts = ['brief', 'roadmap', 'security', 'pipeline', 'process'];
  const mdLabels = { brief: 'Product Brief', roadmap: 'Roadmap', security: 'Security', pipeline: 'Data Pipeline', process: 'Process' };

  mdArtifacts.forEach(key => {
    const oldText = oldV.docs?.[key] || '';
    const newText = newV.docs?.[key] || '';
    if (oldText === newText) return;
    if (!oldText && !newText) return;

    const diff = computeTextDiff(oldText, newText);
    const changedLines = diff.filter(d => d.type !== 'same').length;

    html += `<details style="background:white;border:1px solid var(--border);margin-bottom:1rem;box-shadow:var(--sh-sm)">
      <summary style="padding:10px 16px;cursor:pointer;font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--green-text);border-bottom:1px solid var(--border)">${mdLabels[key] || key} <span style="font-weight:600;color:var(--text-muted);text-transform:none;letter-spacing:0;font-size:12px">(${changedLines} lines changed)</span></summary>
      <div style="padding:0;font-family:'Cascadia Code','Fira Code',monospace;font-size:13px;line-height:1.6;max-height:400px;overflow-y:auto">`;

    diff.forEach(d => {
      const bg = d.type === 'added' ? 'var(--green-10)' : d.type === 'removed' ? '#fde8e8' : 'transparent';
      const color = d.type === 'added' ? 'var(--green-text)' : d.type === 'removed' ? 'var(--red)' : 'var(--text)';
      const prefix = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' ';
      const textDeco = d.type === 'removed' ? 'text-decoration:line-through;' : '';
      html += `<div style="padding:1px 16px;background:${bg};color:${color};${textDeco}white-space:pre-wrap"><span style="color:var(--text-muted);margin-right:8px">${prefix}</span>${esc(d.text)}</div>`;
    });

    html += '</div></details>';
  });

  html += '</div>';
  panel.innerHTML = html;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/history.js
git commit -m "feat: add side-by-side diff view for structured and markdown artifacts"
```

---

### Task 6: Provenance Badge & Meeting Influence

**Files:**
- Modify: `public/js/history.js`

- [ ] **Step 1: Add provenance badge renderer**

Append to `public/js/history.js`:

```javascript
// ── Provenance Badge ────────────────────────────────────────

function renderProvenanceBadge(topicId) {
  const history = getHistory(topicId);
  if (!history.length) return '';

  const latest = history[0];
  const date = new Date(latest.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return `<div style="font-family:var(--fd);font-size:12px;color:var(--text-muted);margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
    <span>Generated ${date}</span>
    <span style="color:var(--gray-40)">&middot;</span>
    <span>v${latest.version}</span>
    <span style="color:var(--gray-40)">&middot;</span>
    <span>from ${latest.analyzable_count} of ${latest.meeting_count} meetings</span>
    <span style="color:var(--blue);cursor:pointer;text-decoration:underline" onclick="switchToHistoryTab(${topicId})">History &#8250;</span>
  </div>`;
}

function switchToHistoryTab(topicId) {
  const btn = document.querySelector('.proj-tab[onclick*="ptab-history-' + topicId + '"]');
  if (btn) btn.click();
}

// ── Meeting Influence ───────────────────────────────────────

function renderMeetingInfluence(topicId) {
  const t = STATE.topics.find(x => x.id === topicId);
  if (!t || !t.segments.length) return '';

  // Aggregate relevance scores by meeting
  const meetingScores = {};
  t.segments.forEach(s => {
    if (!meetingScores[s.meetingId]) meetingScores[s.meetingId] = { title: s.meetingTitle, date: s.meetingDate, score: 0 };
    meetingScores[s.meetingId].score += (s.relevanceScore || 0);
  });

  const entries = Object.values(meetingScores).sort((a, b) => b.score - a.score);
  if (!entries.length) return '';
  const maxScore = entries[0].score || 1;

  let html = '<div style="margin-top:1rem"><div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin-bottom:8px">Meeting Influence</div>';

  entries.forEach(e => {
    const pct = Math.round((e.score / maxScore) * 100);
    html += `<div style="display:flex;align-items:center;gap:10px;padding:4px 0;font-size:13px">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--charcoal)">${esc(e.title)}</span>
      <div style="width:120px;height:6px;background:var(--gray-10);flex-shrink:0"><div style="height:100%;width:${pct}%;background:var(--green)"></div></div>
      <span style="font-family:var(--fd);font-size:11px;font-weight:700;color:var(--text-muted);width:35px;text-align:right">${pct}%</span>
    </div>`;
  });

  html += '</div>';
  return html;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/history.js
git commit -m "feat: add provenance badge and meeting influence bars"
```

---

### Task 7: Integrate into Project Page

**Files:**
- Modify: `public/js/projects.js:21-77` (renderProjectPage)
- Modify: `public/js/projects.js:378-387` (generateProjectDocs save)
- Modify: `public/js/projects.js:127-180` (generateValueOnly save)

- [ ] **Step 1: Add History tab to project page tab bar**

In `public/js/projects.js`, in `renderProjectPage()`, modify the `artifactTabs` and `artifactLabels` to include history:

Replace:
```javascript
  const artifactTabs = ['prep', 'value', 'brief', 'roadmap', 'security', 'pipeline', 'process'];
  const artifactLabels = { prep:'Meeting Prep', value:'Business Case', brief:'Product Brief', roadmap:'Roadmap', security:'Security', pipeline:'Data Pipeline', process:'Process' };
```

With:
```javascript
  const artifactTabs = ['prep', 'value', 'brief', 'roadmap', 'security', 'pipeline', 'process', 'history'];
  const artifactLabels = { prep:'Meeting Prep', value:'Business Case', brief:'Product Brief', roadmap:'Roadmap', security:'Security', pipeline:'Data Pipeline', process:'Process', history:'History' };
```

- [ ] **Step 2: Add history tab content rendering**

In the `artifactContent` map, the history tab needs special handling. Replace the `artifactContent` const:

Replace:
```javascript
  const artifactContent = artifactTabs.map(a => {
    const content = hasDocs && docs[a]
      ? (a === 'prep' ? renderPrepArtifact(docs[a]) : a === 'value' ? renderBusinessCase(docs[a]) : renderStructuredDoc(docs[a], artifactLabels[a]))
      : `<div class="proj-gen-banner">
```

With:
```javascript
  const artifactContent = artifactTabs.map(a => {
    if (a === 'history') {
      const histContent = typeof renderHistoryTabContent === 'function' ? renderHistoryTabContent(topicId) : '<div style="color:var(--text-muted);padding:2rem;text-align:center">History not available</div>';
      return `<div class="proj-tab-content" id="ptab-${a}-${topicId}">${histContent}</div>`;
    }
    const content = hasDocs && docs[a]
      ? (a === 'prep' ? renderPrepArtifact(docs[a]) : a === 'value' ? renderBusinessCase(docs[a]) : renderStructuredDoc(docs[a], artifactLabels[a]))
      : `<div class="proj-gen-banner">
```

- [ ] **Step 3: Add provenance badge and meeting influence to header**

In `renderProjectPage()`, after the status badge line (around line 70), add the provenance badge. Replace:

```javascript
      </div>
    </div>
    ${tabButtons}
    ${overviewTab}
```

With:

```javascript
      </div>
      ${typeof renderProvenanceBadge === 'function' ? renderProvenanceBadge(topicId) : ''}
    </div>
    ${tabButtons}
    ${overviewTab}
```

- [ ] **Step 4: Add meeting influence to overview tab**

In `buildTopicOverviewHtml()`, at the end of the function (before `return html;`), add:

```javascript
  // Meeting influence bars
  if (typeof renderMeetingInfluence === 'function') {
    html = renderMeetingInfluence(topicId || t.id) + html;
  }
```

Wait — `buildTopicOverviewHtml` receives `t` not `topicId`. Let me adjust. Add the `topicId` to the function. Actually, `t.id` is available. Replace the last line of `buildTopicOverviewHtml` before the closing brace:

At the end of `buildTopicOverviewHtml`, before `return html;`, add:

```javascript
  if (typeof renderMeetingInfluence === 'function') {
    html = renderMeetingInfluence(t.id) + html;
  }
```

- [ ] **Step 5: Call saveVersion after doc generation**

In `generateProjectDocs()`, after the line `STATE.projectDocs[topicId] = docs;` and before `try { sessionStorage.setItem(...)`, add:

```javascript
    // Save version snapshot
    if (typeof saveVersion === 'function') saveVersion(topicId, docs, 'full');
```

In `generateValueOnly()`, after the line `STATE.projectDocs[topicId].value = value;` and before `try { sessionStorage.setItem(...)`, add:

```javascript
  if (typeof saveVersion === 'function') saveVersion(topicId, STATE.projectDocs[topicId], 'value_only');
```

- [ ] **Step 6: Commit**

```bash
git add public/js/projects.js
git commit -m "feat: integrate version history into project page — History tab, provenance, influence"
```

---

### Task 8: HTML Script Tag & CSS Styles

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/app.css`

- [ ] **Step 1: Add history.js script tag**

In `public/index.html`, add after the `pipeline.js` script tag:

```html
<script src="js/history.js"></script>
```

- [ ] **Step 2: Add CSS styles for timeline, diff, and provenance**

Append to `public/css/app.css` before the responsive section:

```css
  /* ── Version History ── */
  .version-timeline { padding:0 0 1rem; }
  .version-entry:hover { background:var(--bg); }
  .diff-added { background:var(--green-10); color:var(--green-text); }
  .diff-removed { background:#fde8e8; color:var(--red); text-decoration:line-through; }
  .diff-same { color:var(--text); }
```

- [ ] **Step 3: Clear history on disconnect**

In `public/js/api.js`, in the `disconnect()` function, after the existing sessionStorage removal line, add:

```javascript
  if (typeof clearAllHistory === 'function') clearAllHistory();
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/css/app.css public/js/api.js
git commit -m "feat: add history.js script tag, timeline CSS, and clear history on disconnect"
```

- [ ] **Step 5: Final push**

```bash
git add -A
git commit -m "feat: complete temporal awareness — version history, provenance, diffs, changelogs"
git push
```
