// 3D Knowledge Graph
// ═══════ 3D KNOWLEDGE GRAPH ═══════
let graph3dInstance = null;
let graphData = null;
let highlightedNodes = new Set();
let highlightedLinks = new Set();

let selectedNode = null;

function highlightConnected(node) {
  selectedNode = node;
  highlightedNodes.clear();
  highlightedLinks.clear();
  highlightedNodes.add(node.id);

  // Find all directly connected nodes + their link strength
  const connectedStrengths = {};
  (graphData?.links || []).forEach(l => {
    const src = l.source?.id || l.source;
    const tgt = l.target?.id || l.target;
    let otherId = null;
    if (src === node.id) otherId = tgt;
    else if (tgt === node.id) otherId = src;
    if (otherId) {
      highlightedNodes.add(otherId);
      highlightedLinks.add(l);
      connectedStrengths[otherId] = (l.strength || 1);
    }
  });

  // Find max strength for normalization
  const strengths = Object.values(connectedStrengths);
  const maxStr = Math.max(...strengths, 1);

  if (!graph3dInstance) return;

  // Fly camera to center on selected node
  const dist = 150;
  const hyp = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
  const ratio = 1 + dist / hyp;
  graph3dInstance.cameraPosition(
    { x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio },
    { x: node.x || 0, y: node.y || 0, z: node.z || 0 },
    1200
  );

  // Arrange connected nodes in a circle around the selected node
  const connectedIds = Object.keys(connectedStrengths);
  const angleStep = (2 * Math.PI) / (connectedIds.length || 1);
  const orbitRadius = 50;

  connectedIds.forEach((cid, i) => {
    const cNode = graphData.nodes.find(n => n.id === cid);
    if (!cNode) return;
    const str = connectedStrengths[cid] / maxStr; // 0-1 normalized
    const r = orbitRadius * (1.2 - str * 0.5); // stronger = closer
    const angle = angleStep * i;
    // Position in a circle on the XY plane around the selected node
    cNode.fx = (node.x || 0) + r * Math.cos(angle);
    cNode.fy = (node.y || 0) + r * Math.sin(angle);
    cNode.fz = (node.z || 0) + (Math.random() - 0.5) * 10;
  });

  // Pin the selected node
  node.fx = node.x;
  node.fy = node.y;
  node.fz = node.z;

  // Update visuals — use nodeColor with alpha for opacity since nodeOpacity only takes a number
  graph3dInstance
    .nodeColor(n => {
      if (n.id === node.id) return n.color;
      if (!highlightedNodes.has(n.id)) return 'rgba(60,60,60,0.06)';
      // Brighter for stronger connections
      const str = connectedStrengths[n.id] || 1;
      const alpha = 0.5 + (str / maxStr) * 0.5;
      if (n.type === 'theme') return `rgba(174,209,54,${alpha})`;
      return `rgba(255,255,255,${alpha})`;
    })
    .nodeVal(n => {
      if (n.id === node.id) return 16;
      if (!highlightedNodes.has(n.id)) return 0.5;
      const str = connectedStrengths[n.id] || 1;
      return 3 + (str / maxStr) * 10;
    })
    .linkColor(l => {
      if (!highlightedLinks.has(l)) return 'rgba(60,60,60,0.02)';
      const str = l.strength || 1;
      const opacity = 0.3 + (str / maxStr) * 0.7;
      return `rgba(174,209,54,${opacity})`;
    })
    .linkWidth(l => {
      if (!highlightedLinks.has(l)) return 0.1;
      const str = l.strength || 1;
      return 1 + (str / maxStr) * 5;
    })
    .nodeLabel(n => highlightedNodes.has(n.id) ? n.name : '');
}

function defaultLinkColor(l) {
  if (l.type === 'involves') return 'rgba(174,209,54,0.3)';
  if (l.type === 'co_theme') return 'rgba(119,148,188,0.15)';
  return 'rgba(119,148,188,0.2)';
}

