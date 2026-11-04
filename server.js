// Запасной сервер для ноутбука преподавателя. Без библиотек: node server.js
// Ученики открывают адрес, который напечатается в консоли (одна Wi-Fi сеть).

import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hub } from './lib/hub.js';
import { freshRoom } from './lib/room.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'public');
const SAVE_FILE = path.join(HERE, '.lesson.json');
const HISTORY_FILE = path.join(HERE, '.history.json');
const PORT = Number(process.env.PORT) || 3000;

// PIN тот же, что и на Cloudflare: берём из wrangler.jsonc.
function configPin() {
  try {
    return readFileSync(path.join(HERE, 'wrangler.jsonc'), 'utf8').match(/"ADMIN_PIN"\s*:\s*"([^"]*)"/)?.[1];
  } catch {}
}
const PIN = process.env.ADMIN_PIN || configPin() || 'geeks';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

let room;
try {
  room = JSON.parse(readFileSync(SAVE_FILE, 'utf8'));
} catch {
  room = freshRoom();
}

let history;
try {
  history = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
} catch {
  history = {};
}

// Пишем на диск не чаще раза в 300 мс.
const timers = {};
const later = (file, data) => {
  clearTimeout(timers[file]);
  timers[file] = setTimeout(() => writeFile(file, JSON.stringify(data())).catch(() => {}), 300);
};

const hub = new Hub(room, {
  pin: PIN,
  store: {
    save: (r) => later(SAVE_FILE, () => r),
    putHistory: (e) => {
      history[e.key] = e;
      later(HISTORY_FILE, () => history);
    },
    deleteHistory: (key) => {
      delete history[key];
      later(HISTORY_FILE, () => history);
    },
    listHistory: () => Object.values(history),
  },
});

function lanUrls() {
  const urls = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}`);
  }
  return urls.length ? urls : [`http://localhost:${PORT}`];
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

async function serveStatic(url, res) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  else if (p === '/admin' || p === '/admin/' || p === '/pult') p = '/admin.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) return sendJson(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Не найдено');
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/stream') {
      const client = {
        role: url.searchParams.get('role') === 'admin' ? 'admin' : 'student',
        id: url.searchParams.get('id'),
        pin: url.searchParams.get('pin'),
        send: (text) => res.write(text),
      };
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' });
      if (!hub.connect(client)) {
        res.end();
        return;
      }
      req.on('close', () => hub.disconnect(client));
      return;
    }

    if (url.pathname === '/api/info') return sendJson(res, 200, { urls: lanUrls() });

    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
      const [status, data] = await hub.handle(url.pathname, await readBody(req));
      return sendJson(res, status, data);
    }

    serveStatic(url, res);
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log('\n  🍔 Игра «Студия фронтенда» запущена!\n');
    console.log('  Ученики открывают:');
    for (const u of lanUrls()) console.log(`    ${u}`);
    console.log(`\n  Пульт преподавателя:  http://localhost:${PORT}/admin   (PIN: ${PIN})\n`);
  });

setInterval(() => hub.ping(), 15000);
