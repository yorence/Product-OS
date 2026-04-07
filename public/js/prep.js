// Meeting prep renderer
// ═══════ MEETING PREP RENDERER ═══════

function citeButton(url) {
  if (!url) return '';
  return `<a href="${url}" target="_blank" rel="noopener" class="cite-link"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6,3 13,8 6,13"/></svg>Watch in video</a>`;
}

function renderPrepArtifact(prep) {
  // Handle case where prep came back as markdown string (fallback)
  if (typeof prep === 'string') return `<div class="proj-artifact">${simpleMarkdown(prep)}</div>`;

  let html = '';

  // Emails
  if (prep.emails && prep.emails.length) {
    html += '<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid var(--green-40)">Emails to Send</h2>';
    prep.emails.forEach(e => {
      const initials = (e.to || '??').split(' ').map(w => w[0]).join('').toUpperCase().substring(0,2);
      html += `<div class="email-card">
        <div class="email-card-header">
          <div class="email-card-avatar">${initials}</div>
          <div class="email-card-meta">
            <div class="email-card-to">To: ${esc(e.to)}</div>
            <div class="email-card-subject">${esc(e.subject)}</div>
          </div>
        </div>
        <div class="email-card-body">${simpleMarkdown(e.body || '')}</div>
        ${e.video_url ? `<div class="email-card-footer">${citeButton(e.video_url)}</div>` : ''}
      </div>`;
    });
  }

  // Conversations
  if (prep.conversations && prep.conversations.length) {
    html += '<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin:24px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--green-40)">Conversations to Have</h2>';
    prep.conversations.forEach(c => {
      html += `<div class="convo-card">
        <div class="convo-header">
          <span class="convo-person">${esc(c.with)}</span>
          <span style="color:var(--text-muted)">&mdash; ${esc(c.topic)}</span>
        </div>
        <div class="convo-bubble">${simpleMarkdown(c.message || '')}</div>
        ${c.why ? `<div class="convo-context">${esc(c.why)}</div>` : ''}
        ${c.video_url ? `<div class="convo-cite">${citeButton(c.video_url)}</div>` : ''}
      </div>`;
    });
  }

  // Action Items
  if (prep.action_items && prep.action_items.length) {
    html += '<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin:24px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--green-40)">Action Items</h2>';
    prep.action_items.forEach(a => {
      html += `<div class="action-card">
        <div class="action-check"></div>
        <div class="action-content">
          <div class="action-owner">${esc(a.owner)}</div>
          <div class="action-desc">${esc(a.task)}</div>
          ${a.unblocks ? `<div class="action-unblocks">Unblocks: ${esc(a.unblocks)}</div>` : ''}
          ${a.video_url ? `<div class="action-cite">${citeButton(a.video_url)}</div>` : ''}
        </div>
      </div>`;
    });
  }

  // Discussion Topics
  if (prep.discussion_topics && prep.discussion_topics.length) {
    html += '<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin:24px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--green-40)">Discussion Topics for Next Meeting</h2>';
    prep.discussion_topics.forEach(d => {
      html += `<div style="padding:12px 16px;background:white;border:1px solid var(--border);border-left:3px solid var(--blue);margin:.5rem 0;box-shadow:var(--sh-sm)">
        <div style="font-family:var(--fd);font-size:14px;font-weight:700;color:var(--blue);margin-bottom:4px">${esc(d.topic)}</div>
        <div style="font-size:14px;color:var(--text-light);line-height:1.6">${esc(d.context)}</div>
        ${d.video_url ? `<div style="margin-top:6px">${citeButton(d.video_url)}</div>` : ''}
      </div>`;
    });
  }

  // Suggested Attendees
  if (prep.suggested_attendees && prep.suggested_attendees.length) {
    html += '<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin:24px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--green-40)">Suggested Attendees</h2>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
    prep.suggested_attendees.forEach(a => {
      const initials = (a.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().substring(0,2);
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:white;border:1px solid var(--border);box-shadow:var(--sh-sm);flex:1;min-width:220px">
        <div style="width:32px;height:32px;background:var(--blue-10);color:var(--blue);display:flex;align-items:center;justify-content:center;font-family:var(--fd);font-weight:800;font-size:12px;flex-shrink:0">${initials}</div>
        <div><div style="font-family:var(--fd);font-size:13px;font-weight:700;color:var(--blue)">${esc(a.name)}</div><div style="font-size:13px;color:var(--text-light)">${esc(a.reason)}</div></div>
      </div>`;
    });
    html += '</div>';
  }

  return html || '<div class="proj-artifact"><p style="color:var(--text-muted)">No prep data generated.</p></div>';
}

// ═══════ BUSINESS CASE RENDERER ═══════

function renderBusinessCase(val) {
  if (typeof val === 'string') return `<div class="proj-artifact">${simpleMarkdown(val)}</div>`;

  let html = '';
  const score = val.score || 0;
  const scoreClass = score >= 7 ? 'value-high' : score >= 4 ? 'value-med' : 'value-low';

  // Score + Impact header
  html += `<div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:1.5rem">
    <div class="value-score ${scoreClass}">${score}</div>
    <div style="flex:1">
      <div style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);margin-bottom:4px">Business Value Score</div>
      <div style="font-size:15px;color:var(--text);line-height:1.6">${esc(val.score_rationale || '')}</div>
    </div>
  </div>`;

  // Business Impact
  if (val.business_impact) {
    html += `<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid var(--green-40)">Business Impact</h2>`;
    html += `<p style="font-size:15px;line-height:1.65;color:var(--text);margin-bottom:1.5rem">${esc(val.business_impact)}</p>`;
  }

  // Research findings
  if (val.research && val.research.length) {
    html += `<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid var(--green-40)">Supporting Research</h2>`;
    val.research.forEach(r => {
      html += `<div class="research-card">
        <div class="research-source">${esc(r.source || 'Industry Research')}</div>
        <div class="research-finding">${esc(r.finding || '')}</div>
        ${r.relevance ? `<div style="font-size:13px;color:var(--text-light);margin-top:6px;font-style:italic">${esc(r.relevance)}</div>` : ''}
        ${r.url ? `<div class="research-cite"><a href="${r.url}" target="_blank" rel="noopener">${esc(r.source || r.url)}</a></div>` : ''}
      </div>`;
    });
  }

  // ROI Estimate
  if (val.roi_estimate) {
    html += `<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin:1.5rem 0 8px;padding-bottom:6px;border-bottom:2px solid var(--green-40)">ROI Estimate</h2>`;
    html += `<div style="padding:14px 16px;background:var(--green-10);border-left:3px solid var(--green);font-size:15px;line-height:1.6;color:var(--text);margin-bottom:1.5rem">${esc(val.roi_estimate)}</div>`;
  }

  // Dependencies: blocks / blocked by
  if ((val.blocks && val.blocks.length) || (val.blocked_by && val.blocked_by.length)) {
    html += `<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid var(--green-40)">Dependencies</h2>`;
    if (val.blocked_by && val.blocked_by.length) {
      val.blocked_by.forEach(b => {
        html += `<div class="blocker-card">
          <div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--red);flex-shrink:0">Blocked by</div>
          <div style="font-size:15px;color:var(--text)">${esc(b)}</div>
        </div>`;
      });
    }
    if (val.blocks && val.blocks.length) {
      val.blocks.forEach(b => {
        html += `<div class="blocker-card enables">
          <div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--green-text);flex-shrink:0">Enables</div>
          <div style="font-size:15px;color:var(--text)">${esc(b)}</div>
        </div>`;
      });
    }
  }

  // Risks of inaction
  if (val.risks_of_inaction) {
    html += `<h2 style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--red);margin:1.5rem 0 8px;padding-bottom:6px;border-bottom:2px solid #f5c6c6">Risks of Inaction</h2>`;
    html += `<div style="padding:14px 16px;background:#fde8e8;border-left:3px solid var(--red);font-size:15px;line-height:1.6;color:var(--text);margin-bottom:1rem">${esc(val.risks_of_inaction)}</div>`;
  }

  return html || '<div class="proj-artifact"><p style="color:var(--text-muted)">No business case generated.</p></div>';
}
