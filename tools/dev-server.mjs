#!/usr/bin/env node
// Local dev server for MetroVenture 3D.
//
// Serves web-openworld-game/ as static files AND proxies /ws to the city server
// (wrangler dev on :8787), so the whole game + multiplayer runs on one port:
//
//   npm run dev          -> http://localhost:8080  (game, multiplayer enabled)
//   npm run dev:offline  -> http://localhost:8080  (no /net.json, single-player)
//
// Zero dependencies on purpose: the project has no build step and this keeps it
// that way.

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web-openworld-game');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const WS_HOST = process.env.WS_HOST || '127.0.0.1';
const WS_PORT = Number(process.env.WS_PORT || 8787);
const ROOM = process.env.ROOM || 'metro-1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

// Is the city server actually listening? Without this the page would advertise a
// server that is not there, connect, fail, and loop on "Connecting…" forever.
// Cached briefly so a health probe on every page load stays cheap.
let upstreamAlive = false;
let upstreamCheckedAt = 0;
function probeUpstream() {
  return new Promise((resolve) => {
    const now = Date.now();
    if (now - upstreamCheckedAt < 1000) return resolve(upstreamAlive);
    const sock = net.connect(WS_PORT, WS_HOST);
    const done = (alive) => {
      sock.destroy();
      upstreamAlive = alive;
      upstreamCheckedAt = Date.now();
      resolve(alive);
    };
    sock.setTimeout(700);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Presence of this file is how the game decides to go online — so only report a
  // server that is really there. Otherwise the player gets the offline gate, which
  // tells them what is wrong, instead of a socket that never opens.
  if (url.pathname === '/net.json') {
    if (process.env.OFFLINE === '1') { res.writeHead(404).end('offline'); return; }
    if (!(await probeUpstream())) {
      res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error: 'city server not running', hint: 'npm --prefix server run dev' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ url: `/ws?room=${ROOM}` }));
    return;
  }

  // Accounts & cloud saves live in the Worker; proxy them so the page can call
  // them same-origin (no CORS surprises, one port for everything).
  if (url.pathname.startsWith('/api/')) {
    if (process.env.OFFLINE === '1') {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, code: 'offline', message: 'Cloud saves are off in offline mode.' }));
      return;
    }
    const upstream = http.request({
      host: WS_HOST,
      port: WS_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${WS_HOST}:${WS_PORT}` },
    }, (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    });
    upstream.on('error', () => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, code: 'network', message: 'The city server is not running.' }));
    });
    req.pipe(upstream);
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB)) { res.writeHead(403).end('forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  });
});

// Raw TCP relay for WebSocket upgrades: no `ws` dependency needed.
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
  const upstream = net.connect(WS_PORT, WS_HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries(req.headers)) lines.push(`${k}: ${v}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const kill = () => { socket.destroy(); upstream.destroy(); };
  upstream.on('error', kill);
  socket.on('error', kill);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  MetroVenture 3D     http://localhost:${PORT}`);
  console.log(`  WebSocket proxy     ws://localhost:${PORT}/ws?room=${ROOM}`);
  console.log(`  Accounts & saves    http://localhost:${PORT}/api/*`);
  console.log(`  Upstream city server ${WS_HOST}:${WS_PORT} (start it with: npm --prefix server run dev)\n`);
});
