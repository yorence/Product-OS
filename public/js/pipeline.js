// Initiative Pipeline — status computation, critical path, kanban, DAG
// ═══════════════════════════════════════════════════════════════════

// ── Status Computation ──────────────────────────────────────────

function findThemeByName(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  return STATE.topics.find(t => t.name.toLowerCase().trim() === lower) || null;
}

function computeStatus(themeId, visited) {
  if (!visited) visited = new Set();
  if (visited.has(themeId)) return 'ready';
  visited.add(themeId);

  if (STATE.initiativeStatus[themeId] === 'done') return 'done';
  if (STATE.initiativeStatus[themeId] === 'in_progress') return 'in_progress';

  const bv = STATE.projectDocs?.[themeId]?.value;
  if (!bv) return 'ready';

  const blockers = bv.blocked_by || [];
  for (const blockerName of blockers) {
    const blocker = findThemeByName(blockerName);
    if (blocker && computeStatus(blocker.id, new Set(visited)) !== 'done') {
      return 'blocked';
    }
  }

  return 'ready';
}

function computeAllStatuses() {
  const statuses = {};
  STATE.topics.forEach(t => { statuses[t.id] = computeStatus(t.id); });
  return statuses;
}

const STATUS_CONFIG = {
  blocked:     { label: 'Blocked',     color: 'var(--red)',        bg: '#fde8e8',         order: 0 },
  ready:       { label: 'Ready',       color: 'var(--green-text)', bg: 'var(--green-10)',  order: 1 },
  in_progress: { label: 'In Progress', color: 'var(--blue)',       bg: 'var(--blue-10)',   order: 2 },
  done:        { label: 'Done',        color: 'var(--charcoal)',   bg: 'var(--gray-10)',   order: 3 }
};

function statusBadgeHtml(status) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ready;
  const check = status === 'done' ? ' &#10003;' : '';
  return `<span style="font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${cfg.color};background:${cfg.bg};padding:3px 8px;white-space:nowrap">${cfg.label}${check}</span>`;
}

// ── Manual Status Toggle ────────────────────────────────────────

function toggleInitiativeStatus(themeId, event) {
  if (event) event.stopPropagation();

  const current = computeStatus(themeId);
  if (current === 'blocked') return;

  const override = STATE.initiativeStatus[themeId];
  if (!override) {
    STATE.initiativeStatus[themeId] = 'in_progress';
  } else if (override === 'in_progress') {
    STATE.initiativeStatus[themeId] = 'done';
  } else {
    delete STATE.initiativeStatus[themeId];
  }

  try { sessionStorage.setItem('initiative_status', JSON.stringify(STATE.initiativeStatus)); } catch(e) {}

  computeCriticalPath();

  if (STATE.currentView === 'pipeline') renderPipeline();
  if (STATE.currentView === 'topics') renderTopicsGrid();
  // Re-render project page header if on a project view
  if (STATE.currentView.startsWith('project-')) {
    const tid = parseInt(STATE.currentView.replace('project-', ''));
    renderProjectPage(tid);
  }
}

// ── Critical Path Algorithm ─────────────────────────────────────

