// Project Creation Wizard
// ═══════════════════════════════════════════════════════════

// ── Wizard State ────────────────────────────────────────────

let _wizardState = {
  step: 0,           // 0=closed, 1=name, 2=scoring, 3=review
  name: '',
  phrases: [],
  scoredMeetings: [], // { meeting, score, checked }
};

// ── Open / Close ────────────────────────────────────────────

function openCreateProjectWizard() {
  if (!STATE.perplexityKey) {
    alert('Enter your Perplexity API key on the Themes Index page first.');
    return;
  }
  _wizardState = { step: 1, name: '', phrases: [], scoredMeetings: [] };
  renderWizard();
}

function closeWizard() {
  _wizardState.step = 0;
  const overlay = document.getElementById('wizard-overlay');
  if (overlay) overlay.remove();
}

// ── Render ──────────────────────────────────────────────────

function renderWizard() {
  let overlay = document.getElementById('wizard-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wizard-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(29,76,126,.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:2rem';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeWizard(); });
    document.body.appendChild(overlay);
  }

  const step = _wizardState.step;

  if (step === 1) {
    overlay.innerHTML = `<div style="background:white;width:100%;max-width:520px;box-shadow:var(--sh-lg);overflow:hidden">
      <div style="background:var(--blue);padding:16px 24px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:white">Create Project</span>
        <span style="color:rgba(255,255,255,.5);cursor:pointer;font-size:18px" onclick="closeWizard()">&times;</span>
      </div>
      <div style="padding:24px">
        <div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--blue);margin-bottom:4px">Step 1 of 3</div>
        <h3 style="font-family:var(--fd);font-weight:800;font-size:18px;color:var(--blue);margin-bottom:12px">Name your project</h3>
        <p style="font-size:15px;color:var(--text-light);line-height:1.55;margin-bottom:16px">Enter a project or initiative name. The system will find all meetings and discussions related to it.</p>
        <input type="text" id="wizard-name-input" placeholder="e.g., PandaDoc Integration" style="width:100%;padding:12px 14px;border:2px solid var(--gray-20);font-family:var(--fb);font-size:16px;color:var(--text);margin-bottom:16px" onkeydown="if(event.key==='Enter')wizardInferPhrases()" autofocus>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary btn-sm" onclick="closeWizard()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="wizardInferPhrases()">Find Meetings</button>
        </div>
      </div>
    </div>`;
    setTimeout(() => { const inp = document.getElementById('wizard-name-input'); if (inp) inp.focus(); }, 50);
  }

  if (step === 2) {
    overlay.innerHTML = `<div style="background:white;width:100%;max-width:520px;box-shadow:var(--sh-lg);overflow:hidden">
      <div style="background:var(--blue);padding:16px 24px">
        <span style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:white">Create Project</span>
      </div>
      <div style="padding:24px;text-align:center">
        <div class="loading-inline"></div>
        <div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);margin-top:12px">Analyzing "${esc(_wizardState.name)}"</div>
        <div id="wizard-score-status" style="font-size:14px;color:var(--text-light);margin-top:6px">Inferring search phrases...</div>
      </div>
    </div>`;
  }

  if (step === 3) {
    const scored = _wizardState.scoredMeetings;
    const checked = scored.filter(s => s.checked).length;

    let listHtml = scored.map((s, i) => {
      const m = s.meeting;
      const title = m.title || m.meeting_title || 'Untitled';
      const date = new Date(m.recording_start_time || m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const pct = s.score > 0 ? Math.min(Math.round((s.score / (scored[0]?.score || 1)) * 100), 100) : 0;
      return `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-10);cursor:pointer${!s.checked ? ';opacity:.5' : ''}">
        <input type="checkbox" ${s.checked ? 'checked' : ''} onchange="wizardToggleMeeting(${i},this.checked)" style="width:16px;height:16px;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--fd);font-size:13px;font-weight:700;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}</div>
          <div style="font-size:12px;color:var(--text-light)">${date}</div>
        </div>
        <div style="width:80px;flex-shrink:0">
          <div style="height:4px;background:var(--gray-10)"><div style="height:100%;width:${pct}%;background:${pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--green-60)' : 'var(--gray-40)'}"></div></div>
          <div style="font-family:var(--fd);font-size:10px;font-weight:700;color:var(--text-muted);text-align:right;margin-top:2px">${s.score > 0 ? pct + '%' : 'low'}</div>
        </div>
      </label>`;
    }).join('');

    overlay.innerHTML = `<div style="background:white;width:100%;max-width:580px;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--sh-lg);overflow:hidden">
      <div style="background:var(--blue);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <span style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:white">Create Project</span>
        <span style="color:rgba(255,255,255,.5);cursor:pointer;font-size:18px" onclick="closeWizard()">&times;</span>
      </div>
      <div style="padding:20px 24px;flex-shrink:0">
        <div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--blue);margin-bottom:4px">Step 3 of 3</div>
        <h3 style="font-family:var(--fd);font-weight:800;font-size:18px;color:var(--blue);margin-bottom:4px">${esc(_wizardState.name)}</h3>
        <p style="font-size:14px;color:var(--text-light);margin-bottom:8px">Select which meetings to include. ${checked} of ${scored.length} selected.</p>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:3px 8px" onclick="wizardSelectAll(true)">Select All</button>
          <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:3px 8px" onclick="wizardSelectAll(false)">Deselect All</button>
          <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:3px 8px" onclick="wizardSelectRelevant()">Select Relevant Only</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:0 24px">${listHtml}</div>
      <div style="padding:16px 24px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">
        <button class="btn btn-secondary btn-sm" onclick="closeWizard()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="wizardCreateProject()" ${checked === 0 ? 'disabled style="opacity:.4;pointer-events:none"' : ''}>Create Project (${checked} meetings)</button>
      </div>
    </div>`;
  }
}

