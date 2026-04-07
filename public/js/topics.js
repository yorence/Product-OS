// LLM-powered topic/theme extraction — Map-Reduce Architecture
// ═══════════════════════════════════════════════════════════════
//
//  MAP:     Many micro-calls (2-3 meetings each), all parallel
//           → extracts theme names + search phrases per group
//  REDUCE:  Client-side Jaccard merge (instant, no LLM)
//           → deduplicates into unique themes
//  ENRICH:  One small LLM call with just theme names
//           → generates polished descriptions
//  ASSIGN:  Client-side phrase matching
//           → maps themes to transcript segments
//
// ═══════════════════════════════════════════════════════════════

// ── Transcript chunking (for segment assignment) ──────────────

function chunkTranscript(transcript, meeting) {
  const chunks = [];
  const CHUNK_SIZE = 5;
  for (let i = 0; i < transcript.length; i += CHUNK_SIZE) {
    const slice = transcript.slice(i, i + CHUNK_SIZE);
    chunks.push({
      meetingId: meeting.recording_id,
      meetingTitle: meeting.title || meeting.meeting_title || 'Untitled',
      meetingUrl: meeting.share_url || meeting.url || '',
      meetingDate: meeting.recording_start_time || meeting.created_at,
      startTime: slice[0]?.timestamp || '00:00:00',
      endTime: slice[slice.length-1]?.timestamp || '00:00:00',
      text: slice.map(l => l.text).join(' '),
      speakers: [...new Set(slice.map(l => l.speaker?.display_name).filter(Boolean))],
      lines: slice
    });
  }
  return chunks;
}

// ── Meeting summary builder (compact) ─────────────────────────