function computeCriticalPath() {
  const themes = STATE.topics;
  if (!themes.length) { STATE.criticalPath = []; return; }

  const adj = {};
  const inDeg = {};

  themes.forEach(t => {
    adj[t.id] = [];
    inDeg[t.id] = 0;
  });

  const edges = [];
  themes.forEach(t => {
    const bv = STATE.projectDocs?.[t.id]?.value || {};
    (bv.blocks || []).forEach(blockedName => {
      const blocked = findThemeByName(blockedName);
      if (blocked) {
        adj[t.id].push(blocked.id);
        inDeg[blocked.id] = (inDeg[blocked.id] || 0) + 1;
        edges.push({ from: t.id, to: blocked.id });
      }
    });
  });

  if (!edges.length) { STATE.criticalPath = []; return; }

  // Kahn's topo sort
  const queue = [];
  const topoOrder = [];
  themes.forEach(t => { if ((inDeg[t.id] || 0) === 0) queue.push(t.id); });

  while (queue.length) {
    const node = queue.shift();
    topoOrder.push(node);
    (adj[node] || []).forEach(next => {
      inDeg[next]--;
      if (inDeg[next] === 0) queue.push(next);
    });
  }

  if (topoOrder.length < themes.length) {
    console.warn('Dependency cycle detected — critical path may be incomplete');
  }

  // Longest path via DP
  const dist = {};
  const prev = {};
  topoOrder.forEach(id => { dist[id] = 0; prev[id] = null; });

  topoOrder.forEach(node => {
    (adj[node] || []).forEach(next => {
      if (dist[node] + 1 > (dist[next] || 0)) {
        dist[next] = dist[node] + 1;
        prev[next] = node;
      }
    });
  });

  let endNode = null;
  let maxDist = 0;
  topoOrder.forEach(id => {
    if ((dist[id] || 0) > maxDist) {
      maxDist = dist[id];
      endNode = id;
    }
  });

  const path = [];
  let cur = endNode;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur] ?? null;
  }

  STATE.criticalPath = path.length > 1 ? path : [];
}

// ── Pipeline View Rendering ─────────────────────────────────────

function renderPipeline() {
  const panel = document.getElementById('view-pipeline');
  if (!panel) return;

  if (!STATE.topicsUnlocked || !STATE.topics.length) {
    panel.innerHTML = '<div style="text-align:center;padding:4rem 2rem"><div style="font-size:2.5rem;opacity:.3">&#9776;</div><h3 style="font-family:var(--fd);font-weight:800;font-size:20px;color:var(--blue);margin:1rem 0 .5rem">Initiative Pipeline</h3><p style="font-size:15px;color:var(--text-light)">Unlock themes first to view the initiative pipeline.</p><button class="btn btn-primary" onclick="showView(\'topics\')">Go to Themes</button></div>';
    return;
  }

  const hasScores = STATE.topics.some(t => STATE.projectDocs?.[t.id]?.value?.score);
  if (!hasScores) {
    panel.innerHTML = '<div style="text-align:center;padding:4rem 2rem"><div style="font-size:2.5rem;opacity:.3">&#9776;</div><h3 style="font-family:var(--fd);font-weight:800;font-size:20px;color:var(--blue);margin:1rem 0 .5rem">Initiative Pipeline</h3><p style="font-size:15px;color:var(--text-light)">Generate project docs for at least one theme to populate the pipeline.</p><button class="btn btn-primary" onclick="showView(\'topics\')">Go to Themes</button></div>';
    return;
  }

  computeCriticalPath();

  // Critical path header
  let cpHtml = '';
  if (STATE.criticalPath.length > 1) {
    const cpNames = STATE.criticalPath.map(id => {
      const t = STATE.topics.find(x => x.id === id);
      return t ? esc(t.name) : '?';
    });
    cpHtml = `<div style="padding:12px 16px;background:var(--blue-10);border-left:3px solid var(--blue);margin-bottom:1.5rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--blue)">Critical Path:</span>
      ${cpNames.map((n, i) => `<span style="font-family:var(--fd);font-size:13px;font-weight:700;color:var(--blue)">${n}</span>${i < cpNames.length - 1 ? '<span style="color:var(--blue-40)">&#10132;</span>' : ''}`).join('')}
      <span style="font-family:var(--fd);font-size:11px;color:var(--blue-60);margin-left:auto">${STATE.criticalPath.length} steps</span>
    </div>`;
  }

  panel.innerHTML = cpHtml + '<div id="kanban-container"></div><div id="pipeline-dag-container" style="margin-top:2rem"></div>';

  renderKanban();
  renderPipelineDAG();
}

