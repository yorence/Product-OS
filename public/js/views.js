// View routing and page rendering
// ═══════ RENDERING ═══════
function showView(view) {
  STATE.currentView = view;
  document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.sidebar-nav button').forEach(el => el.classList.remove('active'));
  const btn = document.querySelector(`[data-view="${view}"]`);
  if (btn) btn.classList.add('active');

  const titles = { meetings:'All Meetings', topics:'Themes Index', pipeline:'Initiative Pipeline', graph3d:'Knowledge Graph', policies:'Firm Policies' };

  // Handle project-N views
  if (view.startsWith('project-')) {
    // Block project navigation while themes are still being synthesized
    if (STATE.isSynthesizing) {
      document.getElementById('viewTitle').textContent = 'Themes Index';
      document.getElementById('view-topics').classList.remove('hidden');
      return;
    }
    const topicId = parseInt(view.replace('project-', ''));
    const topic = STATE.topics.find(t => t.id === topicId);
    document.getElementById('viewTitle').textContent = topic ? topic.name : 'Project';
    document.getElementById('view-project').classList.remove('hidden');
    renderProjectPage(topicId);
    return;
  }

  document.getElementById('viewTitle').textContent = titles[view] || view;
  const panel = document.getElementById('view-' + view);
  if (panel) panel.classList.remove('hidden');

  if (view === 'meetings') renderMeetings();
  else if (view === 'topics') renderTopics();
  else if (view === 'pipeline') renderPipeline();
  else if (view === 'graph3d') renderGraph3D();
  else if (view === 'policies') showPolicy('retention');
}

