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

// ── Micro-batch builder (2-3 meetings per batch) ──────────────

function buildMicroBatches(meetings) {
  const MEETINGS_PER_BATCH = 5; // 5 meetings per batch — balances speed vs rate limits
  const batches = [];
  for (let i = 0; i < meetings.length; i += MEETINGS_PER_BATCH) {
    batches.push(meetings.slice(i, i + MEETINGS_PER_BATCH));
  }
  return batches;
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

const MAP_PROMPT = `Extract the main work-stream THEMES from these meetings. For each theme give a short name and 3-8 exact searchable phrases from the text. JSON only, no fences:
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

  // Union-find
  const par = rawThemes.map((_, i) => i);
  const find = i => par[i] === i ? i : (par[i] = find(par[i]));
  const union = (a, b) => { par[find(a)] = find(b); };

  for (let i = 0; i < rawThemes.length; i++) {
    for (let j = i + 1; j < rawThemes.length; j++) {
      if (find(i) === find(j)) continue;
      const nameSim = jaccard(tokenize(rawThemes[i].name), tokenize(rawThemes[j].name));
      if (nameSim >= 0.5) { union(i, j); continue; }
      if (jaccard(tokenSets[i], tokenSets[j]) >= 0.25) union(i, j);
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
//  ORCHESTRATOR — Map → Reduce → Enrich (parallel pipeline)
// ══════════════════════════════════════════════════════════════

async function synthesizeTopicsWithLLM(perplexityKey, statusFn) {
  const microBatches = buildMicroBatches(STATE.meetings);
  const total = microBatches.length;
  const MAX_CONCURRENT = 3; // max parallel API calls to avoid 429s

  // ── MAP (throttled parallel) ──
  if (statusFn) statusFn(`Extracting themes: 0/${total} batches (${STATE.meetings.length} meetings)...`);

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
  if (statusFn) statusFn(`REDUCE: Merging ${mapResults.flat().length} raw themes...`);
  const merged = mergeThemesLocally(mapResults.flat());
  if (statusFn) statusFn(`REDUCE: ${merged.length} unique themes. Enriching...`);

  // ── ENRICH (one small call) ──
  try {
    const enriched = await enrichThemes(perplexityKey, merged);
    return enriched;
  } catch (e) {
    // If enrich fails, still return merged themes with empty descriptions
    console.warn('Enrich failed, using raw themes:', e.message);
    return merged.map(t => ({
      name: t.name,
      description: '',
      search_phrases: t.search_phrases || [],
      meetings: (t.meeting_ids || []).map(id => ({ id, relevance: '' }))
    }));
  }
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

async function unlockTopics() {
  const keyInput = document.getElementById('perplexityKeyInput');
  const key = keyInput ? keyInput.value.trim() : '';
  if (!key) { alert('Please enter your Perplexity API key.'); return; }

  STATE.perplexityKey = key;
  const container = document.getElementById('topicsContainer');
  const stats = document.getElementById('topicStats');
  stats.innerHTML = '';
  container.innerHTML = '<div style="text-align:center;padding:3rem"><div class="loading-inline"></div><div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);margin-top:1rem">Analyzing meetings with AI...</div><div id="topicSynthStatus" style="font-size:14px;color:var(--text-light);margin-top:.5rem">Preparing pipeline...</div></div>';

  const statusEl = document.getElementById('topicSynthStatus');
  const statusFn = (msg) => { if (statusEl) statusEl.textContent = msg; };

  try {
    const t0 = performance.now();
    const llmTopics = await synthesizeTopicsWithLLM(key, statusFn);
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    statusFn(`Done — ${llmTopics.length} themes in ${elapsed}s`);

    STATE.topics = mapLLMTopicsToSegments(llmTopics);
    STATE.topicsUnlocked = true;
    STATE.projectDocs = {};
    document.getElementById('topicCount').textContent = STATE.topics.length;
    try { sessionStorage.setItem('llm_topics', JSON.stringify(STATE.topics)); } catch(e) {}
    populateProjectsSidebar();
    renderTopicsGrid();
  } catch (e) {
    container.innerHTML = `<div class="callout danger" style="margin:2rem 0"><strong>Theme synthesis failed:</strong> ${esc(e.message)}<br><br>Check your Perplexity API key and try again.</div>`;
  }
}
