const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon'
};

function serve(port) {
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end('Bad request'); return; }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden'); return;
    }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(err.code === 'ENOENT' ? 404 : 500).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  server.once('error', err => {
    if (err.code === 'EADDRINUSE' && port < 8010) serve(port + 1);
    else { console.error(err.message); process.exitCode = 1; }
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Saúde da Família disponível em http://localhost:${port}/`);
    console.log('Mantenha esta janela aberta. Pressione Ctrl+C para encerrar.');
  });
}

serve(8000);
