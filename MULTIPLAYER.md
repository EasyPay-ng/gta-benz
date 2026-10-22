# Free multiplayer server for MetroVenture 3D

This is the "no credit card, no monthly bill" path to a real server for the game, plus
the working code that goes with it. Everything here runs on **Cloudflare Workers +
Durable Objects**, which is the only free tier currently on the market that is a good
fit for a persistent, real-time game world.

Status: **working locally**. The server is in `server/`, the browser client is
`web-openworld-game/src/net.js`, and two browser tabs can see each other's characters
in the city today. Deployment to your own Cloudflare account is a 10-minute step you
have to do once (it needs your login) — see [Deploy](#4-deploy-10-minutes).

---

## 1. What the free tier actually gives you

| | Free allowance | What it means for this game |
|---|---|---|
| Requests | 100,000 / day | WebSocket messages count at a **20:1 ratio**, so ≈ 2,000,000 inbound messages/day |
| Duration | 13,000 GB-s / day | A busy room (~128 MB) can stay awake ≈ 29 h/day |
| SQL row reads / writes | 5M / 100k per day | Plenty for positions, property keys, saves |
| Storage | 5 GB (SQLite-backed DOs) | Thousands of cities' worth of state |
| Egress | not billed | Snapshots are effectively free to broadcast |

The 20:1 ratio is the important number: at 10 position updates/second a player costs
36,000 messages/hour → **1,800 billable requests/hour**. The daily 100k therefore
covers roughly **55 player-hours/day** (≈110 at 5 Hz). That is a small but genuine
playtest server, every day, for $0.

Two caveats worth knowing before you plan around it:

- **An active Durable Object is billed for wall-clock duration.** Use the WebSocket
  Hibernation API (this repo does) so idle rooms sleep instead of burning the 13,000
  GB-s/day. One city that stays busy 24/7 sits right at the edge; several busy cities
  will not fit on the free plan.
- **Free-plan limits fail closed rather than billing you.** Nobody wakes up to a
  surprise invoice — but if you exceed a limit, operations start returning errors.

Sources: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[limits](https://developers.cloudflare.com/durable-objects/platform/limits/), and the
[WebSocket billing ratio](https://developers.cloudflare.com/durable-objects/release-notes/).

---

## 2. The alternatives, honestly

| Platform | Free offer | Verdict for this game |
|---|---|---|
| **Cloudflare Workers + Durable Objects** | 100k req/day, 13k GB-s/day, 5 GB | ✅ **Chosen.** Only free tier with per-room persistent state, hibernating sockets and alarms. No cold-start disconnect while sockets are open. |
| Supabase Realtime | 200 concurrent connections, **2M messages/month** | ❌ At 10 Hz, 2M messages is ≈ 55 player-hours *per month*, not per day. Fine for presence/chat, hopeless for movement. |
| Render free web service | 750 h/month, but sleeps after 15 min idle | ❌ Sleeping kills every WebSocket; 30–60 s cold start. |
| Fly.io | No free tier for new accounts (2-hour trial) | ❌ Card required. |
| Deno Deploy free | 1M requests/month, 10 CPU-hours | ⚠️ Workable for a prototype, but no room isolation, request-based accounting is hostile to 10 Hz updates. |
| VPS / Raspberry Pi + Cloudflare Tunnel | Your own hardware | 💡 Genuinely free if the box already runs 24/7. A 5 W mini-PC is ~3.6 kWh/month of power; the tunnel is free. Good fallback, bad if power/uptime in Warri is the thing you are trying to avoid. |

PartyKit's hosted platform shuts down on **23 October 2026**, so ignore older tutorials
that say "npx partykit deploy". The same room model now ships as PartyServer on your own
Cloudflare account — which is what this code implements directly, without the dependency.

---

## 3. What is built

```
server/
  wrangler.jsonc          Worker config: one Durable Object class, SQLite backend
  src/index.js            Routes: /health, /ws?room=<name>
  src/city-room.js        One CityRoom per city: join/leave, 5 Hz snapshots, rate limits, room clock
  src/city-clock.js       Authoritative 24× city clock persisted in DO storage (hibernates when empty)
  test/smoke.mjs          24 protocol + room-clock tests (raw WebSockets, no deps)
  test/accounts.mjs       34 account/PIN/token tests
  test/client.mjs         28 NetClient tests (the real browser module, in Node)
web-openworld-game/src/net.js   Browser transport: reconnect, ping, throttled sends, clock interpolation
tools/dev-server.mjs      Static server + /ws proxy + /net.json discovery
tools/dev.mjs             `npm run dev`: game and city server together
```

### Protocol (v1, JSON over WebSocket)

Client → server:

| Message | Payload | Notes |
|---|---|---|
| `register` | `{name, pin}` | creates the account; `name_taken` / `bad_name` / `bad_pin` |
| `login` | `{name, pin}` | `no_account` / `bad_pin` / `locked`; issues a session token |
| `join` | `{token}` or `{guest:true, name}`, plus `app` | must be first; guests skip accounts entirely |
| `logout` | `{}` | revokes the current token |
| `pos` | `{x, z, yaw, mv, veh}` | ≤10/s, validated and clamped server-side |
| `look` | `{app}` | appearance change without reconnecting |
| `chat` | `{m}` | ≤120 chars, broadcast to the room |
| `ping` | `{ts}` | answered with `pong`, drives the RTT readout |

Server → client:

| Message | Payload | Notes |
|---|---|---|
| `auth` | `{ok, name, playerId, token}` / `{ok:false, code}` | identity result |
| `welcome` | `{id, room, tick, peers[], you, restore, clock}` | full peer list, who you are, saved position, authoritative room clock |
| `clock` | `{inGameMs, day, hhmm, speed, now}` | broadcast every 30 real s (+12 in-game min) while ≥1 player is online |
| `join` / `leave` | `{id, name, app, x, z, yaw}` | presence events |
| `snap` | `{now, p: [[id,x,z,yaw,mv,veh], …]}` | full replacement, 5 Hz, distance-culled |
| `chat` | `{id, name, m}` | |
| `pong`, `error` | `{ts}` / `{code}` | `bad_json`, `rate_limited`, `join_first` |

Design choices that keep it free and simple:

- **Interest culling** — a player only receives peers within 160 m, so cost scales with
  what is on screen, not with city population.
- **Per-socket coalescing** — a client sending at 10 Hz is answered at 5 Hz. A one-shot
  alarm flushes the trailing update so the last few metres are never lost.
- **Hibernating 24× city clock** — `RoomClock` stores `{ inGameMs, updatedAt, speed: 24 }`
  in Durable Object storage and shares `CityRoom`'s single DO `alarm()` slot to broadcast
  `clock` every 30 real seconds (+12 in-game minutes) while players are connected. When
  the last WebSocket disconnects, `deleteAlarm()` cancels all wakeups so empty rooms
  hibernate for $0; when the next player joins later, elapsed wall time (`× 24`) is rolled
  forward seamlessly so city time never resets.
- **Hibernation** — `state.acceptWebSocket()`, no `setInterval`. An empty city costs
  nothing; sockets survive the object being evicted from memory.
- **Server-side clamps** — coordinates are clamped to ±400 m, yaw to ±10, messages to
  2 KB, 30 messages/s per socket, then a close. Never trust the client, even before
  there is anything worth cheating for.

---

## 3b. Identity: display names and PINs

Players identify themselves by name, the way you asked. First sign-in creates the
account; a PIN is the only credential. No email, no OAuth, no password reset.

| Rule | Value |
|---|---|
| Name | 3–16 characters: letters, numbers, spaces, `.` `-` `_`; case-insensitive, so `Amara` and `amara` are one account |
| PIN | 4–32 letters/numbers, hashed with PBKDF2-SHA256 (10k iterations — see the CPU note) |
| Session | 24-byte token in `localStorage`, 90-day expiry, up to 5 devices, revoked on sign-out |
| Lockout | 5 wrong PINs → 60 s cool-down for that name |
| Guests | "Play as guest" needs no PIN. Names are not reserved, collisions get a suffix (`Benz 2`), and nothing is saved |
| Reconnect | Same token, same name, and you reappear where you logged off |
| One session | Signing in twice with the same account is refused (`already_online`) |

Why PBKDF2 at 10k iterations rather than 100k: the Workers **free** plan allows about
10 ms of CPU per invocation, and hashing runs inside the request. The rate limiter
(6 auth attempts/s per socket) plus the per-name lockout is what actually protects a
4-digit PIN. If you move to Workers Paid and care, raise `PBKDF2_ITERATIONS` in
`server/src/accounts.js` — existing hashes keep working only if you store the iteration
count, so do it before you have real accounts.

What this does **not** do: anyone who knows your PIN is you, and there is no recovery if
you forget it. That is the deliberate trade for "no email required". When money, vehicle
keys or property transfers matter, replace `accounts.js` with an OAuth provider — the
`playerId` is already the stable join key, so nothing else has to change.

The in-game sign-in card is in `index.html` (`#login`) and wired in `game.js`
(`showLogin`, `startNet`, `AUTH_MESSAGES`). The browser stores only the token under
`metroventure_identity`, never the PIN.

---

## 4. Run it locally

```bash
npm run dev          # http://localhost:8080  — game + city server on one port
```

Then open two browser tabs at <http://localhost:8080>. You should see:

- HUD **Network: Online · N nearby**
- the other player's character with a blue name tag above their head
- a blue dot on the minimap
- the same player as a car if they drive

Single-player is unaffected:

```bash
npm run dev:offline  # no /net.json, so the game never tries to connect
```

Tests (server must be running):

```bash
cd server
npm test                                                    # protocol, raw sockets
SERVER_URL='ws://127.0.0.1:8080/ws?room=test' node test/client.mjs
```

How the game finds the server without a build step: `tools/dev-server.mjs` serves
`/net.json` = `{"url":"/ws?room=metro-1"}`. If that file 404s (as on GitHub Pages), the
game stays single-player. `?server=wss://…` or
`localStorage.metroventure_server` override it.

---

## 5. Deploy (10 minutes)

You need a free Cloudflare account. **No card is required** and the free plan cannot
generate a bill.

```bash
cd server
npm install                 # wrangler (dev dependency only)
npx wrangler login          # opens a browser, one-time
npx wrangler deploy
```

Wrangler prints the URL, something like:

```
https://metroventure-city.<your-subdomain>.workers.dev
```

Check it:

```bash
curl https://metroventure-city.<your-subdomain>.workers.dev/health
# {"ok":true,"service":"metroventure-city",...}
```

Then point the game at it. Either append a query parameter once:

```
https://easypay-ng.github.io/gta-benz/?server=wss%3A%2F%2Fmetroventure-city.<your-subdomain>.workers.dev%2Fws%3Froom%3Dmetro-1
```

(the game stores it in `localStorage`, so you only need it once) or run this in the
browser console:

```js
localStorage.setItem('metroventure_server',
  'wss://metroventure-city.<your-subdomain>.workers.dev/ws?room=metro-1');
location.reload();
```

`?room=` shards the world: `room=metro-1`, `room=metro-2`, … Each room is its own
Durable Object with its own state.

Useful commands afterwards:

```bash
npx wrangler tail        # live logs
npx wrangler deployments list
npx wrangler rollback
```

Optional hardening once you share the link: restrict browser origins in
`wrangler.jsonc`:

```jsonc
"vars": {
  "ALLOWED_ORIGINS": "https://easypay-ng.github.io,http://localhost:8080"
}
```

### A two-minute fix you should do first

The repo currently has two Pages workflows deploying to the same site:
`.github/workflows/pages.yml` (correct: deploys `web-openworld-game/`) and
`.github/workflows/jekyll-gh-pages.yml` (a Jekyll build of the repo root, which has no
`index.html`). Whichever finishes last wins, so the published site can flip between the
game and a Jekyll error page. Delete the Jekyll one before you share a link.

---

## 6. What is *not* multiplayer yet

Being explicit, because the upgrade plan mixes them together:

- **Traffic and the 12 citizens are simulated per client.** Two players in the same
  street see different cars. Making them shared means the server (or a host player) owns
  them — a real design step, not a flag.
- **Economy is not tied to the account.** Names, tokens and last position are per city;
  cash, startups and vehicles are still `localStorage`. Account ownership of those
  arrives with the timing/economy work.
- **Positions are client-authoritative.** Fine for friends; exploitable the moment money
  is involved. Server-side movement validation is a phase-7 job.
- **Economy is not tied to the account yet.** Names, tokens, last position and the shared
  24× city clock (`Day N · HH:MM`) live on the server; cash, startups, vehicles and
  employees still live in `localStorage`. Two players cannot transfer keys or hire each
  other yet, and server-side offline wage accrual waits for server-owned accounts.

---

## 7. When to spend money

Stay free until one of these is true:

1. more than ~1 busy city, or more than ~50 player-hours/day;
2. you need accounts, property ownership and wages that accrue while offline;
3. you need anti-cheat.

Then the path is small: Workers Paid is **$5/month**, which turns 100k requests/day into
1M/month included and 400,000 GB-s/month of duration, and D1/SQLite handles accounts.
Nothing in this code needs to change — it is the same Worker, just not throttled.

---

## 8. Where this fits the bigger plan

| Upgrade-plan item | What the server unlocks | Status / Order |
|---|---|---|
| 11 — real-time clock (1 h = 24 h) | Authoritative `RoomClock` on `CityRoom`; every client sees the same `Day N · HH:MM` and day/night lighting | **done (M1)** |
| 1 — security operatives (AI) | AI guards work single-player now; player-employers need the economy moved server-side | next |
| 5 & 6 — vehicle access + key transfer | Needs `ownerId` on vehicles and an authoritative inventory (accounts exist, inventories don't) | next |
| 10 — real estate | Needs interior property records + ownership | after interiors |
| 2 — emotes visible to nearby players | Trivial: add `emote` to the `pos`/`look` payload | anytime |

Planned extension to this protocol: `emote: "dance" | "wave" | …` on the `pos` message
and a `state` broadcast when the clock object ticks. No breaking change needed.
