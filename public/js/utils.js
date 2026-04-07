// Utilities, markdown parser, helpers, demo data
// ═══════ SEARCH ═══════
function handleSearch(q) {
  q = q.toLowerCase().trim();
  if (!q) { showView(STATE.currentView); return; }
  if (STATE.currentView === 'meetings' || STATE.currentView === 'topics') {
    // Filter table rows or topic cards
    const sel = STATE.currentView === 'meetings' ? '.data-table tbody tr' : '.topic-card';
    document.querySelectorAll(sel).forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }
}

// ═══════ HELPERS ═══════
function esc(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
function showLoading(text) { document.getElementById('loadingText').textContent = text; document.getElementById('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }
function showConnectError(msg) { const el = document.getElementById('connectError'); el.textContent = msg; el.style.display = 'block'; }
let mermaidCounter = 0;

function simpleMarkdown(md) {
  if (!md) return '';

  // First, extract mermaid blocks and replace with placeholders
  const mermaidBlocks = [];
  md = md.replace(/```mermaid\s*\n([\s\S]*?)```/g, function(_, code) {
    const id = 'mermaid-' + (mermaidCounter++);
    mermaidBlocks.push({ id, code: code.trim() });
    return `%%MERMAID:${id}%%`;
  });

  // Also handle generic code blocks (non-mermaid)
  md = md.replace(/```(\w*)\s*\n([\s\S]*?)```/g, function(_, lang, code) {
    return '%%PRE%%' + code.replace(/\n/g, '%%NL%%') + '%%/PRE%%';
  });

  const lines = md.split('\n');
  let html = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Mermaid placeholder
    const mermaidMatch = line.match(/%%MERMAID:(.+?)%%/);
    if (mermaidMatch) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<div class="mermaid-container"><pre class="mermaid" id="${mermaidMatch[1]}"></pre></div>`;
      continue;
    }

    // Pre block placeholder
    if (line.includes('%%PRE%%')) {
      if (inList) { html += '</ul>'; inList = false; }
      const content = line.replace('%%PRE%%','').replace('%%/PRE%%','').replace(/%%NL%%/g,'\n');
      html += '<pre>' + esc(content) + '</pre>';
      continue;
    }

    // Headings
    if (/^### (.+)/.test(line)) { if (inList) { html += '</ul>'; inList = false; } html += '<h3>' + inlineFormat(line.replace(/^### /, '')) + '</h3>'; continue; }
    if (/^## (.+)/.test(line)) { if (inList) { html += '</ul>'; inList = false; } html += '<h2>' + inlineFormat(line.replace(/^## /, '')) + '</h2>'; continue; }
    if (/^# (.+)/.test(line)) { if (inList) { html += '</ul>'; inList = false; } html += '<h1>' + inlineFormat(line.replace(/^# /, '')) + '</h1>'; continue; }

    // List items (  - or - )
    const listMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (listMatch) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + inlineFormat(listMatch[1]) + '</li>';
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }

    // Regular paragraph
    if (inList) { html += '</ul>'; inList = false; }
    html += '<p>' + inlineFormat(line) + '</p>';
  }

  if (inList) html += '</ul>';

  // After HTML is built, schedule mermaid rendering
  if (mermaidBlocks.length) {
    setTimeout(() => renderMermaidBlocks(mermaidBlocks), 50);
  }

  return html;
}

async function renderMermaidBlocks(blocks) {
  for (const block of blocks) {
    const el = document.getElementById(block.id);
    if (!el) continue;
    try {
      // Apply entity colors via style directives appended to the diagram
      let code = block.code;
      const styleLines = extractEntityStyles(code);
      if (styleLines.length) code += '\n' + styleLines.join('\n');

      const { svg } = await mermaid.render(block.id + '-svg', code);
      el.outerHTML = `<div class="mermaid-container">${svg}</div>`;
    } catch(e) {
      // Fallback: show as code block if mermaid fails to parse
      el.outerHTML = `<pre style="background:var(--bg);color:var(--text);border:1px solid var(--border);padding:1rem;font-size:13px">${esc(block.code)}</pre>`;
    }
  }
}

// Parse mermaid code to find node labels and apply consistent entity colors
function extractEntityStyles(code) {
  const styles = [];
  const seen = new Set();
  // Match node definitions like: A[Label], A([Label]), A{Label}, A(Label), A[/Label/]
  const nodeRegex = /(\w+)\s*[\[\(\{\/]+([^\]\)\}\/]+)/g;
  let match;
  while ((match = nodeRegex.exec(code)) !== null) {
    const nodeId = match[1];
    const label = match[2].trim();
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);

    // Map well-known system names to consistent colors
    const c = getEntityColor(label);
    styles.push(`style ${nodeId} fill:${c.bg},stroke:${c.border},stroke-width:2px,color:${c.text}`);
  }
  return styles;
}

function inlineFormat(text) {
  return text
    // Links: [text](url) -> clickable, but strip the URL noise for readability
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, label, url) {
      // If the label itself is the interesting content, just make it a subtle link
      if (url.includes('fathom.video')) return '<a href="' + url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;border-bottom:1px solid var(--green-40)">' + label + '</a>';
      return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
    })
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code style="background:var(--gray-10);padding:1px 5px;font-size:13px">$1</code>');
}

// ═══════ DEMO DATA ═══════
function generateDemoMeetings() {
  const now = Date.now();
  return [
    makeDemoMeeting(1001, 'KR - Conflict Checks + Salesforce Integration', now - 13*86400000, 23, [
      {name:'Yorence Ramiz'},{name:'Melissa Caban'},{name:'Adam Daube'},{name:'Anami Kumpawat'},{name:'Ariel Sofi'}
    ], [
      {speaker:{display_name:'Yorence Ramiz'},text:'So the goal today is understanding the Salesforce to STAR handoff and how it comes from Salesforce and see if we can figure out some automation to tie in these two systems that are currently joined only by human hands.',timestamp:'00:00:30'},
      {speaker:{display_name:'Melissa Caban'},text:'I lead the Salesforce implementation for the firm. I have my tentacles in everything related to Salesforce across the firm, down to integrations, training, and getting service lines onboarded.',timestamp:'00:01:23'},
      {speaker:{display_name:'Adam Daube'},text:'We have this thing called DbAmp which is a tool by CData. It is used to manage SQL Server pipelines. That is currently how we connect Salesforce into STAR, and then we have staging tables and data products around SQL Server.',timestamp:'00:02:00'},
      {speaker:{display_name:'Melissa Caban'},text:'Manual entry, people create opportunities manually. Opportunities come to us in different ways. Not every service line does a conflict check. There are different avenues as to how an opportunity is created.',timestamp:'00:05:38'},
      {speaker:{display_name:'Melissa Caban'},text:'If the opportunity is closed won, it can be incorporated into new client acceptance. We start the new client acceptance form, it goes through an approval process, once approved it pushes to STAR.',timestamp:'00:06:10'},
      {speaker:{display_name:'Melissa Caban'},text:'Conflict check only exists in Salesforce in our sandbox. So keep that in mind. Once we set up that regular sync, there is a flow in Salesforce that will automatically generate an opportunity once the conflict check is cleared.',timestamp:'00:06:50'},
      {speaker:{display_name:'Yorence Ramiz'},text:'For those opportunities that do not go through conflict checks, you just start with opportunity in Salesforce? The first place client information is recorded in our system is Salesforce.',timestamp:'00:12:58'},
      {speaker:{display_name:'Melissa Caban'},text:'Yeah, for the conflict check service lines, it goes through conflict check before it gets to Salesforce. The idea is we do not want them going through opportunity phases if they are not even liable to be a client.',timestamp:'00:14:23'},
      {speaker:{display_name:'Adam Daube'},text:'As long as we can weave in a service account, that would make security very happy. That is my one piece to add. Anything we do should be logged, service accounted, with credentials and rotating tokens.',timestamp:'00:19:45'},
      {speaker:{display_name:'Yorence Ramiz'},text:'We are making a shift now internally to get all this stuff really shored up and enterprise-grade security. Our SecOps is only two people so I want us to be able to secure our stuff.',timestamp:'00:20:17'},
      {speaker:{display_name:'Melissa Caban'},text:'If you want I can send you the structure of the matter parties. Kind of do a comparison between what we get from conflict check and what matter parties looks like.',timestamp:'00:21:45'},
      {speaker:{display_name:'Yorence Ramiz'},text:'We can make an ETL layer in between to transform that data into the way that you need it and keep all the data in a warehouse somewhere and make sure Salesforce gets data in the format it needs.',timestamp:'00:22:01'},
    ], '## Summary\n\nDiscussed the Salesforce to STAR data pipeline and conflict check integration.\n\n- Conflict checks exist only in Salesforce sandbox\n- Not all service lines require conflict checks (tax does not)\n- DbAmp/SQL Server handles Salesforce-STAR sync\n- Manual data entry is the primary bottleneck\n- Need service accounts with rotating tokens for security'),

    makeDemoMeeting(1002, 'KR - Ariel Meeting the Data Team', now - 7*86400000, 50, [
      {name:'Ariel Sofi'},{name:'Eileen G. Martin'},{name:'Gregory Spaulding'},{name:'Adam Daube'},{name:'Yorence Ramiz'}
    ], [
      {speaker:{display_name:'Gregory Spaulding'},text:'I have been at the firm for 10 to 12 years. Started as IT, started working with Eileen, moved to the SQL side, and slow rolled into a data engineer type role doing integrations and data pipelines.',timestamp:'00:00:08'},
      {speaker:{display_name:'Eileen G. Martin'},text:'He also does all the API work, all the integrations, and the Azure warehousing stuff. I started at Helpdesk and had an affinity for databases. I love SQL and data metrics.',timestamp:'00:00:39'},
      {speaker:{display_name:'Ariel Sofi'},text:'I have experience in DevOps, data engineering, and most recently was doing data engineering work for a genetic startup processing metagenomic samples. We used DataHub for data products, lineage, and governance.',timestamp:'00:02:14'},
      {speaker:{display_name:'Gregory Spaulding'},text:'We do not have a formal data warehouse. We use SQL backend to store data for specific needs. We are just now starting data catalog and classification. Azure Data Factory is our main tool to move data, transitioned from SSIS.',timestamp:'00:07:06'},
      {speaker:{display_name:'Ariel Sofi'},text:'So STAR is the hub system, sitting in the middle of the star topology for all client data. And what is the status of the STAR cloud migration?',timestamp:'00:11:30'},
      {speaker:{display_name:'Eileen G. Martin'},text:'We cannot go to their cloud version because the subscription model would be too expensive. But they have not told anyone they are sunsetting the SQL version. There is no sunset date.',timestamp:'00:12:31'},
      {speaker:{display_name:'Eileen G. Martin'},text:'Our foray into the AI space is very fragmented. Different people doing a million different things and nobody knows what is being done. I would really like more cohesion and direction in that department.',timestamp:'00:15:03'},
      {speaker:{display_name:'Ariel Sofi'},text:'Wes is our internal chatbot agent platform for data discovery, workflow help for tax preparation, and managing long-lived processes like client onboarding. We need to tap into institutional knowledge.',timestamp:'00:16:36'},
      {speaker:{display_name:'Adam Daube'},text:'So you want to set up a way to interact with SQL that is safe for both sides. We would need a service account with read-only access. The permissions will be related to the user making the request.',timestamp:'00:23:31'},
      {speaker:{display_name:'Ariel Sofi'},text:'The system is RBAC with ABAC. Role-based access control with attribute-based access control. The model only uses the token the user has, it does not have any agency to go get data on its own.',timestamp:'00:34:13'},
      {speaker:{display_name:'Gregory Spaulding'},text:'Security was the biggest issue with this. Getting the data is not an issue. Categorizing data, we can do that. But there has to be a very deep process around security.',timestamp:'00:36:23'},
      {speaker:{display_name:'Adam Daube'},text:'The retention policy is aspirational. A lot of people are not conformant to it and there is no easy way to measure this across the firm. I will share that document with you.',timestamp:'00:42:46'},
      {speaker:{display_name:'Ariel Sofi'},text:'We are going to build things in a sandbox. Not editing production data. Going through security checks that are best of breed. Then we provide security reports to security so they can give us a thumbs up.',timestamp:'00:47:37'},
      {speaker:{display_name:'Adam Daube'},text:'If we could get that set up with Eden too, put him in the loop so we can get their guidance on the service account and the pass-through of permissions.',timestamp:'00:46:27'},
    ], '## Summary\n\nAriel met with the data team to understand the current data posture.\n\n- No formal data warehouse exists; SQL Server + Azure Data Factory\n- STAR is the central hub; cloud migration not imminent\n- Domo is closest to a data warehouse\n- AI efforts are fragmented across the firm\n- Need MCP server with read-only STAR access\n- RBAC + ABAC security model proposed\n- Data volume ~100TB, veracity is questionable\n- Records retention policy is aspirational, not enforced')
  ];
}

function makeDemoMeeting(id, title, ts, durMin, invitees, transcript, summary) {
  const start = new Date(ts);
  const end = new Date(ts + durMin * 60000);
  return {
    recording_id: id, title: title, meeting_title: title,
    url: '#', share_url: '#',
    created_at: start.toISOString(),
    recording_start_time: start.toISOString(),
    recording_end_time: end.toISOString(),
    scheduled_start_time: start.toISOString(),
    scheduled_end_time: end.toISOString(),
    recorded_by: { display_name: 'Ariel Sofi' },
    calendar_invitees: invitees.map(p => ({name: p.name, email: (p.name.split(' ')[0].toLowerCase() + '@kaufmanrossin.com')})),
    transcript: transcript,
    default_summary: { template_name: 'general', markdown_formatted: summary },
    action_items: []
  };
}