function clearHighlight() {
  selectedNode = null;
  highlightedNodes.clear();
  highlightedLinks.clear();

  // Unpin all nodes
  if (graphData) {
    graphData.nodes.forEach(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; });
  }

  if (graph3dInstance) {
    graph3dInstance
      .nodeColor(n => n.color)
      .nodeVal(n => n.type === 'theme' ? 12 : 5)
      .linkColor(l => defaultLinkColor(l))
      .linkWidth(l => l.type === 'involves' ? 1.5 : 0.5)
      .nodeLabel(n => n.name);
  }
}

function getNodeColor(name, type) {
  // People get white, themes get green, meetings use entity color registry for consistency with Mermaid
  if (type === 'person') return '#ffffff';
  if (type === 'theme') return '#aed136';
  // Meetings: use the entity color system so "STAR", "Salesforce" etc match Mermaid
  const c = getEntityColor(name);
  return c.border; // use the border color (the saturated one)
}

function buildGraphData() {
  const nodes = [];
  const links = [];
  const personSet = new Map();

  if (!STATE.topicsUnlocked || !STATE.topics.length) return { nodes, links };

  // Only themes and people — no meeting nodes
  STATE.topics.forEach(t => {
    const tid = 'theme-' + t.id;
    nodes.push({ id: tid, name: t.name, fullName: t.name, description: t.description || '', type: 'theme', color: '#aed136', val: 12 });

    // Count how many transcript lines each person has in this theme's segments
    const peopleCounts = {};
    t.segments.forEach(s => {
      (s.lines || []).forEach(l => {
        const n = l.speaker?.display_name;
        if (n) peopleCounts[n] = (peopleCounts[n] || 0) + 1;
      });
      (s.speakers || []).forEach(n => {
        if (n && !peopleCounts[n]) peopleCounts[n] = 1;
      });
    });

    // Also include meeting invitees (lower strength -- attended but may not have spoken on topic)
    t.videoIds.forEach(mid => {
      const m = STATE.meetings.find(x => x.recording_id === mid);
      if (m) (m.calendar_invitees || []).forEach(p => {
        if (p.name && !peopleCounts[p.name]) peopleCounts[p.name] = 1;
      });
    });

    Object.entries(peopleCounts).forEach(([name, count]) => {
      const pid = 'person-' + name.toLowerCase().replace(/[^a-z]/g, '');
      if (!personSet.has(name)) {
        personSet.set(name, pid);
        nodes.push({ id: pid, name: name, fullName: name, type: 'person', color: '#ffffff', val: 5 });
      }
      links.push({ source: tid, target: personSet.get(name), type: 'involves', strength: count });
    });
  });

  // Add links between people who share themes (co-involvement)
  STATE.topics.forEach(t => {
    const tid = 'theme-' + t.id;
    const peoplInTheme = (graphData?.links || links).filter(l => {
      const src = l.source?.id || l.source;
      return src === tid;
    }).map(l => l.target?.id || l.target);
    // Connect co-involved people (lightweight, only if both in same theme)
    for (let i = 0; i < peoplInTheme.length; i++) {
      for (let j = i + 1; j < peoplInTheme.length; j++) {
        if (peoplInTheme[i].startsWith('person-') && peoplInTheme[j].startsWith('person-')) {
          // Only add if not already linked
          const exists = links.some(l => {
            const s = l.source?.id || l.source;
            const t2 = l.target?.id || l.target;
            return l.type === 'co_theme' && ((s === peoplInTheme[i] && t2 === peoplInTheme[j]) || (s === peoplInTheme[j] && t2 === peoplInTheme[i]));
          });
          if (!exists) links.push({ source: peoplInTheme[i], target: peoplInTheme[j], type: 'co_theme' });
        }
      }
    }
  });

  return { nodes, links };
}