function renderKanban() {
  const container = document.getElementById('kanban-container');
  if (!container) return;

  const columns = {
    blocked: { themes: [], cfg: STATUS_CONFIG.blocked },
    ready: { themes: [], cfg: STATUS_CONFIG.ready },
    in_progress: { themes: [], cfg: STATUS_CONFIG.in_progress },
    done: { themes: [], cfg: STATUS_CONFIG.done }
  };

  STATE.topics.forEach(t => {
    const status = computeStatus(t.id);
    if (columns[status]) columns[status].themes.push(t);
  });

  Object.values(columns).forEach(col => {
    col.themes.sort((a, b) => (getThemeICE(b) ?? -1) - (getThemeICE(a) ?? -1));
  });

  let html = '<div class="kanban">';

  ['blocked', 'ready', 'in_progress', 'done'].forEach(status => {
    const col = columns[status];
    const cfg = col.cfg;

    html += `<div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-title" style="color:${cfg.color}">${cfg.label}</span>
        <span class="kanban-col-count">${col.themes.length}</span>
      </div>
      <div class="kanban-cards">`;

    col.themes.forEach(t => {
      const bv = STATE.projectDocs?.[t.id]?.value || {};
      const ice = getThemeICE(t);
      const blockedBy = bv.blocked_by || [];

      let btnHtml = '';
      if (status === 'ready') {
        btnHtml = `<button class="kanban-card-btn" style="background:var(--blue);color:white" onclick="toggleInitiativeStatus(${t.id},event)">Start</button>`;
      } else if (status === 'in_progress') {
        btnHtml = `<button class="kanban-card-btn" style="background:var(--green);color:var(--blue)" onclick="toggleInitiativeStatus(${t.id},event)">Complete</button>`;
      } else if (status === 'done') {
        btnHtml = `<button class="kanban-card-btn" style="background:var(--gray-10);color:var(--text-light)" onclick="toggleInitiativeStatus(${t.id},event)">Reopen</button>`;
      }

      let blockerHtml = '';
      if (status === 'blocked') {
        blockerHtml = '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">' +
          blockedBy.map(b => {
            const bt = findThemeByName(b);
            const resolved = bt && computeStatus(bt.id) === 'done';
            if (resolved) return '';
            const click = bt ? `onclick="event.stopPropagation();showView('project-${bt.id}')"` : '';
            return `<span style="font-family:var(--fd);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--red);background:#fde8e8;padding:2px 5px;${bt ? 'cursor:pointer' : ''}" ${click}>&#9888; ${esc(b)}</span>`;
          }).join('') + '</div>';
      }

      html += `<div class="kanban-card" onclick="showView('project-${t.id}')">
        <div class="kanban-card-color" style="background:${t.color}"></div>
        <div class="kanban-card-body">
          <div class="kanban-card-name">${esc(t.name)}</div>
          <div class="kanban-card-meta">
            ${ice !== null ? `<span class="value-score ${ice >= 7 ? 'value-high' : ice >= 4 ? 'value-med' : 'value-low'}" style="width:26px;height:26px;font-size:12px">${ice}</span>` : ''}
            <span class="kanban-card-cat">${esc(t.category || 'General')}</span>
          </div>
          ${blockerHtml}
          ${btnHtml}
        </div>
      </div>`;
    });

    html += '</div></div>';
  });

  html += '</div>';
  container.innerHTML = html;
}

// ── Dependency DAG ──────────────────────────────────────────────

let dagInstance = null;
let dagResizeHandler = null;
let dagHighlightedNodes = null; // Set of node IDs in the highlighted chain
let dagHighlightedLinks = null; // Set of "srcId->tgtId" strings

