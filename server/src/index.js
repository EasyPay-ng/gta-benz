// MetroVenture City server — Cloudflare Worker entry point.
//
// Deliberately tiny: all routing does is map a room name to a Durable Object.
// Everything with state (players, positions, broadcast ticks) lives in CityRoom.
//
//   GET /health          -> liveness + build info (no auth, no cost beyond a request)
//   GET /ws?room=metro-1 -> WebSocket upgrade, handled by that room's Durable Object
//   /api/*               -> global accounts & cloud saves (one AccountHub object)
//   GET /                -> plain-text help

import { webSocketFallback } from './landing.js';

export { CityRoom } from './city-room.js';
export { AccountHub } from './account-hub-do.js';

const DEFAULT_ROOM = 'metro-1';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'metroventure-city', rooms: 'durable-objects', now: Date.now() });
    }

    // Global identity + cloud saves. One object owns every account, so a player
    // keeps their wallet and save no matter which district room they are in.
    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-max-age': '86400',
          },
        });
      }
      const id = env.ACCOUNTS.idFromName('global');
      return env.ACCOUNTS.get(id).fetch(request);
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        // A browser landing here gets a page that explains itself; a tool still
        // gets the machine-readable 426 it was already getting.
        return webSocketFallback(request, url.origin, url.searchParams.get('room') || DEFAULT_ROOM);
      }
      // The room name is the Durable Object name, so the same city always lands
      // on the same object (and therefore the same in-memory player list).
      const room = sanitizeRoom(url.searchParams.get('room') || DEFAULT_ROOM);
      const id = env.CITY_ROOM.idFromName(room);
      const stub = env.CITY_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response(
      'MetroVenture city server\n\n'
      + 'Connect a WebSocket to /ws?room=<room>\n'
      + 'Accounts & cloud saves: /api/*\n'
      + 'Health check: /health\n',
      { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });
}

function sanitizeRoom(name) {
  // Keep room names short, printable and stable so they hash predictably.
  return String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || DEFAULT_ROOM;
}