function renderGraph3D() {
  const container = document.getElementById('graph3d-container');
  const unlock = document.getElementById('graph3d-unlock');
  const overlay = document.getElementById('graph3d-overlay');
  if (!container) return;

  // If themes aren't unlocked, show prompt, hide overlay
  if (!STATE.topicsUnlocked || !STATE.topics.length) {
    if (unlock) unlock.style.display = 'flex';
    if (overlay) overlay.style.display = 'none';
    return;
  }

  // Themes are unlocked — hide prompt, show overlay
  if (unlock) unlock.style.display = 'none';
  if (overlay) overlay.style.display = 'block';

  // Wait a frame so the panel is visible and has dimensions
  requestAnimationFrame(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 10 || h < 10) {
      setTimeout(renderGraph3D, 100);
      return;
    }

    graphData = buildGraphData();
    if (!graphData.nodes.length) return;

    // Clear previous graph instance only
    if (graph3dInstance) {
      try { graph3dInstance._destructor(); } catch(e) {}
      graph3dInstance = null;
    }
    // Remove only ForceGraph3D-injected elements from the canvas container
    [...container.children].forEach(el => el.remove());

    try {
      graph3dInstance = ForceGraph3D()(container)
        .graphData(graphData)
        .backgroundColor('#3c3c3c')
        .width(w)
        .height(h)
        .nodeColor(n => n.color)
        .nodeVal(n => n.val || 5)
        .nodeLabel(n => n.name)
        .nodeResolution(16)
        .linkColor(l => defaultLinkColor(l))
        .linkWidth(l => l.type === 'involves' ? 1.5 : 0.5)
        .linkOpacity(0.7)
        .onNodeClick(node => {
          showGraphDetail(node);
          highlightConnected(node);
        })
        .onBackgroundClick(() => {
          clearHighlight();
          const detail = document.getElementById('graph3d-detail');
          if (detail) detail.style.display = 'none';
        });

      // Configure forces separately (d3Force returns force obj, not graph)
      graph3dInstance.d3Force('charge').strength(-80);
      graph3dInstance.d3Force('link').distance(l => {
        if (l.type === 'involves') {
          const str = l.strength || 1;
          return 80 - Math.min(str * 3, 50);
        }
        return 100;
      });

      populateGraphDirectory();
    } catch(e) {
      console.error('Graph3D init error:', e);
      container.querySelector('#graph3d-info').textContent = 'Error initializing 3D graph: ' + e.message;
    }
  });
}