function renderMeetings() {
  // Show skeleton if still in initial load with no meetings yet
  if (STATE.isLoading && !STATE.meetings.length) {
    renderMeetingsSkeleton();
    return;
  }
  const stats = document.getElementById('meetingStats');
  const totalDur = STATE.meetings.reduce((sum, m) => {
    const s = new Date(m.recording_start_time), e = new Date(m.recording_end_time);
    return sum + (e - s) / 60000;
  }, 0);
  const uniqueParticipants = new Set();
  STATE.meetings.forEach(m => (m.calendar_invitees||[]).forEach(p => uniqueParticipants.add(p.email||p.name)));

  const topicCta = STATE.topicsUnlocked
    ? `<div class="stat-card" style="border-left-color:var(--blue);cursor:pointer" onclick="showView('topics')"><div class="label">Themes</div><div class="value">${STATE.topics.length}</div><div class="sub" style="color:var(--green-text)">View themes &rarr;</div></div>`
    : `<div class="stat-card" style="border-left-color:var(--green);background:linear-gradient(135deg,var(--green-10),white);cursor:pointer" onclick="showView('topics')"><div class="label" style="color:var(--green-text)">AI Theme Analysis</div><div class="value" style="font-size:1rem;color:var(--blue)">Unlock Themes</div><div class="sub">Synthesize initiatives across ${STATE.meetings.length} meetings with AI</div></div>`;

  stats.innerHTML = `
    <div class="stat-card"><div class="label">Total Meetings</div><div class="value">${STATE.meetings.length}</div></div>
    <div class="stat-card"><div class="label">Total Duration</div><div class="value">${Math.round(totalDur)} min</div><div class="sub">${(totalDur/60).toFixed(1)} hours</div></div>
    <div class="stat-card"><div class="label">Unique Participants</div><div class="value">${uniqueParticipants.size}</div></div>
    ${topicCta}
  `;

  const container = document.getElementById('meetingsTableContainer');
  if (!STATE.meetings.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">&#128197;</div><h3>No meetings found</h3><p>Your Fathom meetings will appear here once synced.</p></div>';
    return;
  }

  // Sort meetings
  const sort = STATE.meetingSort || { col: 'date', dir: 'desc' };
  const sorted = [...STATE.meetings].sort((a, b) => {
    let va, vb;
    const startA = new Date(a.recording_start_time || a.created_at);
    const startB = new Date(b.recording_start_time || b.created_at);
    switch (sort.col) {
      case 'title':
        va = (a.title || a.meeting_title || '').toLowerCase();
        vb = (b.title || b.meeting_title || '').toLowerCase();
        return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'date':
        return sort.dir === 'asc' ? startA - startB : startB - startA;
      case 'duration':
        va = new Date(a.recording_end_time || a.created_at) - startA;
        vb = new Date(b.recording_end_time || b.created_at) - startB;
        return sort.dir === 'asc' ? va - vb : vb - va;
      case 'participants':
        va = (a.calendar_invitees || []).length;
        vb = (b.calendar_invitees || []).length;
        return sort.dir === 'asc' ? va - vb : vb - va;
      default:
        return startB - startA;
    }
  });

  const arrow = (col) => sort.col === col ? (sort.dir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
  let html = `<table class="data-table"><thead><tr>
    <th class="sortable" onclick="sortMeetings('title')">Title${arrow('title')}</th>
    <th class="sortable" onclick="sortMeetings('date')">Date${arrow('date')}</th>
    <th>Time</th>
    <th class="sortable" onclick="sortMeetings('duration')">Duration${arrow('duration')}</th>
    <th class="sortable" onclick="sortMeetings('participants')">Participants${arrow('participants')}</th>
    <th>Topics</th>
  </tr></thead><tbody>`;
  sorted.forEach(m => {
    const start = new Date(m.recording_start_time || m.created_at);
    const end = new Date(m.recording_end_time || m.created_at);
    const dur = Math.round((end - start) / 60000);
    const participants = (m.calendar_invitees||[]).map(p => p.name || p.email || '').filter(Boolean).join(', ') || 'N/A';
    const mTopics = STATE.topics.filter(t => t.videoIds.includes(m.recording_id));
    const topicTags = mTopics.slice(0,3).map(t => `<span class="tag" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40">${t.name.split(',')[0]}</span>`).join(' ');
    html += `<tr onclick="showMeetingDetail(${m.recording_id})">
      <td class="title-cell">${esc(m.title || m.meeting_title || 'Untitled')}</td>
      <td class="date-cell">${start.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
      <td class="date-cell">${start.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</td>
      <td class="duration-cell">${dur} min</td>
      <td class="participants-cell">${esc(participants)}</td>
      <td>${topicTags || '<span style="color:var(--text-muted);font-size:.8rem">—</span>'}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function showMeetingDetail(recordingId) {
  const m = STATE.meetings.find(x => x.recording_id === recordingId);
  if (!m) return;
  document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));
  const panel = document.getElementById('view-meeting-detail');
  panel.classList.remove('hidden');
  document.getElementById('viewTitle').textContent = m.title || 'Meeting Detail';

  const start = new Date(m.recording_start_time || m.created_at);
  const end = new Date(m.recording_end_time || m.created_at);
  const dur = Math.round((end - start) / 60000);
  const participants = (m.calendar_invitees||[]).map(p => p.name || p.email).filter(Boolean);
  const summaryHtml = m.default_summary?.markdown_formatted ? simpleMarkdown(m.default_summary.markdown_formatted) : '<em style="color:var(--text-muted)">No summary available</em>';

  let transcriptHtml = '';
  if (m.transcript && m.transcript.length) {
    transcriptHtml = m.transcript.map(l => `<div class="transcript-line"><span class="ts">${l.timestamp||''}</span><span class="spk">${esc(l.speaker?.display_name||'')}</span><span class="txt">${esc(l.text)}</span></div>`).join('');
  }

  const mTopics = STATE.topics.filter(t => t.videoIds.includes(m.recording_id));
  const topicTags = mTopics.map(t => `<span class="tag" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40;cursor:pointer" onclick="showView('project-${t.id}')">${t.name}</span>`).join(' ');

  panel.innerHTML = `
    <div class="meeting-detail-header">
      <div>
        <h2><button class="back-btn" onclick="showView('meetings')">&larr;</button> ${esc(m.title || 'Untitled')}</h2>
        <div class="meeting-meta-row">
          <span>${start.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</span>
          <span>${start.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} &ndash; ${end.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} (${dur} min)</span>
          <span>${participants.length} participant${participants.length!==1?'s':''}</span>
        </div>
        ${topicTags ? '<div style="margin-top:.5rem">'+topicTags+'</div>' : ''}
      </div>
      ${m.share_url ? `<a href="${m.share_url}" target="_blank" class="btn btn-primary btn-sm">&#9654; Watch on Fathom</a>` : ''}
    </div>
    <div class="meeting-summary-card"><h3>AI Summary</h3><div class="summary-content">${summaryHtml}</div></div>
    ${m.action_items && m.action_items.length ? `<div class="meeting-summary-card"><h3>Action Items</h3><ul>${m.action_items.map(a => `<li>${esc(typeof a==='string'?a:a.text||JSON.stringify(a))}</li>`).join('')}</ul></div>` : ''}
    <div class="transcript-panel"><h3>Full Transcript (${(m.transcript||[]).length} segments)</h3><div class="transcript-body">${transcriptHtml || '<em style="color:var(--text-muted)">No transcript available</em>'}</div></div>
  `;
}

function renderTopics() {
  const stats = document.getElementById('topicStats');
  const container = document.getElementById('topicsContainer');

  // Don't overwrite the synthesis pipeline UI if it's running
  if (STATE.isSynthesizing) return;

  // Check if topics already unlocked
  if (STATE.topicsUnlocked && STATE.topics.length) {
    renderTopicsGrid();
    return;
  }

  // Check session cache
  try {
    const cached = sessionStorage.getItem('llm_topics');
    if (cached) {
      STATE.topics = JSON.parse(cached);
      STATE.topicsUnlocked = true;
      STATE.projectDocs = STATE.projectDocs || {};
      document.getElementById('topicCount').textContent = STATE.topics.length;
      populateProjectsSidebar();
      renderTopicsGrid();
      return;
    }
  } catch(e) {}

  // Show unlock screen — but block if meetings are still loading
  stats.innerHTML = '';
  const stillLoading = STATE.isLoading;

  if (stillLoading) {
    // Calculate progress
    const loaded = STATE.meetings.length;
    const withTranscripts = STATE.meetings.filter(m => m._detailLoaded).length;
    const phase = withTranscripts > 0 ? 'details' : 'list';
    const pct = phase === 'details' && loaded > 0
      ? Math.round((withTranscripts / loaded) * 100)
      : Math.min(loaded * 2, 50); // estimate during list phase

    container.innerHTML = `
      <div style="text-align:center;padding:4rem 2rem;max-width:480px;margin:0 auto">
        <div style="font-size:2.5rem;margin-bottom:1rem;opacity:.3">&#128218;</div>
        <h3 style="font-family:var(--fd);font-weight:800;font-size:20px;color:var(--blue);margin-bottom:.5rem">Cross-Meeting Theme Analysis</h3>
        <div style="padding:20px;background:#fff8ec;border-left:3px solid #f39c12;text-align:left;margin-bottom:1.5rem">
          <div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#b45309;margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <span class="pulse-dot" style="width:8px;height:8px;border-radius:50%;background:#f39c12;animation:pulse 1s infinite"></span>
            Loading meetings before theme analysis
          </div>
          <div style="background:var(--gray-20);height:8px;overflow:hidden;margin-bottom:10px">
            <div style="height:100%;background:#f39c12;transition:width .3s;width:${pct}%"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--charcoal);margin-bottom:6px">
            <span><strong>${loaded}</strong> meetings found</span>
            <span><strong>${withTranscripts}</strong>/${loaded} transcripts loaded</span>
          </div>
          <div style="font-size:13px;color:var(--text-light);line-height:1.5">
            ${phase === 'list'
              ? 'Fetching meeting list...'
              : withTranscripts < loaded
                ? 'Loading transcripts & summaries — almost there...'
                : 'Finalizing...'}
          </div>
        </div>
        <div style="opacity:.4;font-size:14px;color:var(--text-light)">The API key input will appear once all data is loaded.</div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div style="text-align:center;padding:4rem 2rem;max-width:480px;margin:0 auto">
        <div style="font-size:2.5rem;margin-bottom:1rem;opacity:.3">&#128218;</div>
        <h3 style="font-family:var(--fd);font-weight:800;font-size:20px;color:var(--blue);margin-bottom:.5rem">Cross-Meeting Theme Analysis</h3>
        <p style="font-size:15px;color:var(--text-light);line-height:1.6;margin-bottom:1.5rem">
          Synthesize themes across your <strong>${STATE.meetings.length}</strong> meetings using AI.
          Each theme becomes a project with auto-generated briefs, roadmaps, and diagrams.
        </p>
        <div style="margin-bottom:1rem;text-align:left">
          <label style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--blue);display:block;margin-bottom:.4rem">Perplexity API Key</label>
          <input type="password" id="perplexityKeyInput" placeholder="pplx-..." style="width:100%;padding:11px 14px;border:2px solid var(--gray-20);font-family:var(--fb);font-size:15px;color:var(--text)">
          <div style="font-size:12px;color:var(--text-muted);margin-top:.3rem">Get a key at <strong>perplexity.ai/settings/api</strong></div>
        </div>
        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="unlockTopics()">
          Unlock Theme Analysis
        </button>
      </div>
    `;
  }
}

// Helper: compute ICE for a theme
function getThemeICE(t) {
  const bv = STATE.projectDocs?.[t.id]?.value || {};
  const score = bv.score || 0;
  const effort = bv.effort ?? null;
  const confidence = bv.confidence ?? null;
  return (score && effort !== null && confidence !== null)
    ? +((score + effort + confidence) / 3).toFixed(1) : null;
}

function renderTopicsGrid() {
  const stats = document.getElementById('topicStats');
  const container = document.getElementById('topicsContainer');
  const totalSegs = STATE.topics.reduce((s,t) => s+t.segments.length, 0);
  const hasScores = STATE.topics.some(t => STATE.projectDocs?.[t.id]?.value?.score);
  const scored = hasScores ? STATE.topics.filter(t => STATE.projectDocs?.[t.id]?.value?.score).length : 0;
  const categories = [...new Set(STATE.topics.map(t => t.category || 'General'))];

  stats.innerHTML = `
    <div class="stat-card"><div class="label">Themes</div><div class="value">${STATE.topics.length}</div></div>
    <div class="stat-card"><div class="label">Categories</div><div class="value">${categories.length}</div></div>
    <div class="stat-card"><div class="label">Cross-Meeting</div><div class="value">${STATE.topics.filter(t=>t.videoCount>1).length}</div><div class="sub">Spanning 2+ meetings</div></div>
    <div class="stat-card"><div class="label">Scored</div><div class="value">${scored}/${STATE.topics.length}</div><div class="sub">${scored ? 'Generate docs for more' : 'Generate project docs to score'}</div></div>
  `;

  // Sort themes within each category
  const sort = STATE.themeSort || { col: 'ice', dir: 'desc' };
  const sortFn = (a, b) => {
    const bvA = STATE.projectDocs?.[a.id]?.value || {};
    const bvB = STATE.projectDocs?.[b.id]?.value || {};
    let va, vb;
    switch (sort.col) {
      case 'name':
        va = a.name.toLowerCase(); vb = b.name.toLowerCase();
        return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'score':
        va = bvA.score || 0; vb = bvB.score || 0;
        return sort.dir === 'asc' ? va - vb : vb - va;
      case 'effort':
        va = bvA.effort ?? -1; vb = bvB.effort ?? -1;
        return sort.dir === 'asc' ? va - vb : vb - va;
      case 'confidence':
        va = bvA.confidence ?? -1; vb = bvB.confidence ?? -1;
        return sort.dir === 'asc' ? va - vb : vb - va;
      case 'ice':
        va = getThemeICE(a) ?? -1; vb = getThemeICE(b) ?? -1;
        return sort.dir === 'asc' ? va - vb : vb - va;
      case 'meetings':
        va = a.videoCount || 0; vb = b.videoCount || 0;
        return sort.dir === 'asc' ? va - vb : vb - va;
      case 'readiness':
        const statusOrder = { blocked: 0, ready: 1, in_progress: 2, done: 3 };
        va = statusOrder[computeStatus(a.id)] ?? 1;
        vb = statusOrder[computeStatus(b.id)] ?? 1;
        if (va !== vb) return sort.dir === 'asc' ? va - vb : vb - va;
        return (getThemeICE(b) ?? -1) - (getThemeICE(a) ?? -1);
      default:
        return (getThemeICE(b) ?? -1) - (getThemeICE(a) ?? -1);
    }
  };

  // Group by category
  const grouped = {};
  STATE.topics.forEach(t => {
    const cat = t.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  });

  // Sort categories by best ICE/score in group
  const catOrder = Object.keys(grouped).sort((a, b) => {
    const bestA = Math.max(...grouped[a].map(t => getThemeICE(t) ?? (STATE.projectDocs?.[t.id]?.value?.score || 0)));
    const bestB = Math.max(...grouped[b].map(t => getThemeICE(t) ?? (STATE.projectDocs?.[t.id]?.value?.score || 0)));
    return bestB - bestA;
  });

  // Sort themes within each category
  catOrder.forEach(cat => grouped[cat].sort(sortFn));

  const arrow = (col) => sort.col === col ? (sort.dir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
  const scoreBadgeFn = (v) => v != null && v !== false
    ? `<span class="value-score ${v >= 7 ? 'value-high' : v >= 4 ? 'value-med' : 'value-low'}" style="width:30px;height:30px;font-size:13px">${v}</span>`
    : '<span style="color:var(--text-muted);font-size:13px">—</span>';

  // Initialize collapsed state if not set
  if (!STATE._catCollapsed) STATE._catCollapsed = {};

  let html = `<table class="data-table"><thead><tr>
    <th style="width:10px"></th>
    <th class="sortable" onclick="sortThemes('readiness')" style="width:80px">Status${arrow('readiness')}</th>
    <th class="sortable" onclick="sortThemes('name')">Theme${arrow('name')}</th>
    <th class="sortable" onclick="sortThemes('ice')" style="width:55px">ICE${arrow('ice')}</th>
    <th class="sortable" onclick="sortThemes('score')" style="width:55px">Impact${arrow('score')}</th>
    <th class="sortable" onclick="sortThemes('confidence')" style="width:55px">Conf.${arrow('confidence')}</th>
    <th class="sortable" onclick="sortThemes('effort')" style="width:55px">Ease${arrow('effort')}</th>
    <th class="sortable" onclick="sortThemes('meetings')" style="width:55px">Mtgs${arrow('meetings')}</th>
    <th style="width:130px">Blocked By</th>
    <th style="width:130px">Enables</th>
  </tr></thead><tbody>`;

  catOrder.forEach(cat => {
    const themes = grouped[cat];
    const collapsed = !!STATE._catCollapsed[cat];
    const catThemeCount = themes.length;
    const catAvgIce = themes.reduce((s, t) => s + (getThemeICE(t) || 0), 0) / catThemeCount;

    // Readiness summary for category
    const catStatuses = themes.map(t => computeStatus(t.id));
    const catSummary = ['blocked','ready','in_progress','done']
      .map(s => {
        const count = catStatuses.filter(x => x === s).length;
        return count ? `${count} ${STATUS_CONFIG[s].label.toLowerCase()}` : '';
      }).filter(Boolean).join(', ');

    // Category header row
    html += `<tr class="cat-row" onclick="toggleCategory('${esc(cat)}')" style="cursor:pointer;background:var(--blue-10);border-top:2px solid var(--blue-20)">
      <td colspan="3" style="padding:10px 12px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--blue);transition:transform var(--fast);transform:rotate(${collapsed ? '0' : '90'}deg)">&#9654;</span>
          <span style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue)">${esc(cat)}</span>
          <span style="font-family:var(--fd);font-size:11px;font-weight:600;color:var(--blue-60);background:var(--blue-20);padding:2px 8px">${catThemeCount}</span>
          <span style="font-family:var(--fb);font-size:12px;color:var(--blue-60)">${catSummary}</span>
        </div>
      </td>
      <td style="text-align:center;font-family:var(--fd);font-weight:700;font-size:13px;color:var(--blue)">${catAvgIce ? catAvgIce.toFixed(1) : '—'}</td>
      <td colspan="6"></td>
    </tr>`;

    if (collapsed) return;

    // Theme rows
    themes.forEach(t => {
      const bv = STATE.projectDocs?.[t.id]?.value || {};
      const score = bv.score || 0;
      const effort = bv.effort ?? null;
      const confidence = bv.confidence ?? null;
      const ice = getThemeICE(t);
      const blockedBy = (bv.blocked_by || []);
      const blocks = (bv.blocks || []);
      const readiness = computeStatus(t.id);

      // Blocked By column
      let blockedByHtml = '';
      blockedBy.forEach(b => {
        const bt = findThemeByName(b);
        const resolved = bt && computeStatus(bt.id) === 'done';
        if (resolved) {
          blockedByHtml += `<span style="font-family:var(--fd);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--green-text);background:var(--green-10);padding:2px 5px;display:inline-block;margin:1px;text-decoration:line-through;cursor:pointer" onclick="event.stopPropagation();showView('project-${bt.id}')">&#10003; ${esc(b)}</span>`;
        } else {
          const click = bt ? `onclick="event.stopPropagation();showView('project-${bt.id}')"` : '';
          blockedByHtml += `<span style="font-family:var(--fd);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--red);background:#fde8e8;padding:2px 5px;display:inline-block;margin:1px;${bt ? 'cursor:pointer' : ''}" ${click}>&#9888; ${esc(b)}</span>`;
        }
      });
      if (!blockedByHtml) blockedByHtml = '<span style="color:var(--text-muted);font-size:12px">—</span>';

      // Enables column
      let enablesHtml = '';
      blocks.forEach(b => {
        const et = findThemeByName(b);
        const click = et ? `onclick="event.stopPropagation();showView('project-${et.id}')"` : '';
        enablesHtml += `<span style="font-family:var(--fd);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--green-text);background:var(--green-10);padding:2px 5px;display:inline-block;margin:1px;${et ? 'cursor:pointer' : ''}" ${click}>&#10132; ${esc(b)}</span>`;
      });
      if (!enablesHtml) enablesHtml = '<span style="color:var(--text-muted);font-size:12px">—</span>';

      const iceBadge = ice !== null
        ? `<span style="font-family:var(--fd);font-weight:800;font-size:15px;color:${ice >= 7 ? 'var(--green-text)' : ice >= 4 ? '#b45309' : 'var(--charcoal)'}">${ice}</span>`
        : '<span style="color:var(--text-muted);font-size:13px">—</span>';

      html += `<tr onclick="showView('project-${t.id}')" style="cursor:pointer">
        <td style="padding:6px 4px"><div style="width:5px;height:100%;min-height:28px;background:${t.color}"></div></td>
        <td style="text-align:center">${statusBadgeHtml(readiness)}</td>
        <td>
          <div class="title-cell" style="white-space:normal;max-width:none">${esc(t.name)}</div>
          <div style="font-size:13px;color:var(--text-light);line-height:1.4;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(t.description || '')}</div>
        </td>
        <td style="text-align:center">${iceBadge}</td>
        <td style="text-align:center">${scoreBadgeFn(score || null)}</td>
        <td style="text-align:center">${scoreBadgeFn(confidence)}</td>
        <td style="text-align:center">${scoreBadgeFn(effort)}</td>
        <td style="text-align:center;font-family:var(--fd);font-weight:700;font-size:14px;color:var(--charcoal)">${t.videoCount}</td>
        <td>${blockedByHtml}</td>
        <td>${enablesHtml}</td>
      </tr>`;
    });
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// Toggle category collapse
function toggleCategory(cat) {
  if (!STATE._catCollapsed) STATE._catCollapsed = {};
  STATE._catCollapsed[cat] = !STATE._catCollapsed[cat];
  renderTopicsGrid();
}

// Sort themes table by column
function sortThemes(col) {
  const sort = STATE.themeSort || { col: 'score', dir: 'desc' };
  if (sort.col === col) {
    sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sort.col = col;
    sort.dir = col === 'name' ? 'asc' : 'desc';
  }
  STATE.themeSort = sort;
  renderTopicsGrid();
}

// Sort meetings table by column
function sortMeetings(col) {
  const sort = STATE.meetingSort || { col: 'date', dir: 'desc' };
  if (sort.col === col) {
    sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sort.col = col;
    sort.dir = col === 'title' ? 'asc' : 'desc';
  }
  STATE.meetingSort = sort;
  renderMeetings();
}

// showTopicDetail removed — theme cards now navigate directly to project pages
