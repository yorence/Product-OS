// View routing and page rendering
// ═══════ RENDERING ═══════
function showView(view) {
  STATE.currentView = view;
  document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.sidebar-nav button').forEach(el => el.classList.remove('active'));
  const btn = document.querySelector(`[data-view="${view}"]`);
  if (btn) btn.classList.add('active');

  const titles = { meetings:'All Meetings', topics:'Themes Index', graph3d:'Knowledge Graph', policies:'Firm Policies' };

  // Handle project-N views
  if (view.startsWith('project-')) {
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
  else if (view === 'graph3d') renderGraph3D();
  else if (view === 'policies') showPolicy('retention');
}

function renderMeetings() {
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

  const sorted = [...STATE.meetings].sort((a,b) => new Date(b.recording_start_time||b.created_at) - new Date(a.recording_start_time||a.created_at));
  let html = '<table class="data-table"><thead><tr><th>Title</th><th>Date</th><th>Time</th><th>Duration</th><th>Participants</th><th>Topics</th></tr></thead><tbody>';
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
  container.innerHTML = `
    <div style="text-align:center;padding:4rem 2rem;max-width:480px;margin:0 auto">
      <div style="font-size:2.5rem;margin-bottom:1rem;opacity:.3">&#128218;</div>
      <h3 style="font-family:var(--fd);font-weight:800;font-size:20px;color:var(--blue);margin-bottom:.5rem">Cross-Meeting Theme Analysis</h3>
      ${stillLoading ? `
        <div style="padding:16px;background:#fff8ec;border-left:3px solid #f39c12;text-align:left;margin-bottom:1.5rem">
          <div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#b45309;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span class="pulse-dot" style="width:8px;height:8px;border-radius:50%;background:#f39c12;animation:pulse 1s infinite"></span> Meetings still loading</div>
          <div style="font-size:14px;color:var(--text-light);line-height:1.5">${STATE.meetings.length} meetings loaded so far. Please wait for all meetings to finish loading before analyzing themes — this ensures no discussions are missed.</div>
        </div>
      ` : `
        <p style="font-size:15px;color:var(--text-light);line-height:1.6;margin-bottom:1.5rem">
          Synthesize themes across your ${STATE.meetings.length} meetings using AI.
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
      `}
    </div>
  `;
}

function renderTopicsGrid() {
  const stats = document.getElementById('topicStats');
  const container = document.getElementById('topicsContainer');
  const totalSegs = STATE.topics.reduce((s,t) => s+t.segments.length, 0);
  stats.innerHTML = `
    <div class="stat-card"><div class="label">Themes</div><div class="value">${STATE.topics.length}</div></div>
    <div class="stat-card"><div class="label">Segments</div><div class="value">${totalSegs}</div></div>
    <div class="stat-card"><div class="label">Meetings</div><div class="value">${STATE.meetings.filter(m=>m.transcript&&m.transcript.length).length}</div></div>
    <div class="stat-card"><div class="label">Cross-Meeting</div><div class="value">${STATE.topics.filter(t=>t.videoCount>1).length}</div><div class="sub">Spanning 2+ meetings</div></div>
  `;

  // Check if any themes have business value scores (from generated project docs)
  const hasScores = STATE.topics.some(t => STATE.projectDocs?.[t.id]?.value?.score);

  let html = '';

  // Priority Matrix (shown if any scores exist)
  if (hasScores) {
    const scored = STATE.topics
      .map(t => ({ ...t, bv: STATE.projectDocs?.[t.id]?.value || {} }))
      .filter(t => t.bv.score)
      .sort((a, b) => (b.bv.score || 0) - (a.bv.score || 0));

    if (scored.length) {
      html += `<div style="margin-bottom:2rem">
        <h3 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid var(--green-40)">Priority Matrix</h3>`;

      scored.forEach((t, i) => {
        const score = t.bv.score || 0;
        const barColor = score >= 7 ? 'var(--green)' : score >= 4 ? '#f39c12' : 'var(--gray-40)';
        const blockedBy = (t.bv.blocked_by || []);
        const blocks = (t.bv.blocks || []);
        html += `<div class="priority-row" onclick="showView('project-${t.id}')">
          <div class="priority-rank">${i + 1}</div>
          <div class="value-score ${score >= 7 ? 'value-high' : score >= 4 ? 'value-med' : 'value-low'}" style="width:36px;height:36px;font-size:16px">${score}</div>
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--fd);font-size:14px;font-weight:700;color:var(--blue);margin-bottom:2px">${esc(t.name)}</div>
            <div class="priority-bar"><div class="priority-bar-fill" style="width:${score * 10}%;background:${barColor}"></div></div>
            <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
              ${blockedBy.map(b => `<span style="font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--red);background:#fde8e8;padding:2px 6px">Blocked by: ${esc(b)}</span>`).join('')}
              ${blocks.map(b => `<span style="font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--green-text);background:var(--green-10);padding:2px 6px">Enables: ${esc(b)}</span>`).join('')}
            </div>
          </div>
        </div>`;
      });
      html += '</div>';
    }
  }

  // Theme cards grid
  html += '<div class="topics-grid">';
  STATE.topics.forEach(t => {
    const videoNames = t.videoIds.map(id => {
      const m = STATE.meetings.find(x => x.recording_id === id);
      return m ? (m.title || 'Untitled').substring(0, 30) : 'Unknown';
    });
    const bv = STATE.projectDocs?.[t.id]?.value;
    const scoreHtml = bv?.score ? `<span class="value-score ${bv.score >= 7 ? 'value-high' : bv.score >= 4 ? 'value-med' : 'value-low'}" style="width:28px;height:28px;font-size:13px;position:absolute;top:12px;right:12px">${bv.score}</span>` : '';
    html += `<div class="topic-card" onclick="showView('project-${t.id}')">
      <div class="topic-color" style="background:${t.color}"></div>
      ${scoreHtml}
      <h3>${esc(t.name)}</h3>
      <div class="topic-meta">
        <span>${t.videoCount} meeting${t.videoCount!==1?'s':''}</span>
        <span>${t.segments.length} segment${t.segments.length!==1?'s':''}</span>
      </div>
      <div class="topic-videos">${videoNames.map(n => `<span class="video-tag">${esc(n)}</span>`).join('')}</div>
      <div class="topic-summary">${esc(t.description || t.segments[0]?.text?.substring(0,180) || '')}${t.description ? '' : '...'}</div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

// showTopicDetail removed — theme cards now navigate directly to project pages