function populateGraphDirectory() {
  const dir = document.getElementById('graph3d-directory');
  if (!dir || !graphData) return;

  // Group: themes with their people
  const themes = graphData.nodes.filter(n => n.type === 'theme');
  const people = graphData.nodes.filter(n => n.type === 'person');

  // Build a map of person -> themes
  const personThemes = {};
  people.forEach(p => { personThemes[p.id] = []; });
  (graphData.links || []).forEach(l => {
    const src = l.source?.id || l.source;
    const tgt = l.target?.id || l.target;
    if (l.type === 'involves' && typeof tgt === 'string' && tgt.startsWith('person-')) {
      if (personThemes[tgt]) personThemes[tgt].push({ themeId: src, strength: l.strength || 1 });
    }
  });

  let html = '';

  // Themes section
  html += `<div style="padding:8px 12px 4px;font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--green);border-bottom:1px solid rgba(255,255,255,.06)">Themes</div>`;
  themes.forEach(t => {
    // Count people in this theme
    const pCount = (graphData.links || []).filter(l => {
      const src = l.source?.id || l.source;
      return src === t.id && l.type === 'involves';
    }).length;
    html += `<div class="graph-dir-item" onclick="focusGraphNode('${t.id}')" style="cursor:pointer;padding:7px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.04);transition:background 150ms">
      <span style="width:8px;height:8px;background:#aed136;border-radius:50%;flex-shrink:0"></span>
      <span style="font-family:var(--fd);font-size:12px;font-weight:600;color:rgba(255,255,255,.75);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</span>
      <span style="font-family:var(--fd);font-size:10px;font-weight:700;color:rgba(255,255,255,.25)">${pCount}</span>
    </div>`;
  });

  // People section - sorted by number of themes (most connected first)
  const sortedPeople = [...people].sort((a, b) => (personThemes[b.id]?.length || 0) - (personThemes[a.id]?.length || 0));
  html += `<div style="padding:8px 12px 4px;margin-top:4px;font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.45);border-bottom:1px solid rgba(255,255,255,.06)">People</div>`;
  sortedPeople.forEach(p => {
    const themeCount = personThemes[p.id]?.length || 0;
    const themeNames = personThemes[p.id]?.map(pt => {
      const tNode = graphData.nodes.find(n => n.id === pt.themeId);
      return tNode?.name || '';
    }).filter(Boolean) || [];
    html += `<div class="graph-dir-item" onclick="focusGraphNode('${p.id}')" style="cursor:pointer;padding:7px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.04);transition:background 150ms">
      <span style="width:8px;height:8px;background:rgba(255,255,255,.7);border-radius:50%;flex-shrink:0"></span>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--fd);font-size:12px;font-weight:600;color:rgba(255,255,255,.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
        ${themeNames.length ? `<div style="font-size:10px;color:rgba(174,209,54,.5);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(themeNames.join(' · '))}</div>` : ''}
      </div>
      <span style="font-family:var(--fd);font-size:10px;font-weight:700;color:rgba(255,255,255,.2)">${themeCount}</span>
    </div>`;
  });

  dir.innerHTML = html;
}

function focusGraphNode(nodeId) {
  if (!graphData || !graph3dInstance) return;
  const node = graphData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  showGraphDetail(node);
  highlightConnected(node);

  // Highlight the active directory item
  document.querySelectorAll('.graph-dir-item').forEach(el => el.style.background = '');
  // Find and highlight the clicked one
  document.querySelectorAll('.graph-dir-item').forEach(el => {
    if (el.getAttribute('onclick')?.includes(nodeId)) {
      el.style.background = 'rgba(174,209,54,.12)';
    }
  });
}

function showGraphDetail(node) {
  const detail = document.getElementById('graph3d-detail');
  if (!detail) return;
  let html = '';

  if (node.type === 'theme') {
    const t = STATE.topics.find(x => 'theme-' + x.id === node.id);
    // Find people connected to this theme
    const people = [];
    (graphData?.links || []).forEach(l => {
      const src = l.source?.id || l.source;
      const tgt = l.target?.id || l.target;
      if (src === node.id && typeof tgt === 'string' && tgt.startsWith('person-')) {
        const pNode = graphData.nodes.find(n => n.id === tgt);
        if (pNode) people.push(pNode.name);
      }
    });
    html = `<div style="background:rgba(0,0,0,.75);padding:14px;border-left:3px solid #aed136">
      <div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#aed136;margin-bottom:4px">Theme</div>
      <div style="font-family:var(--fd);font-size:14px;font-weight:700;color:white;margin-bottom:6px">${esc(node.fullName)}</div>
      ${node.description ? '<div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:8px;line-height:1.5">' + esc(node.description) + '</div>' : ''}
      ${people.length ? '<div style="font-size:12px;color:rgba(255,255,255,.4);line-height:1.7;margin-bottom:6px"><strong style="color:rgba(255,255,255,.55)">People involved:</strong><br>' + people.map(p => '&bull; ' + esc(p)).join('<br>') + '</div>' : ''}
      ${t ? `<button class="btn btn-primary btn-sm" style="margin-top:10px;width:100%;justify-content:center" onclick="showView('project-${t.id}')">Open Project</button>` : ''}
    </div>`;
  } else if (node.type === 'person') {
    const pid = node.id;
    const inThemes = [];
    (graphData?.links || []).forEach(l => {
      const src = l.source?.id || l.source;
      const tgt = l.target?.id || l.target;
      if (l.type === 'involves') {
        if (tgt === pid && typeof src === 'string' && src.startsWith('theme-')) {
          const t = STATE.topics.find(x => 'theme-' + x.id === src);
          if (t) inThemes.push(t);
        }
      }
    });
    html = `<div style="background:rgba(0,0,0,.75);padding:14px;border-left:3px solid white">
      <div style="font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:4px">Person</div>
      <div style="font-family:var(--fd);font-size:14px;font-weight:700;color:white;margin-bottom:8px">${esc(node.fullName)}</div>
      ${inThemes.length ? '<div style="font-size:12px;line-height:1.8">' + inThemes.map(t => '<div style="margin-bottom:4px"><span style="display:inline-block;width:8px;height:8px;background:#aed136;margin-right:6px"></span><span style="color:#aed136;cursor:pointer" onclick="showView(\'project-' + t.id + '\')">' + esc(t.name) + '</span></div>').join('') + '</div>' : '<div style="font-size:12px;color:rgba(255,255,255,.35)">No themes linked</div>'}
    </div>`;
  }

  detail.innerHTML = html;
  detail.style.display = html ? 'block' : 'none';

  // Camera centering is handled by highlightConnected()
}
