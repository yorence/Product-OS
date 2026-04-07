const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.md':   'text/markdown'
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Api-Key, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Proxy Fathom API: /fathom/... -> https://api.fathom.ai/...
  if (req.url.startsWith('/fathom/')) {
    const targetPath = req.url.replace('/fathom', '');
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing X-Api-Key header' }));
      return;
    }

    const proxyReq = https.request({
      hostname: 'api.fathom.ai',
      path: targetPath,
      method: 'GET',
      headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'Access-Control-Allow-Origin': '*'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error: ' + e.message }));
    });

    proxyReq.end();
    return;
  }

  // Serve static files from public/
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, urlPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = (MIME_TYPES[ext] || 'application/octet-stream') + '; charset=utf-8';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Kaufman Rossin — AI & Data Integration Hub');
  console.log('  ──────────────────────────────────────────');
  console.log('');
  console.log('  Server:  http://localhost:' + PORT);
  console.log('  Root:    ' + PUBLIC_DIR);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
