import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
process.loadEnvFile && await import('node:fs').then(({ existsSync }) => { if (existsSync('.env')) process.loadEnvFile('.env'); });
const handlers = { '/api/auth': (await import('./api/auth.js')).default, '/api/data': (await import('./api/data.js')).default };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (handlers[url.pathname]) return await handlers[url.pathname](req, res);
    const file = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if (!['/index.html', '/src/app.js', '/src/ledger.js', '/src/session.js', '/src/style.css', '/src/favicon.svg'].includes(file)) { res.writeHead(404).end(); return; }
    const content = await readFile(path.join(root, file));
    res.setHeader('Content-Type', file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
    res.end(content);
  } catch { res.writeHead(500).end('Não foi possível carregar o painel.'); }
}).listen(3000, '127.0.0.1', () => console.log('Painel: http://localhost:3000'));
