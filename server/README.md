# metroventure-city — free multiplayer server

A Cloudflare Worker with one Durable Object per city. Free tier, no card, no build step
for the game itself. Full reasoning, alternatives and cost maths: [`../MULTIPLAYER.md`](../MULTIPLAYER.md).

## Local

```bash
npm install
npm run dev        # http://127.0.0.1:8787/health, ws://127.0.0.1:8787/ws?room=metro-1
npm test           # protocol tests against the dev server
```

Or run everything (game + server + proxy) from the repo root:

```bash
npm run dev        # http://localhost:8080
```

## Deploy

```bash
npx wrangler login     # one-time
npx wrangler deploy
curl https://metroventure-city.<subdomain>.workers.dev/health
```

Then open the game with:

```
https://easypay-ng.github.io/gta-benz/?server=wss%3A%2F%2Fmetroventure-city.<subdomain>.workers.dev%2Fws%3Froom%3Dmetro-1
```

## Files

| Path | What |
|---|---|
| `src/index.js` | routes `/health` and `/ws` to a room by name |
| `src/city-room.js` | the room: presence, 5 Hz snapshots, culling, rate limits, hibernation |
| `test/smoke.mjs` | 16 tests over raw WebSockets |
| `test/client.mjs` | 17 tests driving the real browser client (`src/net.js`) |
| `wrangler.jsonc` | bindings, SQLite DO migration, optional origin allow-list |

## Free-tier notes

- WebSocket messages are billed at 20:1, so 100k requests/day ≈ 2M inbound messages/day.
- The room uses the Hibernation API and no timers, so idle cities cost nothing.
- Free-plan limits fail closed — they cannot produce a bill.
