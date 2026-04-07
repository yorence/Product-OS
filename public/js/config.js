// Config, state, and constants
// ═══════ MERMAID INIT ═══════
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#e8eef4',
    primaryTextColor: '#1d4c7e',
    primaryBorderColor: '#1d4c7e',
    secondaryColor: '#f6faea',
    secondaryTextColor: '#5a7200',
    secondaryBorderColor: '#aed136',
    tertiaryColor: '#f2f2f2',
    tertiaryTextColor: '#3c3c3c',
    tertiaryBorderColor: '#b5b5b5',
    lineColor: '#4a70a0',
    textColor: '#3c3c3c',
    mainBkg: '#e8eef4',
    nodeBorder: '#1d4c7e',
    clusterBkg: '#f9f9f9',
    clusterBorder: '#d1dcea',
    titleColor: '#1d4c7e',
    edgeLabelBackground: '#ffffff',
    fontSize: '14px',
    fontFamily: 'Montserrat, Century Gothic, sans-serif'
  },
  flowchart: { curve: 'basis', padding: 16 },
  securityLevel: 'loose'
});

// ═══════ ENTITY COLOR REGISTRY ═══════
// Ensures the same system/entity always gets the same color across all diagrams
const ENTITY_COLORS = {};
const ENTITY_PALETTE = [
  { bg:'#e8eef4', border:'#1d4c7e', text:'#1d4c7e' },  // blue
  { bg:'#f6faea', border:'#aed136', text:'#5a7200' },  // green
  { bg:'#f2f2f2', border:'#3c3c3c', text:'#3c3c3c' },  // charcoal
  { bg:'#d1dcea', border:'#4a70a0', text:'#1d4c7e' },  // blue-20
  { bg:'#eef5d7', border:'#beda5e', text:'#5a7200' },  // green-20
  { bg:'#deecaf', border:'#aed136', text:'#5a7200' },  // green-40
  { bg:'#a3b8d4', border:'#1d4c7e', text:'#ffffff' },  // blue-40
  { bg:'#7794bc', border:'#1d4c7e', text:'#ffffff' },  // blue-60
];
let entityColorIdx = 0;

function getEntityColor(entityName) {
  const key = entityName.toLowerCase().replace(/[^a-z0-9]/g,'');
  if (!ENTITY_COLORS[key]) {
    ENTITY_COLORS[key] = ENTITY_PALETTE[entityColorIdx % ENTITY_PALETTE.length];
    entityColorIdx++;
  }
  return ENTITY_COLORS[key];
}

// Build a Mermaid style line for a node
function mermaidNodeStyle(nodeId, entityName) {
  const c = getEntityColor(entityName);
  return `style ${nodeId} fill:${c.bg},stroke:${c.border},stroke-width:2px,color:${c.text}`;
}

// ═══════ STATE ═══════
let STATE = {
  apiKey: '',
  perplexityKey: '',
  strategy: '',
  meetings: [],
  topics: [],
  topicsUnlocked: false,
  projectDocs: {},
  currentView: 'meetings',
  isDemo: false
};

// Restore cached project docs
try { const pd = sessionStorage.getItem('project_docs'); if (pd) STATE.projectDocs = JSON.parse(pd); } catch(e) {}

const TOPIC_COLORS = ['#3498db','#e74c3c','#2ecc71','#9b59b6','#e67e22','#1abc9c','#34495e','#f39c12','#d35400','#16a085','#8e44ad','#c0392b','#27ae60','#2980b9','#f1c40f'];

// ═══════ NAME NORMALIZATION ═══════
// Maps variant names, usernames, and device names to canonical proper names.
// Add entries here as new variants appear in Fathom data.
const NAME_ALIASES = {
  'yorence ramiz-velasquez': 'Yorence Ramiz',
  'yorence ramiz':           'Yorence Ramiz',
  'albert primo':            'Albert Primo',
  'primo':                   'Albert Primo',
  'ariel sofi':              'Ariel Sofi',
  'asofi':                   'Ariel Sofi',
  'eileen g. martin':        'Eileen Martin',
  'eileen martin':           'Eileen Martin',
  'gregory spaulding':       'Gregory Spaulding',
  'greg spaulding':          'Gregory Spaulding',
  'adam daube':              'Adam Daube',
  'melissa caban':           'Melissa Caban',
  'anami kumpawat':          'Anami Kumpawat',
  'richard salinas':         'Richard Salinas',
  "richard's iphone":        'Richard Salinas',
  'jason reed':              'Jason Reed',
  'josh gumerove':           'Josh Gumerove',
  'nicholas rivera':         'Nicholas Rivera',
  'lilia restrepo':          'Lilia Restrepo',
  'olga gorokhovskaia':      'Olga Gorokhovskaia',
  'jar.jona':                'Jar Jona',
  'j a r j o n a':           'Jar Jona',
  'juanes':                  'Juanes',
};

// Excluded "names" that are devices/bots, not people
const NAME_EXCLUDE = new Set(["richard's iphone"]);

function normalizeName(rawName) {
  if (!rawName) return null;
  const key = rawName.trim().toLowerCase();
  if (NAME_EXCLUDE.has(key)) return null;
  if (NAME_ALIASES[key]) return NAME_ALIASES[key];

  // Fuzzy: check if any alias key is a substring match
  for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return canonical;
  }

  // Fallback: title-case the raw name
  return rawName.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
