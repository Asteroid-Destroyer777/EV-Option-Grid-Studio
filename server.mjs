// Нулевые зависимости: `npm run dev` (или `node server.mjs [порт]`). Сборка не нужна — ES-модули + локальный three.js.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateRequest } from './src/simulation/service.js';
import {loadArea} from './src/district/source.js';
import {calculateDistrict} from './src/district/model.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2]) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

http.createServer(async (req, res) => {
  if(req.url==='/api/district'){
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'){res.writeHead(405);return res.end(JSON.stringify({error:'Используйте POST.'}));}
    try{let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>1500000)throw new Error('Запрос слишком большой.');raw+=chunk;}
      const data=JSON.parse(raw),result=data.action==='load'?await loadArea(data.bounds):calculateDistrict(data.input);
      res.writeHead(200);res.end(JSON.stringify(result));
    }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}return;
  }
  if (req.url === '/api/calculate') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'POST') { res.writeHead(405); return res.end(JSON.stringify({ error: 'Используйте POST.' })); }
    try {
      let raw = '', size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 250000) throw new Error('Запрос слишком большой.'); raw += chunk; }
      const result = calculateRequest(JSON.parse(raw));
      res.writeHead(200); return res.end(JSON.stringify(result));
    } catch (error) { res.writeHead(400); return res.end(JSON.stringify({ error: error.message })); }
  }
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/') || p === '') p = join(p, 'index.html');
    let file = join(root, p);
    if (!file.startsWith(root)) throw new Error('forbidden');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`EV-Option Grid: http://localhost:${port}/`));
