// Нулевые зависимости: `npm run dev` (или `node server.mjs [порт]`). Сборка не нужна — ES-модули + локальный three.js.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateRequest } from './src/simulation/service.js';
import {loadArea} from './src/district/source.js';
import {assistantResponse,limitAssistant} from './src/assistant/service.js';
import {rankDistrict} from './src/district/ranking.js';
import {calculateDistrict} from './src/district/model.js';

try{const env=await readFile(new URL('.env.local',import.meta.url),'utf8');for(const line of env.split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();}}catch{}
const root = fileURLToPath(new URL('.', import.meta.url));
const staticRoot = process.argv.includes('--dist') ? join(root, 'dist/') : root;
const deployment = JSON.parse(await readFile(new URL('vercel.json', import.meta.url), 'utf8'));
const securityHeaders = Object.fromEntries(deployment.headers.find(rule => rule.source === '/(.*)').headers.map(h => [h.key, h.value]));
const port = Number(process.argv[2]) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

http.createServer(async (req, res) => {
  for (const [key, value] of Object.entries(securityHeaders)) res.setHeader(key, value);
  if(req.url==='/api/assistant'){
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'){res.writeHead(405);return res.end(JSON.stringify({error:'Используйте POST.'}));}
    try{if(!String(req.headers['content-type']||'').includes('application/json'))throw new Error('Нужен JSON.');if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw new Error('Недопустимый источник запроса.');limitAssistant(req.socket.remoteAddress||'local');let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>200000)throw new Error('Запрос слишком большой.');raw+=chunk;}const result=await assistantResponse(JSON.parse(raw));res.writeHead(200);res.end(JSON.stringify(result));}catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}return;
  }
  if(req.url==='/api/district'){
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'){res.writeHead(405);return res.end(JSON.stringify({error:'Используйте POST.'}));}
    try{let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>10000000)throw new Error('Запрос слишком большой.');raw+=chunk;}
      const data=JSON.parse(raw),result=data.action==='load'?await loadArea(data.bounds):data.action==='rank'?rankDistrict(data.input,data.options):calculateDistrict(data.input);
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
    if(p.split(/[\\/]/).some(s=>s.startsWith('.'))||/\.(blend|py|log)$/i.test(p))throw new Error('forbidden');
    if (p.endsWith('/') || p === '') p = join(p, 'index.html');
    let file = join(staticRoot, p);
    if (!file.startsWith(staticRoot)) throw new Error('forbidden');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    const cache = !process.argv.includes('--dist') ? 'no-store' : p.startsWith('/build-assets/') ? 'public, max-age=31536000, immutable' : /^\/(assets|data|vendor|fonts)\//.test(p) ? 'public, max-age=3600, must-revalidate' : 'public, max-age=0, must-revalidate';
    res.writeHead(200, { 'Content-Type': file.endsWith('.json.gz')?'application/json':types[extname(file)] || 'application/octet-stream', ...(file.endsWith('.json.gz')?{'Content-Encoding':'gzip'}:/charger-mesh\.bin(?:-[^/]+)?\.br$/.test(file)?{'Content-Encoding':'br'}:{}), 'Cache-Control': cache });
    res.end(data);
  } catch {
    res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
    try { res.end(await readFile(join(staticRoot, '404.html'))); }
    catch { res.end('<!doctype html><html lang="ru"><title>404</title><h1>Страница не найдена</h1><a href="/">На главную</a></html>'); }
  }
}).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`EV-Option Grid: http://localhost:${port}/`));
