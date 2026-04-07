// Per-theme project pages and artifact generation
// ═══════ PROJECTS + TOPICS ═══════

function populateProjectsSidebar() {
  const container = document.getElementById('projectsNavItems');
  if (!STATE.topics.length) {
    container.innerHTML = `<button onclick="showView('topics')" style="color:var(--green);font-size:.65rem;letter-spacing:.08em">
      <span class="icon">&#9889;</span> Unlock with AI &rarr;
    </button>`;
    return;
  }

  container.innerHTML = STATE.topics.map(t =>
    `<button onclick="showView('project-${t.id}')" data-view="project-${t.id}">
      <span style="display:inline-block;width:8px;height:8px;background:${t.color};flex-shrink:0"></span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</span>
    </button>`
  ).join('');
}

function renderProjectPage(topicId) {
  const t = STATE.topics.find(x => x.id === topicId);
  if (!t) return;
  const panel = document.getElementById('view-project');
  const docs = STATE.projectDocs?.[topicId];
  const hasDocs = !!docs;

  // Build the overview tab (reuse topic detail logic)
  const overviewHtml = buildTopicOverviewHtml(t);

  // Build artifact tabs
  const artifactTabs = ['prep', 'value', 'brief', 'roadmap', 'security', 'pipeline', 'process'];
  const artifactLabels = { prep:'Meeting Prep', value:'Business Case', brief:'Product Brief', roadmap:'Roadmap', security:'Security', pipeline:'Data Pipeline', process:'Process' };

  const tabButtons = `
    <div class="proj-tabs">
      <button class="proj-tab active" onclick="switchProjTab(this,'ptab-overview-${topicId}')">Overview</button>
      ${artifactTabs.map(a => `<button class="proj-tab" onclick="switchProjTab(this,'ptab-${a}-${topicId}')">${artifactLabels[a]}</button>`).join('')}
    </div>`;

  const overviewTab = `<div class="proj-tab-content active" id="ptab-overview-${topicId}">${overviewHtml}</div>`;

  const artifactContent = artifactTabs.map(a => {
    const content = hasDocs && docs[a]
      ? (a === 'prep' ? renderPrepArtifact(docs[a]) : a === 'value' ? renderBusinessCase(docs[a]) : `<div class="proj-artifact">${simpleMarkdown(docs[a])}</div>`)
      : `<div class="proj-gen-banner">
          <h4>${artifactLabels[a]}</h4>
          <p>Generate AI-powered ${artifactLabels[a].toLowerCase()} for this initiative using meeting context.</p>
          <button class="btn btn-primary" onclick="generateProjectDocs(${topicId})">Generate All Project Docs</button>
        </div>`;
    return `<div class="proj-tab-content" id="ptab-${a}-${topicId}">${content}</div>`;
  }).join('');

  panel.innerHTML = `
    <div style="margin-bottom:1.5rem">
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem">
        <span style="display:inline-block;width:16px;height:16px;background:${t.color}"></span>
        <h2 style="font-family:var(--fd);font-weight:800;font-size:20px;color:var(--blue);margin:0">${esc(t.name)}</h2>
      </div>
      ${t.description ? `<p style="font-size:15px;color:var(--text-light);line-height:1.6;max-width:700px">${esc(t.description)}</p>` : ''}
      <div style="margin-top:.5rem;display:flex;gap:1rem;font-size:14px;color:var(--text-light)">
        <span><strong>${t.videoCount}</strong> meeting${t.videoCount!==1?'s':''}</span>
        <span><strong>${t.segments.length}</strong> transcript segments</span>
        ${hasDocs ? '<span class="tag tag-green">Docs Generated</span>' : ''}
      </div>
    </div>
    ${tabButtons}
    ${overviewTab}
    ${artifactContent}
  `;
}