function renderPipelineDAG() {
  const container = document.getElementById('pipeline-dag-container');
  if (!container) return;

  const scoredThemes = STATE.topics.filter(t => STATE.projectDocs?.[t.id]?.value);
  if (!scoredThemes.length) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:14px">Generate project docs to see the dependency graph.</div>';
    return;
  }

  // Build nodes
  const statusColors = { blocked: '#a0200d', ready: '#5a7200', in_progress: '#1d4c7e', done: '#3c3c3c' };
  const nodes = scoredThemes.map(t => {
    const ice = getThemeICE(t) || 3;
    const status = computeStatus(t.id);
    return {
      id: t.id,
      name: t.name,
      ice: ice,
      status: status,
      color: statusColors[status] || '#5a7200',
      val: Math.max(ice * 2, 6)
    };
  });

  const nodeIds = new Set(nodes.map(n => n.id));
  const links = [];
  scoredThemes.forEach(t => {
    const bv = STATE.projectDocs?.[t.id]?.value || {};
    (bv.blocks || []).forEach(blockedName => {
      const blocked = findThemeByName(blockedName);
      if (blocked && nodeIds.has(blocked.id)) {
        links.push({ source: t.id, target: blocked.id });
      }
    });
  });

  if (!links.length) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:14px">No dependency relationships found between themes.</div>';
    return;
  }

  // Critical path edge set
  const cpSet = new Set();
  for (let i = 0; i < STATE.criticalPath.length - 1; i++) {
    cpSet.add(STATE.criticalPath[i] + '->' + STATE.criticalPath[i + 1]);
  }

  container.innerHTML = `
    <div style="font-family:var(--fd);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--green-text);margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--green-40)">Dependency Graph</div>
    <div style="display:flex;gap:2px">
      <div id="dag-graph" style="flex:1;height:400px;background:var(--charcoal);position:relative"></div>
      <div id="dag-detail" style="width:260px;background:white;border:1px solid var(--border);display:none;padding:16px;overflow-y:auto;max-height:400px"></div>
    </div>
    <div style="display:flex;gap:16px;margin-top:8px;font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#a0200d"></span>Blocked</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#5a7200"></span>Ready</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#1d4c7e"></span>In Progress</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#3c3c3c"></span>Done</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:16px;height:3px;background:var(--green)"></span>Critical Path</span>
    </div>`;

  const graphEl = document.getElementById('dag-graph');
  if (!graphEl) return;

  requestAnimationFrame(() => {
    const width = graphEl.clientWidth || 600;
    const height = graphEl.clientHeight || 400;

    if (dagInstance) { try { dagInstance._destructor?.(); } catch(e) {} dagInstance = null; }

    dagInstance = ForceGraph3D({ controlType: 'orbit' })(graphEl)
      .numDimensions(2)
      .width(width)
      .height(height)
      .backgroundColor('#3c3c3c')
      .graphData({ nodes, links })
      .nodeLabel(n => `${n.name} (ICE: ${n.ice})`)
      .nodeColor(n => {
        if (!dagHighlightedNodes) return n.color;
        return dagHighlightedNodes.has(n.id) ? n.color : 'rgba(100,100,100,.3)';
      })
      .nodeVal(n => n.val)
      .linkDirectionalArrowLength(6)
      .linkDirectionalArrowRelPos(0.85)
      .linkColor(l => {
        const src = l.source?.id ?? l.source;
        const tgt = l.target?.id ?? l.target;
        const key = src + '->' + tgt;
        if (dagHighlightedLinks) {
          return dagHighlightedLinks.has(key) ? '#aed136' : 'rgba(255,255,255,.05)';
        }
        return cpSet.has(key) ? '#aed136' : 'rgba(255,255,255,.2)';
      })
      .linkWidth(l => {
        const src = l.source?.id ?? l.source;
        const tgt = l.target?.id ?? l.target;
        const key = src + '->' + tgt;
        if (dagHighlightedLinks) {
          return dagHighlightedLinks.has(key) ? 3 : 0.5;
        }
        return cpSet.has(key) ? 3 : 1;
      })
      .onNodeClick(node => {
        highlightDAGChain(node.id, links);
        showDAGDetail(node);
      })
      .onBackgroundClick(() => {
        clearDAGHighlight();
        const dp = document.getElementById('dag-detail');
        if (dp) dp.style.display = 'none';
      });

    dagInstance.d3Force('charge').strength(-200);
    dagInstance.d3Force('link').distance(100);

    // Resize handler
    if (dagResizeHandler) window.removeEventListener('resize', dagResizeHandler);
    dagResizeHandler = () => {
      if (dagInstance && graphEl.clientWidth) {
        dagInstance.width(graphEl.clientWidth).height(graphEl.clientHeight || 400);
      }
    };
    window.addEventListener('resize', dagResizeHandler);
  });
}

