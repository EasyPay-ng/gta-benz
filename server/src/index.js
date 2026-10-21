// MetroVenture City server — Cloudflare Worker entry point.
//
// Deliberately tiny: all routing does is map a room name to a Durable Object.
// Everything with state (players, positions, broadcast ticks) lives in CityRoom.
//
//   GET /health          -> liveness + build info (no auth, no cost beyond a request)
//   GET /ws?room=metro-1 -> WebSocket upgrade, handled by that room's Durable Object
//   GET /                -> plain-text help

export { CityRoom } from './city-room.js';

const DEFAULT_ROOM = 'metro-1';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'metroventure-city', rooms: 'durable-objects', now: Date.now() });
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ error: 'expected a WebSocket upgrade' }, 426);
      }
      // The room name is the Durable Object name, so the same city always lands
      // on the same object (and therefore the same in-memory player list).
      const room = sanitizeRoom(url.searchParams.get('room') || DEFAULT_ROOM);
      const id = env.CITY_ROOM.idFromName(room);
      const stub = env.CITY_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response(
      'MetroVenture city server\n\nConnect a WebSocket to /ws?room=<room>\nHealth check: /health\n',
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