function buildMeetingSummary(m) {
  const title = m.title || m.meeting_title || 'Untitled';
  const date = new Date(m.recording_start_time || m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const summary = m.default_summary?.markdown_formatted || '';
  const participants = (m.calendar_invitees || []).map(p => p.name || p.email).filter(Boolean).join(', ');
  let body = '';
  if (summary) {
    body = summary.substring(0, 600);
  } else if (m.transcript && m.transcript.length) {
    body = m.transcript.slice(0, 20).map(l => `${l.speaker?.display_name || ''}: ${l.text}`).join('\n');
  }
  return `"${title}" | ${date} | ID:${m.recording_id} | ${participants}\n${body}`;
}

// ── Smart batch builder — groups related meetings together ────

function buildMicroBatches(meetings) {
  const MAX_PER_BATCH = 12;

  // Step 1: Extract a "key" from each meeting title by stripping common prefixes,
  // dates, numbers, and normalizing. Meetings with the same key go in the same batch.
  function titleKey(m) {
    return (m.title || m.meeting_title || '')
      .toLowerCase()
      .replace(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g, '') // strip dates
      .replace(/\b(meeting|call|sync|standup|check-in|weekly|daily|bi-weekly|monthly)\b/gi, '')
      .replace(/\b(kr|kaufman|rossin)\b/gi, '')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ').slice(0, 3).join(' '); // first 3 significant words
  }

  // Group meetings by title key
  const groups = {};
  meetings.forEach(m => {
    const key = titleKey(m) || '_misc';
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });

  // Build batches: keep related meetings together, split if over max
  const batches = [];
  Object.values(groups).forEach(group => {
    for (let i = 0; i < group.length; i += MAX_PER_BATCH) {
      batches.push(group.slice(i, i + MAX_PER_BATCH));
    }
  });

  // Merge tiny batches (< 3 meetings) into neighbors to avoid wasting API calls
  const merged = [];
  let accumulator = [];
  batches.forEach(batch => {
    if (batch.length < 3 && accumulator.length + batch.length <= MAX_PER_BATCH) {
      accumulator = accumulator.concat(batch);
    } else {
      if (accumulator.length) merged.push(accumulator);
      accumulator = batch.length < 3 ? batch.slice() : [];
      if (batch.length >= 3) merged.push(batch);
    }
  });
  if (accumulator.length) merged.push(accumulator);

  return merged;
}

// ══════════════════════════════════════════════════════════════
//  RATE-LIMITED CONCURRENCY POOL
//  Runs async tasks with max concurrency + retry on 429
// ══════════════════════════════════════════════════════════════

async function runPool(tasks, concurrency, onTaskDone) {
  const results = new Array(tasks.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      try {
        results[idx] = await tasks[idx]();
      } catch (e) {
        results[idx] = e;
      }
      if (onTaskDone) onTaskDone(idx, results[idx]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

// Call Perplexity with retry on 429
async function perplexityCall(perplexityKey, prompt, maxTokens, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + perplexityKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.1
      })
    });

    if (res.status === 429 && attempt < retries) {
      // Exponential backoff: 2s, 4s, 8s
      const wait = Math.pow(2, attempt + 1) * 1000;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Perplexity ${res.status}: ${err.substring(0, 100)}`);
    }

    const data = await res.json();
    return (data.choices?.[0]?.message?.content || '').replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
  }
}

// ══════════════════════════════════════════════════════════════
//  PHASE 1 — MAP: Extract raw themes from micro-batches
// ══════════════════════════════════════════════════════════════

const MAP_PROMPT = `Extract the major INITIATIVES or PROJECTS from these meetings. Be broad — group related discussions into single themes. For example, all discussions about the same tool (PandaDoc, Salesforce, STAR) or process (client onboarding, conflict checks) should be ONE theme, not multiple.

Aim for 3-6 themes max. For each: a broad name and 3-8 searchable phrases from the text. JSON only, no fences:
[{"name":"...","search_phrases":["..."],"meeting_ids":[123]}]

`;

async function mapBatch(perplexityKey, meetings, label) {
  const context = meetings.map(m => buildMeetingSummary(m)).join('\n---\n');
  const raw = await perplexityCall(perplexityKey, MAP_PROMPT + context, 1500);
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

// ══════════════════════════════════════════════════════════════
//  PHASE 2 — REDUCE: Client-side fuzzy merge (Jaccard + union-find)
// ══════════════════════════════════════════════════════════════

function tokenize(str) {
  return new Set((str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) { if (b.has(w)) inter++; }
  return inter / (a.size + b.size - inter);
}

function mergeThemesLocally(rawThemes) {
  if (rawThemes.length <= 1) return rawThemes;

  const tokenSets = rawThemes.map(t =>
    tokenize([t.name, ...(t.search_phrases || [])].join(' '))
  );

  // Normalized names for substring matching
  const normNames = rawThemes.map(t =>
    (t.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  );

  // Union-find
  const par = rawThemes.map((_, i) => i);
  const find = i => par[i] === i ? i : (par[i] = find(par[i]));
  const union = (a, b) => { par[find(a)] = find(b); };

  for (let i = 0; i < rawThemes.length; i++) {
    for (let j = i + 1; j < rawThemes.length; j++) {
      if (find(i) === find(j)) continue;

      // Name substring: if one name contains the other (e.g., "PandaDoc" in "PandaDoc Integration")
      if (normNames[i].length > 3 && normNames[j].length > 3) {
        if (normNames[i].includes(normNames[j]) || normNames[j].includes(normNames[i])) {
          union(i, j); continue;
        }
      }

      // Name token similarity (lowered threshold)
      const nameSim = jaccard(tokenize(rawThemes[i].name), tokenize(rawThemes[j].name));
      if (nameSim >= 0.35) { union(i, j); continue; }

      // Full token set similarity (lowered threshold)
      if (jaccard(tokenSets[i], tokenSets[j]) >= 0.18) union(i, j);
    }
  }

  const groups = {};
  rawThemes.forEach((t, i) => {
    const r = find(i);
    if (!groups[r]) groups[r] = [];
    groups[r].push(t);
  });

  return Object.values(groups).map(sources => {
    // Pick longest-named source as primary
    sources.sort((a, b) => (b.name || '').length - (a.name || '').length);
    const primary = sources[0];
    const meetingIds = new Set();
    const meetings = [];
    sources.forEach(s => {
      (s.meeting_ids || s.meetings || []).forEach(id => {
        const mid = typeof id === 'object' ? id.id : id;
        if (!meetingIds.has(mid)) { meetingIds.add(mid); meetings.push(mid); }
      });
    });
    return {
      name: primary.name,
      search_phrases: [...new Set(sources.flatMap(s => s.search_phrases || []))],
      meeting_ids: meetings
    };
  });
}

// ══════════════════════════════════════════════════════════════
//  PHASE 3 — ENRICH: One LLM call to add descriptions + cross-refs
// ══════════════════════════════════════════════════════════════

async function enrichThemes(perplexityKey, mergedThemes) {
  const themeList = mergedThemes.map((t, i) =>
    `${i + 1}. "${t.name}" (${t.meeting_ids.length} meetings, phrases: ${(t.search_phrases || []).slice(0, 5).join(', ')})`
  ).join('\n');

  const prompt = `These are work-stream themes extracted from meetings at Kaufman Rossin (professional services firm). Write a 2-3 sentence description for each. Which meetings discuss it (use the IDs)? Add a brief relevance note per meeting.

Themes:
${themeList}

Meeting titles for context:
${STATE.meetings.map(m => `ID:${m.recording_id} "${m.title || m.meeting_title || 'Untitled'}"`).join('\n')}

JSON only, no fences:
[{"name":"...","description":"...","search_phrases":["..."],"meetings":[{"id":123,"relevance":"..."}]}]`;

  const raw = await perplexityCall(perplexityKey, prompt, 3000);
  const enriched = JSON.parse(raw);
  if (!Array.isArray(enriched)) throw new Error('Enrich response not an array');

  // Merge enriched data back onto merged themes (fallback to original if enrich drops any)
  return mergedThemes.map((orig, i) => {
    const e = enriched[i] || enriched.find(x => x.name === orig.name) || {};
    return {
      name: e.name || orig.name,
      description: e.description || '',
      search_phrases: [...new Set([...(orig.search_phrases || []), ...(e.search_phrases || [])])],
      meetings: e.meetings || orig.meeting_ids.map(id => ({ id, relevance: '' }))
    };
  });
}

// ══════════════════════════════════════════════════════════════
//  PHASE 4 — CONSOLIDATE: LLM groups semantically related themes
//  Catches stragglers that Jaccard missed (e.g., "CRM Migration"
//  and "Salesforce Data Cleanup" are the same initiative)
// ══════════════════════════════════════════════════════════════

// Single consolidation pass — returns merged theme array
async function consolidatePass(perplexityKey, themes) {
  const themeList = themes.map((t, i) =>
    `${i}. "${t.name}" — ${(t.description || '').substring(0, 60)} (${(t.meetings || []).length} mtgs)`
  ).join('\n');

  const prompt = `You are a PM at Kaufman Rossin ruthlessly organizing ${themes.length} themes. MERGE AGGRESSIVELY.

RULES — when in doubt, MERGE:
- Same tool/system = ONE theme (all PandaDoc items = one, all Salesforce items = one, all STAR items = one)
- Same business process = ONE theme (client onboarding, new client acceptance, conflict checks = one)
- Sub-task or different angle of the same initiative = MERGE into parent
- Overlapping participants + overlapping systems = probably the same thing
- "Integration" between two systems = merge into whichever system is the bigger initiative
- ONLY keep separate if a PM would assign them to DIFFERENT teams with DIFFERENT goals

TARGET: ${Math.max(5, Math.ceil(themes.length / 6))}-${Math.max(8, Math.ceil(themes.length / 3))} final themes. If you produce more than ${Math.ceil(themes.length / 2)}, you are not merging enough.

CATEGORIZE each into: "Data & Integration", "Security & Compliance", "Client Experience", "AI & Automation", "Operations & Process", or another fitting category.

THEMES:
${themeList}

JSON only, no fences:
[{"name":"Merged Theme","category":"Category","merge_indices":[0,3,7],"description":"1-2 sentences"}]

EVERY index (0-${themes.length - 1}) must appear in exactly ONE group.`;

  const raw = await perplexityCall(perplexityKey, prompt, 2500);
  const groups = JSON.parse(raw);
  if (!Array.isArray(groups)) throw new Error('Consolidate response not an array');

  return groups.map(group => {
    const indices = group.merge_indices || [];
    const sources = indices.map(i => themes[i]).filter(Boolean);
    if (!sources.length) return null;

    const seenIds = new Set();
    const allMeetings = [];
    sources.forEach(s => {
      (s.meetings || []).forEach(m => {
        const mid = typeof m === 'object' ? m.id : m;
        if (!seenIds.has(mid)) {
          seenIds.add(mid);
          allMeetings.push(typeof m === 'object' ? m : { id: m, relevance: '' });
        }
      });
    });

    const allPhrases = [...new Set(sources.flatMap(s => s.search_phrases || []))];

    let desc = group.description || '';
    if (!desc) {
      sources.sort((a, b) => (b.description || '').length - (a.description || '').length);
      desc = sources[0]?.description || '';
    }
    if (desc.length > 400) desc = desc.substring(0, 397) + '...';

    return {
      name: group.name || sources[0]?.name || 'Unnamed',
      category: group.category || 'General',
      description: desc,
      search_phrases: allPhrases,
      meetings: allMeetings
    };
  }).filter(Boolean);
}

// Iterative consolidation — keeps running until theme count stabilizes
async function consolidateThemes(perplexityKey, enrichedThemes, statusFn) {
  if (enrichedThemes.length <= 1) return enrichedThemes;

  let current = enrichedThemes;
  const MAX_PASSES = 3;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const beforeCount = current.length;
    if (statusFn) statusFn(`Consolidation pass ${pass}: ${beforeCount} themes...`);

    try {
      current = await consolidatePass(perplexityKey, current);
    } catch (e) {
      console.warn(`Consolidation pass ${pass} failed:`, e.message);
      break;
    }

    const afterCount = current.length;
    console.log(`Consolidation pass ${pass}: ${beforeCount} → ${afterCount} themes`);

    // Stop if we've converged (less than 20% reduction) or hit target range
    if (afterCount >= beforeCount * 0.8 || afterCount <= 12) break;
  }

  return current;
}

// ══════════════════════════════════════════════════════════════
//  ORCHESTRATOR — Map → Reduce → Enrich → Consolidate
// ══════════════════════════════════════════════════════════════

async function synthesizeTopicsWithLLM(perplexityKey, statusFn) {
  // Only include meetings that have actual content (summary or transcript)
  const analyzable = STATE.meetings.filter(m => {
    const hasSummary = m.default_summary?.markdown_formatted?.length > 0;
    const hasTranscript = m.transcript?.length > 0;
    return hasSummary || hasTranscript;
  });
  const skipped = STATE.meetings.length - analyzable.length;
  if (skipped > 0) {
    console.warn(`Skipping ${skipped} meetings with no summary or transcript`);
  }

  if (!analyzable.length) {
    throw new Error(`None of the ${STATE.meetings.length} meetings have transcripts or summaries loaded. Try refreshing.`);
  }

  const microBatches = buildMicroBatches(analyzable);
  const total = microBatches.length;
  const MAX_CONCURRENT = 3;

  // ── MAP (throttled parallel) ──
  if (statusFn) statusFn(`Extracting themes: 0/${total} batches (${analyzable.length} of ${STATE.meetings.length} meetings${skipped ? `, ${skipped} skipped — no transcript` : ''})...`);

  let done = 0;
  const tasks = microBatches.map((batch, i) => () =>
    mapBatch(perplexityKey, batch, `${i + 1}/${total}`)
      .catch(err => { console.warn(`Batch ${i + 1} failed:`, err.message); return []; })
  );

  const mapResults = await runPool(tasks, MAX_CONCURRENT, () => {
    done++;
    if (statusFn) statusFn(`Extracting themes: ${done}/${total} batches complete...`);
  });

  // ── REDUCE (client-side, instant) ──
  if (statusFn) statusFn(`Merging ${mapResults.flat().length} raw themes...`);
  const merged = mergeThemesLocally(mapResults.flat());
  if (statusFn) statusFn(`${merged.length} unique themes. Enriching...`);

  // ── ENRICH (one small call) ──
  let enriched;
  try {
    enriched = await enrichThemes(perplexityKey, merged);
  } catch (e) {
    console.warn('Enrich failed, using raw themes:', e.message);
    enriched = merged.map(t => ({
      name: t.name,
      description: '',
      search_phrases: t.search_phrases || [],
      meetings: (t.meeting_ids || []).map(id => ({ id, relevance: '' }))
    }));
  }

  // ── CONSOLIDATE (iterative — keeps merging until stable) ──
  if (enriched.length > 1) {
    if (statusFn) statusFn(`Consolidating ${enriched.length} themes into coherent initiatives...`);
    try {
      const consolidated = await consolidateThemes(perplexityKey, enriched, statusFn);
      if (statusFn) statusFn(`${consolidated.length} final themes.`);
      return consolidated;
    } catch (e) {
      console.warn('Consolidation failed, using enriched themes:', e.message);
    }
  }

  return enriched;
}

// ══════════════════════════════════════════════════════════════
//  TRANSCRIPT SEGMENT SCORING & ASSIGNMENT
// ══════════════════════════════════════════════════════════════

function scoreChunkRelevance(chunkText, searchPhrases, topicName, topicDesc) {
  const text = chunkText.toLowerCase();
  let score = 0;

  (searchPhrases || []).forEach(phrase => {
    const p = phrase.toLowerCase();
    let idx = 0;
    while ((idx = text.indexOf(p, idx)) !== -1) {
      score += 10;
      idx += p.length;
    }
  });

  const topicWords = (topicName + ' ' + topicDesc).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  [...new Set(topicWords)].forEach(w => { if (text.includes(w)) score += 1; });

  return score;
}

function mapLLMTopicsToSegments(llmTopics) {
  const allChunks = {};
  STATE.meetings.forEach(m => {
    if (m.transcript && m.transcript.length) {
      allChunks[m.recording_id] = chunkTranscript(m.transcript, m);
    }
  });

  return llmTopics.map((lt, idx) => {
    const segments = [];
    const videoIds = [];
    const searchPhrases = lt.search_phrases || [];

    (lt.meetings || []).forEach(ref => {
      const mid = ref.id;
      const chunks = allChunks[mid];
      if (!chunks || !chunks.length) return;
      videoIds.push(mid);

      const scored = chunks.map((c, i) => ({
        chunk: c, index: i,
        score: scoreChunkRelevance(c.text, searchPhrases, lt.name || '', lt.description || '')
      }));

      scored.sort((a, b) => b.score - a.score);
      const relevant = scored.filter(s => s.score > 0).slice(0, 5);

      if (relevant.length === 0) {
        const mid3 = Math.floor(chunks.length / 3);
        relevant.push({ chunk: chunks[mid3], score: 0 });
      }

      relevant.sort((a, b) => a.index - b.index);
      relevant.forEach(s => {
        segments.push({ ...s.chunk, relevance: ref.relevance || '', relevanceScore: s.score });
      });
    });

    return {
      id: idx,
      name: lt.name || 'Unnamed Topic',
      description: lt.description || '',
      category: lt.category || 'General',
      keyTerms: searchPhrases,
      segments,
      videoCount: [...new Set(videoIds)].length,
      videoIds: [...new Set(videoIds)],
      color: TOPIC_COLORS[idx % TOPIC_COLORS.length],
      _raw: lt
    };
  }).filter(t => t.segments.length > 0);
}

// ══════════════════════════════════════════════════════════════
//  ENTRY POINT
// ══════════════════════════════════════════════════════════════

// Pipeline stage definitions for UI
const SYNTH_STAGES = [
  { key: 'map', label: 'Extracting themes from meetings' },
  { key: 'reduce', label: 'Merging duplicate themes' },
  { key: 'enrich', label: 'Adding descriptions & context' },
  { key: 'consolidate', label: 'Grouping related initiatives' },
  { key: 'assign', label: 'Mapping transcript segments' }
];

function renderSynthProgress(activeStage, detail) {
  const container = document.getElementById('topicsContainer');
  if (!container) return;

  const stagesHtml = SYNTH_STAGES.map((s, i) => {
    const activeIdx = SYNTH_STAGES.findIndex(x => x.key === activeStage);
    const isDone = i < activeIdx;
    const isActive = i === activeIdx;
    const color = isDone ? 'var(--green-text)' : isActive ? 'var(--blue)' : 'var(--text-muted)';
    const icon = isDone ? '&#10003;' : isActive ? '<span class="pulse-dot" style="width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 1s infinite;display:inline-block"></span>' : '<span style="width:8px;height:8px;border:2px solid var(--gray-40);display:inline-block"></span>';
    const weight = isActive ? '700' : '600';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;${i < SYNTH_STAGES.length - 1 ? 'border-bottom:1px solid var(--gray-10);' : ''}">
      <div style="width:24px;text-align:center;font-size:13px;color:${isDone ? 'var(--green-text)' : 'var(--text-muted)'}">${icon}</div>
      <div style="font-family:var(--fd);font-size:12px;font-weight:${weight};letter-spacing:.08em;text-transform:uppercase;color:${color}">${s.label}</div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div style="max-width:420px;margin:2rem auto;padding:2rem">
      <div style="text-align:center;margin-bottom:1.5rem">
        <div class="loading-inline"></div>
        <div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);margin-top:1rem">Synthesizing Themes</div>
        <div id="topicSynthStatus" style="font-size:14px;color:var(--text-light);margin-top:.5rem">${detail || 'Starting...'}</div>
      </div>
      <div style="background:white;border:1px solid var(--border);padding:16px 20px;box-shadow:var(--sh-sm)">
        ${stagesHtml}
      </div>
      <div style="text-align:center;margin-top:1rem;font-size:13px;color:var(--text-muted)">Do not navigate away — synthesis is in progress</div>
    </div>`;
}

async function unlockTopics() {
  const keyInput = document.getElementById('perplexityKeyInput');
  const key = keyInput ? keyInput.value.trim() : '';
  if (!key) { alert('Please enter your Perplexity API key.'); return; }

  STATE.perplexityKey = key;
  STATE.isSynthesizing = true;
  const stats = document.getElementById('topicStats');
  stats.innerHTML = '';

  // Show initial pipeline UI
  renderSynthProgress('map', 'Preparing pipeline...');

  // Status callback updates both the detail text and the active stage
  const statusFn = (msg) => {
    const el = document.getElementById('topicSynthStatus');
    if (el) el.textContent = msg;

    // Detect stage transitions from message content
    if (msg.includes('Extracting') || msg.includes('batches')) renderSynthProgress('map', msg);
    else if (msg.includes('Merging') || msg.includes('raw themes')) renderSynthProgress('reduce', msg);
    else if (msg.includes('Enriching') || msg.includes('unique themes')) renderSynthProgress('enrich', msg);
    else if (msg.includes('Consolidat')) renderSynthProgress('consolidate', msg);
    else if (msg.includes('final')) renderSynthProgress('assign', msg);
  };

  try {
    const t0 = performance.now();
    const llmTopics = await synthesizeTopicsWithLLM(key, statusFn);

    renderSynthProgress('assign', 'Mapping transcript segments...');
    STATE.topics = mapLLMTopicsToSegments(llmTopics);

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

    STATE.topicsUnlocked = true;
    STATE.isSynthesizing = false;
    STATE.projectDocs = {};
    document.getElementById('topicCount').textContent = STATE.topics.length;
    try { sessionStorage.setItem('llm_topics', JSON.stringify(STATE.topics)); } catch(e) {}
    populateProjectsSidebar();
    renderTopicsGrid();
  } catch (e) {
    STATE.isSynthesizing = false;
    const container = document.getElementById('topicsContainer');
    container.innerHTML = `<div class="callout danger" style="margin:2rem 0"><strong>Theme synthesis failed:</strong> ${esc(e.message)}<br><br>Check your Perplexity API key and try again.</div>`;
  }
}