function switchProjTab(btn, contentId) {
  const tabs = btn.parentElement;
  const parent = tabs.parentElement;
  tabs.querySelectorAll('.proj-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  parent.querySelectorAll('.proj-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(contentId).classList.add('active');
}

function buildTopicOverviewHtml(t) {
  // Group segments by meeting (same logic as showTopicDetail)
  const byMeeting = {};
  t.segments.forEach(s => {
    if (!byMeeting[s.meetingId]) byMeeting[s.meetingId] = { title: s.meetingTitle, url: s.meetingUrl, date: s.meetingDate, relevance: s.relevance || '', segments: [] };
    byMeeting[s.meetingId].segments.push(s);
  });

  let html = '';
  Object.entries(byMeeting).forEach(([mid, group]) => {
    const date = new Date(group.date);
    html += `<div class="segment-card" style="margin-bottom:1rem">
      <div class="segment-header">
        <div>
          <div class="video-title" style="cursor:pointer" onclick="showMeetingDetail(${mid})">${esc(group.title)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
        </div>
        ${group.url && group.url !== '#' ? `<a href="${group.url}" target="_blank" class="segment-link" style="margin:0">Watch on Fathom &#8594;</a>` : ''}
      </div>
      <div class="segment-body">
        ${group.relevance ? `<div class="segment-description" style="border-left:3px solid var(--green);padding-left:12px;margin-bottom:1rem">${esc(group.relevance)}</div>` : ''}
        <details>
          <summary style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);cursor:pointer;padding:4px 0">Transcript Excerpts (${group.segments.length})</summary>
          <div style="margin-top:.5rem">
            ${group.segments.map(s => {
              const lines = (s.lines||[]).map(l =>
                `<div><span class="timestamp">${l.timestamp||''}</span> <span class="speaker">${esc(l.speaker?.display_name||'')}</span>: ${esc(l.text)}</div>`
              ).join('');
              return `<div class="segment-transcript" style="margin-bottom:.5rem"><div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">${s.startTime} &ndash; ${s.endTime}</div>${lines}</div>`;
            }).join('')}
          </div>
        </details>
      </div>
    </div>`;
  });
  return html;
}

async function generateProjectDocs(topicId) {
  const t = STATE.topics.find(x => x.id === topicId);
  if (!t) return;
  if (!STATE.perplexityKey) { alert('Perplexity API key not set. Go to Topics Index to enter it.'); return; }

  // Gather transcript context with Fathom share URLs for citation
  // Limit to top 15 most relevant segments to keep within token limits
  const topSegments = t.segments
    .slice()
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, 15);
  // Re-sort by meeting date for readability
  topSegments.sort((a, b) => (a.meetingDate || '').localeCompare(b.meetingDate || ''));

  const meetingContext = topSegments.map(s => {
    const m = STATE.meetings.find(x => x.recording_id === s.meetingId);
    const shareUrl = m?.share_url || '';
    const tsParts = (s.startTime||'0:0:0').split(':').map(Number);
    const tsSec = (tsParts[0]||0)*3600 + (tsParts[1]||0)*60 + (tsParts[2]||0);
    const citeUrl = shareUrl ? shareUrl + '?timestamp=' + tsSec : '';
    const lines = s.lines ? s.lines.map(l => (l.speaker?.display_name||'') + ': ' + l.text).join('\n') : s.text;
    return `[Meeting: "${s.meetingTitle}" | ${s.startTime}–${s.endTime} | Video: ${citeUrl}]\n${lines.substring(0, 600)}`;
  }).join('\n\n---\n\n');

  // Also gather brief context from OTHER themes so the prep notes are holistic
  const otherThemes = STATE.topics.filter(x => x.id !== topicId).map(x =>
    `- "${x.name}": ${x.description || 'No description'}`
  ).join('\n');

  // Gather action items and summaries from related meetings only (not all)
  const relatedMeetingIds = new Set(t.segments.map(s => s.meetingId));
  const allMeetingSummaries = STATE.meetings
    .filter(m => relatedMeetingIds.has(m.recording_id))
    .map(m => {
      const title = m.title || m.meeting_title || 'Untitled';
      const date = new Date(m.recording_start_time || m.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      const summary = m.default_summary?.markdown_formatted || '';
      return summary ? `[${title} — ${date}]\n${summary.substring(0, 300)}` : '';
    }).filter(Boolean).join('\n\n');

  const prompt = `You are a product manager at Kaufman Rossin, a professional services firm. Based on the following meeting transcript excerpts about the initiative "${t.name}", generate 6 project artifacts.

INITIATIVE: ${t.name}
DESCRIPTION: ${t.description || 'See transcripts below.'}
MEETINGS INVOLVED: ${t.videoCount} meetings, ${t.segments.length} transcript segments

OTHER ACTIVE INITIATIVES (for context — these are the other themes being worked on across the team):
${otherThemes}

FIRM POLICIES (security evaluations, roadmaps, and meeting prep MUST account for these):
${getPoliciesContext().substring(0, 1500)}

BROADER MEETING CONTEXT (summaries from related meetings):
${allMeetingSummaries.substring(0, 2000)}

TRANSCRIPT EXCERPTS FOR THIS INITIATIVE:
${meetingContext}

Generate these 6 artifacts. Use markdown formatting. Be specific to what was actually discussed — do not invent details not present in the transcripts.

ARTIFACT 1 — "prep" (Meeting Prep — MUST BE STRUCTURED JSON, not markdown):
The prep value must be a JSON object (not a string) with this exact structure:
{
  "emails": [
    { "to": "Person Name", "subject": "Clear subject line", "body": "The full email draft body text. Be specific. Reference what was discussed.", "video_url": "the Fathom video URL with timestamp from the transcript context above, or empty string" }
  ],
  "conversations": [
    { "with": "Person Name", "topic": "What to discuss", "message": "Write the actual opening message as if you were sending it on Slack or Teams. Make it natural and conversational.", "why": "Why this conversation needs to happen before the meeting", "video_url": "" }
  ],
  "action_items": [
    { "owner": "Person Name", "task": "Specific deliverable description", "unblocks": "What this enables or unblocks", "video_url": "" }
  ],
  "discussion_topics": [
    { "topic": "Topic or question", "context": "Why this needs to be decided and any relevant background", "video_url": "" }
  ],
  "suggested_attendees": [
    { "name": "Person Name", "reason": "Why they need to be in the meeting" }
  ]
}
IMPORTANT: For video_url fields, use the Fathom Video URLs provided in the transcript context above (they look like https://fathom.video/share/xxx?timestamp=123). Pick the URL closest to where that topic was discussed. Leave empty string if no relevant link.
Be extremely specific. Use real names, real systems, real decisions from the transcripts.

ARTIFACT 2 — "value" (Business Case — MUST BE STRUCTURED JSON, not markdown):
The value assessment provides business justification backed by real research. You MUST use your web search capabilities to find relevant industry research, statistics, and best practices.
{
  "score": 8,
  "score_rationale": "Why this score (1-10) based on business impact, urgency, and strategic alignment",
  "business_impact": "2-3 sentences on how this initiative impacts revenue, efficiency, risk, or client satisfaction",
  "research": [
    { "finding": "Specific statistic or finding from industry research", "source": "Name of publication, firm, or study", "url": "URL to the source if available", "relevance": "How this applies to this initiative" }
  ],
  "roi_estimate": "Qualitative or quantitative ROI estimate based on the discussions and research",
  "blocks": ["Names of OTHER themes from the list above that THIS theme blocks or is a prerequisite for"],
  "blocked_by": ["Names of OTHER themes that must happen before this one can proceed"],
  "risks_of_inaction": "What happens if this initiative is NOT pursued — specific consequences based on what was discussed"
}
IMPORTANT: Use your web search to find 2-4 real research findings (from Gartner, McKinsey, Deloitte, AICPA, accounting industry reports, etc.) that support the business value of this type of initiative. Be specific with statistics and citations.

ARTIFACTS 3-7 — Standard project docs (brief, roadmap, security, pipeline, process).

IMPORTANT — MERMAID DIAGRAM RULES (pipeline and process):
- Use Mermaid diagram syntax inside a fenced code block marked with \`\`\`mermaid
- For pipeline: use graph LR (left to right). For process: use graph TD (top down).
- CRITICAL FORMATTING: Define ALL nodes FIRST with their labels, THEN write edges using ONLY the IDs (no brackets on edges). Example:

CORRECT:
\`\`\`mermaid
graph LR
  sf[Salesforce]
  sql[SQL Server]
  star[STAR]
  sf -->|DbAmp| sql
  sql --> star
  star -->|sync| sf
\`\`\`

WRONG (causes duplicate labels):
\`\`\`mermaid
graph LR
  sf[Salesforce] -->|DbAmp| sql[SQL Server]
  sql[SQL Server] --> star[STAR]
\`\`\`

- Use short labels (1-4 words). Use edge labels for methods/protocols.
- Use simple short IDs: sf, sql, star, adf, mcp, wes, etc.
- For decisions use {Decision Text} syntax.
- Keep diagrams to 5-12 nodes max. Put extra detail in the markdown text.

RESPOND WITH VALID JSON ONLY (no markdown fences around the JSON itself):
{
  "prep": { "emails": [...], "conversations": [...], "action_items": [...], "discussion_topics": [...], "suggested_attendees": [...] },
  "value": { "score": 8, "score_rationale": "...", "business_impact": "...", "research": [...], "roi_estimate": "...", "blocks": [...], "blocked_by": [...], "risks_of_inaction": "..." },
  "brief": "## Problem\\n...\\n## Target User\\n...\\n## User Stories\\n...\\n## Success Metrics\\n...\\n## Risks\\n...",
  "roadmap": "## P0 — Must Do\\n...\\n## P1 — Should Do\\n...\\n## P2 — Nice to Have\\n...",
  "security": "## Security Considerations\\n(Reference the firm's WISP and Records Retention Policy provided above)\\n## Risks\\n...\\n## Compliance Requirements\\n...\\n## Recommendations\\n...",
  "pipeline": "## Data Flow\\n\\nDescription...\\n\\n\`\`\`mermaid\\ngraph LR\\n  sf[Salesforce]\\n  sql[SQL Server]\\n  star[STAR]\\n  sf -->|DbAmp| sql\\n  sql --> star\\n\`\`\`\\n\\n## Key Integration Points\\n...",
  "process": "## Process Flow\\n\\nDescription...\\n\\n\`\`\`mermaid\\ngraph TD\\n  start[Step 1]\\n  decide{Decision}\\n  yes[Step 2]\\n  no[Step 3]\\n  start --> decide\\n  decide -->|Yes| yes\\n  decide -->|No| no\\n\`\`\`\\n\\n## Notes\\n..."
}

Each markdown value should be a complete document. Be thorough but grounded in what was actually said.
IMPORTANT: In the markdown artifacts (brief, roadmap, security, pipeline, process), whenever you reference a specific point discussed in a meeting, include a citation link using this format: [See discussion](VIDEO_URL) where VIDEO_URL is the Fathom video link with timestamp from the transcript context above.`;

  // Show loading state in all artifact tabs
  const loadLabels = { prep:'meeting prep', value:'business case', brief:'product brief', roadmap:'roadmap', security:'security eval', pipeline:'data pipeline', process:'process flow' };
  const allTabs = ['prep', 'brief', 'roadmap', 'security', 'pipeline', 'process'];
  allTabs.forEach(a => {
    const el = document.getElementById(`ptab-${a}-${topicId}`);
    if (el) el.innerHTML = '<div style="text-align:center;padding:2rem"><div class="loading-inline"></div><div style="font-family:var(--fd);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);margin-top:1rem">Generating ' + (loadLabels[a]||a) + '...</div></div>';
  });

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + STATE.perplexityKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8000,
        temperature: 0.1
      })
    });

    if (!res.ok) throw new Error(`Perplexity API ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = content.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    const docs = JSON.parse(jsonStr);

    STATE.projectDocs[topicId] = docs;
    try { sessionStorage.setItem('project_docs', JSON.stringify(STATE.projectDocs)); } catch(e) {}

    // Re-render the project page with the generated docs
    renderProjectPage(topicId);
  } catch (e) {
    artifactTabs.forEach(a => {
      const el = document.getElementById(`ptab-${a}-${topicId}`);
      if (el) el.innerHTML = `<div class="callout danger"><strong>Generation failed:</strong> ${esc(e.message)}</div>`;
    });
  }
}
