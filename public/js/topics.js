// LLM-powered topic/theme extraction
// ═══════ TOPIC EXTRACTION (LLM-POWERED) ═══════

// Chunk transcript into time-windowed segments
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

// Build meeting summaries for the LLM prompt
function buildMeetingSummariesForPrompt() {
  return STATE.meetings.map(m => {
    const title = m.title || m.meeting_title || 'Untitled';
    const date = new Date(m.recording_start_time || m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const summary = m.default_summary?.markdown_formatted || '';
    const participants = (m.calendar_invitees || []).map(p => p.name || p.email).filter(Boolean).join(', ');
    // Include first ~40 transcript lines as context if no summary
    let transcriptExcerpt = '';
    if (!summary && m.transcript && m.transcript.length) {
      transcriptExcerpt = m.transcript.slice(0, 40).map(l => `${l.speaker?.display_name || ''}: ${l.text}`).join('\n');
    }
    return `MEETING: "${title}" | Date: ${date} | ID: ${m.recording_id} | Participants: ${participants}\n${summary ? 'SUMMARY:\n' + summary : 'TRANSCRIPT EXCERPT:\n' + transcriptExcerpt}`;
  }).join('\n\n---\n\n');
}

// Call Perplexity API to synthesize topics
async function synthesizeTopicsWithLLM(perplexityKey) {
  const meetingContext = buildMeetingSummariesForPrompt();

  const prompt = `You are analyzing meeting recordings from a professional services firm (Kaufman Rossin). Below are summaries or transcript excerpts from their meetings.

Your task: Identify the distinct INITIATIVES, PROJECTS, and RECURRING THEMES discussed across these meetings. Do NOT just list keywords — synthesize actual topics that represent real work streams or decisions being made.

For each topic:
1. Give it a clear, descriptive name (e.g., "New Client Acceptance Automation", not "Salesforce Data")
2. Write a 2-3 sentence description of what this initiative/theme is about
3. List 5-10 specific searchable phrases that participants actually said when discussing this topic (exact quotes or near-exact phrases from the transcripts, not generic keywords)
4. List which meeting IDs discuss this topic
5. For each meeting, describe briefly what was said about this topic in that meeting

Respond ONLY with valid JSON in this exact format (no markdown, no code fences):
[
  {
    "name": "Topic Name",
    "description": "2-3 sentence description of the initiative/theme",
    "search_phrases": ["conflict check", "new client acceptance", "matter parties", "approval process", "closed won"],
    "meetings": [
      { "id": 12345, "relevance": "Brief description of what was discussed about this topic in this meeting" }
    ]
  }
]

Here are the meetings:

${meetingContext}`;

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + perplexityKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.1
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Perplexity API ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON from response (handle potential markdown wrapping)
  let parsed;
  try {
    const jsonStr = content.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Failed to parse LLM response as JSON. Raw: ' + content.substring(0, 300));
  }

  if (!Array.isArray(parsed)) throw new Error('LLM response is not an array');
  return parsed;
}

// Score how relevant a transcript chunk is to a topic
function scoreChunkRelevance(chunkText, searchPhrases, topicName, topicDesc) {
  const text = chunkText.toLowerCase();
  let score = 0;

  // Score exact phrase matches (highest weight)
  (searchPhrases || []).forEach(phrase => {
    const p = phrase.toLowerCase();
    // Count occurrences of each phrase
    let idx = 0;
    while ((idx = text.indexOf(p, idx)) !== -1) {
      score += 10;
      idx += p.length;
    }
  });

  // Score individual words from topic name and description (lower weight)
  const topicWords = (topicName + ' ' + topicDesc).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 3);
  const uniqueWords = [...new Set(topicWords)];
  uniqueWords.forEach(w => {
    if (text.includes(w)) score += 1;
  });

  return score;
}

// Convert LLM topics into the app's topic format with relevant transcript segments
function mapLLMTopicsToSegments(llmTopics) {
  // Pre-chunk all transcripts
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

      // Score every chunk in this meeting by relevance to this topic
      const scored = chunks.map((c, i) => ({
        chunk: c,
        index: i,
        score: scoreChunkRelevance(c.text, searchPhrases, lt.name || '', lt.description || '')
      }));

      // Sort by score descending, take top chunks that actually matched
      scored.sort((a, b) => b.score - a.score);
      const relevant = scored.filter(s => s.score > 0).slice(0, 5);

      // If no chunks scored, fall back to the middle of the meeting (skip intro/outro)
      if (relevant.length === 0) {
        const mid3 = Math.floor(chunks.length / 3);
        relevant.push({ chunk: chunks[mid3], score: 0 });
      }

      // Sort selected chunks by their original order (timeline)
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
      segments: segments,
      videoCount: [...new Set(videoIds)].length,
      videoIds: [...new Set(videoIds)],
      color: TOPIC_COLORS[idx % TOPIC_COLORS.length],
      _raw: lt // keep raw LLM output for project generation later
    };
  }).filter(t => t.segments.length > 0);
}

// Main entry point: unlock topics with Perplexity key
async function unlockTopics() {
  const keyInput = document.getElementById('perplexityKeyInput');
  const key = keyInput ? keyInput.value.trim() : '';
  if (!key) { alert('Please enter your Perplexity API key.'); return; }

  STATE.perplexityKey = key;
  const container = document.getElementById('topicsContainer');
  const stats = document.getElementById('topicStats');
  stats.innerHTML = '';
  container.innerHTML = '<div style="text-align:center;padding:3rem"><div class="loading-inline"></div><div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);margin-top:1rem">Analyzing meetings with AI...</div><div style="font-size:14px;color:var(--text-light);margin-top:.5rem">Synthesizing themes from meeting summaries</div></div>';

  try {
    const llmTopics = await synthesizeTopicsWithLLM(key);
    STATE.topics = mapLLMTopicsToSegments(llmTopics);
    STATE.topicsUnlocked = true;
    STATE.projectDocs = {}; // keyed by topic id
    document.getElementById('topicCount').textContent = STATE.topics.length;
    // Cache results
    try { sessionStorage.setItem('llm_topics', JSON.stringify(STATE.topics)); } catch(e) {}
    populateProjectsSidebar();
    renderTopicsGrid();
  } catch (e) {
    container.innerHTML = `<div class="callout danger" style="margin:2rem 0"><strong>Theme synthesis failed:</strong> ${esc(e.message)}<br><br>Check your Perplexity API key and try again.</div>`;
  }
}