function highlightDAGChain(nodeId, links) {
  dagHighlightedNodes = new Set();
  dagHighlightedLinks = new Set();

  // Build adjacency in both directions for traversal
  const forward = {};  // blocker -> [blocked]
  const reverse = {};  // blocked -> [blocker]
  links.forEach(l => {
    const src = l.source?.id ?? l.source;
    const tgt = l.target?.id ?? l.target;
    if (!forward[src]) forward[src] = [];
    forward[src].push(tgt);
    if (!reverse[tgt]) reverse[tgt] = [];
    reverse[tgt].push(src);
  });

  // Trace upstream (all blockers of this node, recursively)
  const traceUp = (id, visited) => {
    if (visited.has(id)) return;
    visited.add(id);
    dagHighlightedNodes.add(id);
    (reverse[id] || []).forEach(parent => {
      dagHighlightedLinks.add(parent + '->' + id);
      traceUp(parent, visited);
    });
  };

  // Trace downstream (all nodes this blocks, recursively)
  const traceDown = (id, visited) => {
    if (visited.has(id)) return;
    visited.add(id);
    dagHighlightedNodes.add(id);
    (forward[id] || []).forEach(child => {
      dagHighlightedLinks.add(id + '->' + child);
      traceDown(child, visited);
    });
  };

  dagHighlightedNodes.add(nodeId);
  traceUp(nodeId, new Set());
  traceDown(nodeId, new Set());

  // Force re-render of node/link styles
  if (dagInstance) dagInstance.nodeColor(dagInstance.nodeColor()).linkColor(dagInstance.linkColor()).linkWidth(dagInstance.linkWidth());
}

function clearDAGHighlight() {
  dagHighlightedNodes = null;
  dagHighlightedLinks = null;
  if (dagInstance) dagInstance.nodeColor(dagInstance.nodeColor()).linkColor(dagInstance.linkColor()).linkWidth(dagInstance.linkWidth());
}

function showDAGDetail(node) {
  const panel = document.getElementById('dag-detail');
  if (!panel) return;

  const t = STATE.topics.find(x => x.id === node.id);
  if (!t) return;

  const bv = STATE.projectDocs?.[t.id]?.value || {};
  const status = computeStatus(t.id);
  const ice = getThemeICE(t);

  const upstream = (bv.blocked_by || []).map(name => {
    const theme = findThemeByName(name);
    return { name, id: theme?.id, status: theme ? computeStatus(theme.id) : null };
  });
  const downstream = (bv.blocks || []).map(name => {
    const theme = findThemeByName(name);
    return { name, id: theme?.id, status: theme ? computeStatus(theme.id) : null };
  });

  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="margin-bottom:12px">${statusBadgeHtml(status)}</div>
    <div style="font-family:var(--fd);font-size:16px;font-weight:800;color:var(--blue);margin-bottom:4px">${esc(t.name)}</div>
    <div style="font-size:13px;color:var(--text-light);line-height:1.5;margin-bottom:12px">${esc(t.description || '')}</div>
    ${ice !== null ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)">ICE</span><span class="value-score ${ice >= 7 ? 'value-high' : ice >= 4 ? 'value-med' : 'value-low'}" style="width:30px;height:30px;font-size:13px">${ice}</span></div>` : ''}
    ${upstream.length ? `<div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin-bottom:6px">Blocked By</div>
    ${upstream.map(u => `<div style="padding:4px 0;font-size:14px;${u.id != null ? 'cursor:pointer' : ''}" ${u.id != null ? `onclick="showView('project-${u.id}')"` : ''}>${u.status === 'done' ? '<span style="color:var(--green-text)">&#10003;</span> <s>' : '<span style="color:var(--red)">&#9888;</span> '}${esc(u.name)}${u.status === 'done' ? '</s>' : ''}</div>`).join('')}` : ''}
    ${downstream.length ? `<div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--green-text);margin:12px 0 6px">Enables</div>
    ${downstream.map(d => `<div style="padding:4px 0;font-size:14px;${d.id != null ? 'cursor:pointer' : ''}" ${d.id != null ? `onclick="showView('project-${d.id}')"` : ''}>&#10132; ${esc(d.name)}</div>`).join('')}` : ''}
    <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;margin-top:16px" onclick="showView('project-${t.id}')">Open Project</button>
  `;
}