// ── Step 2: Infer phrases + score meetings ──────────────────

async function wizardInferPhrases() {
  const input = document.getElementById('wizard-name-input');
  const name = input ? input.value.trim() : '';
  if (!name) return;

  _wizardState.name = name;
  _wizardState.step = 2;
  renderWizard();

  // Ask LLM for search phrases based on the project name
  try {
    const statusEl = document.getElementById('wizard-score-status');

    const prompt = `Given a project/initiative called "${name}" at a professional services firm (Kaufman Rossin), generate 8-15 specific search phrases that people would say when discussing this topic in meetings. Include the name itself, abbreviations, related tools, processes, and jargon.

JSON only, no fences:
{"phrases":["phrase1","phrase2",...]}`;

    const raw = await perplexityCall(STATE.perplexityKey, prompt, 500);
    const parsed = JSON.parse(raw);
    _wizardState.phrases = parsed.phrases || [name.toLowerCase()];

    // Always include the name itself and its words
    const nameWords = name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    _wizardState.phrases = [...new Set([name.toLowerCase(), ...nameWords, ..._wizardState.phrases])];

    if (statusEl) statusEl.textContent = `Found ${_wizardState.phrases.length} search phrases. Scoring meetings...`;

    // Score all meetings with content
    const analyzable = STATE.meetings.filter(m =>
      (m.default_summary?.markdown_formatted?.length > 0) || (m.transcript?.length > 0)
    );

    const scored = analyzable.map(m => {
      // Score against summary
      const summaryText = m.default_summary?.markdown_formatted || '';
      const titleText = m.title || m.meeting_title || '';
      const transcriptSample = (m.transcript || []).slice(0, 50).map(l => l.text).join(' ');
      const fullText = titleText + ' ' + summaryText + ' ' + transcriptSample;

      const score = scoreChunkRelevance(fullText, _wizardState.phrases, name, '');
      return { meeting: m, score, checked: score > 0 };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    _wizardState.scoredMeetings = scored;
    _wizardState.step = 3;
    renderWizard();

  } catch (e) {
    // Fallback: use name as sole phrase, score without LLM
    console.warn('Phrase inference failed:', e.message);
    _wizardState.phrases = [name.toLowerCase()];

    const analyzable = STATE.meetings.filter(m =>
      (m.default_summary?.markdown_formatted?.length > 0) || (m.transcript?.length > 0)
    );

    const scored = analyzable.map(m => {
      const fullText = (m.title || '') + ' ' + (m.default_summary?.markdown_formatted || '');
      const score = scoreChunkRelevance(fullText, _wizardState.phrases, name, '');
      return { meeting: m, score, checked: score > 0 };
    });

    scored.sort((a, b) => b.score - a.score);
    _wizardState.scoredMeetings = scored;
    _wizardState.step = 3;
    renderWizard();
  }
}

// ── Step 3: Meeting selection helpers ───────────────────────

function wizardToggleMeeting(idx, checked) {
  _wizardState.scoredMeetings[idx].checked = checked;
  renderWizard();
}

function wizardSelectAll(val) {
  _wizardState.scoredMeetings.forEach(s => s.checked = val);
  renderWizard();
}

function wizardSelectRelevant() {
  _wizardState.scoredMeetings.forEach(s => s.checked = s.score > 0);
  renderWizard();
}

// ── Create the project ──────────────────────────────────────

function wizardCreateProject() {
  const name = _wizardState.name;
  const phrases = _wizardState.phrases;
  const selectedMeetings = _wizardState.scoredMeetings.filter(s => s.checked).map(s => s.meeting);

  if (!name || !selectedMeetings.length) return;

  closeWizard();

  // Build a topic object matching the same shape as LLM-synthesized topics
  // Use the existing segment scoring pipeline
  const allChunks = {};
  selectedMeetings.forEach(m => {
    if (m.transcript && m.transcript.length) {
      allChunks[m.recording_id] = chunkTranscript(m.transcript, m);
    }
  });

  const segments = [];
  const videoIds = [];

  selectedMeetings.forEach(m => {
    const chunks = allChunks[m.recording_id];
    if (!chunks || !chunks.length) {
      videoIds.push(m.recording_id);
      return;
    }
    videoIds.push(m.recording_id);

    // Score and pick top segments
    const scored = chunks.map((c, i) => ({
      chunk: c, index: i,
      score: scoreChunkRelevance(c.text, phrases, name, '')
    }));

    scored.sort((a, b) => b.score - a.score);
    const relevant = scored.filter(s => s.score > 0).slice(0, 5);

    if (relevant.length === 0) {
      const mid = Math.floor(chunks.length / 3);
      relevant.push({ chunk: chunks[mid], score: 0 });
    }

    relevant.sort((a, b) => a.index - b.index);
    relevant.forEach(s => {
      segments.push({ ...s.chunk, relevance: '', relevanceScore: s.score });
    });
  });

  // Assign an ID that doesn't collide with AI topics
  const maxId = STATE.topics.reduce((max, t) => Math.max(max, t.id), -1);
  const newId = maxId + 1;

  const topic = {
    id: newId,
    name: name,
    description: '',
    category: 'Manual',
    keyTerms: phrases,
    segments: segments,
    videoCount: [...new Set(videoIds)].length,
    videoIds: [...new Set(videoIds)],
    color: TOPIC_COLORS[newId % TOPIC_COLORS.length],
    _raw: { name, search_phrases: phrases, meetings: videoIds.map(id => ({ id, relevance: '' })) },
    _manual: true // flag to distinguish from AI-generated
  };

  STATE.topics.push(topic);
  STATE.topicsUnlocked = true;
  document.getElementById('topicCount').textContent = STATE.topics.length;

  // Cache
  try { sessionStorage.setItem('llm_topics', JSON.stringify(STATE.topics)); } catch(e) {}

  populateProjectsSidebar();

  // Navigate to the new project
  showView('project-' + newId);
}
