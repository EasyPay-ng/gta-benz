// CityRoom — one Durable Object per city instance.
//
// Responsibilities for v1 (see MULTIPLAYER.md):
//   * name-based accounts: register/login with a PIN, session tokens, lockout
//     (see accounts.js for the threat model)
//   * relay positions between players, with per-socket throttling and interest culling
//   * keep a little presence state in storage so a reconnect lands where you left
//   * never trust client data: clamp/validate everything that comes off the wire
//
// It uses the WebSocket **Hibernation API** (`state.acceptWebSocket`) and no timers,
// so the object can be evicted from memory while players stay connected. That is the
// trick that keeps a real-time game server inside Cloudflare's free tier: you are not
// billed for duration while the room is idle.

import {
  normalizeName,
  createAccount,
  verifyLogin,
  issueToken,
  resolveToken,
  revokeToken,
  accountCount,
} from './accounts.js';
import { RoomClock } from './city-clock.js';

const MAX_MESSAGE_BYTES = 2048;   // hard cap per inbound frame
const BROADCAST_MS = 200;         // 5 Hz snapshot rate
const ABSENT_AFTER_MS = 10_000;   // stop showing a player who stopped sending
const DROP_AFTER_MS = 60_000;     // close the socket of a player who vanished
const STATE_SAVE_MS = 30_000;     // persist positions at most this often per player
const MSG_BUDGET_PER_SEC = 30;    // per-socket inbound budget
const AUTH_BUDGET_PER_SEC = 6;    // register/login attempts per socket per second
const INTEREST_RADIUS = 160;      // metres; roughly one screen of city
const NAME_MAX = 16;

const blankSession = () => ({
  id: null,
  name: null,
  playerId: null,
  account: null,      // lowercase account name, or null for a guest
  token: null,        // session token this socket joined with (accounts only)
  app: null,
  x: 0,
  z: 0,
  yaw: 0,
  mv: 0,
  veh: null,
  joinedAt: 0,
  lastSeen: 0,
  lastSave: 0,
  lastSnapAt: 0,
  budgetStart: 0,
  budgetUsed: 0,
  authStart: 0,
  authUsed: 0,
  warned: 0,
});

export class CityRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = state.id.name || 'city';
    const tickMs = Number(env?.CLOCK_TICK_MS) || undefined;
    this.clock = new RoomClock(state.storage, { tickMs });
  }

  // ---------------------------------------------------------------------------
  // HTTP / upgrade
  // ---------------------------------------------------------------------------
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    if (this._originBlocked(request.headers.get('Origin'))) {
      return new Response('origin not allowed', { status: 403 });
    }

    const pair = new WebSocketPair();
    const server = pair[1];
    this.state.acceptWebSocket(server); // hibernatable
    server.serializeAttachment(blankSession());

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  _originBlocked(origin) {
    const allowed = (this.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length === 0) return false;      // local dev / open playtest
    if (!origin) return false;                   // non-browser clients (tests, bots)
    return !allowed.includes(origin);
  }

  // ---------------------------------------------------------------------------
  // Hibernation API handlers
  // ---------------------------------------------------------------------------
  async webSocketMessage(ws, raw) {
    const size = typeof raw === 'string' ? raw.length : raw.byteLength || 0;
    if (size > MAX_MESSAGE_BYTES) return ws.close(4009, 'message too large');

    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return this._send(ws, { t: 'error', code: 'bad_json' });
    }
    if (!msg || typeof msg.t !== 'string') return this._send(ws, { t: 'error', code: 'bad_message' });

    const s = ws.deserializeAttachment() || blankSession();
    const now = Date.now();

    // Cheap per-socket rate limit. A client at 10 Hz uses ~10 of 30 credits.
    if (now - s.budgetStart >= 1000) {
      s.budgetStart = now;
      s.budgetUsed = 0;
    }
    s.budgetUsed += 1;
    s.lastSeen = now;
    // NB: deserializeAttachment() hands back a copy, so every mutation that must
    // survive to the next message has to be written back — including these counters.
    ws.serializeAttachment(s);
    if (s.budgetUsed > MSG_BUDGET_PER_SEC) {
      if (++s.warned > 10) return ws.close(4008, 'rate limit');
      return this._send(ws, { t: 'error', code: 'rate_limited' });
    }

    // ---- identity -----------------------------------------------------------
    if (msg.t === 'register' || msg.t === 'login') {
      return this._auth(ws, s, msg, now);
    }
    if (msg.t === 'logout') {
      return this._logout(ws, s);
    }
    if (msg.t === 'join') {
      if (s.id) return; // already joined, ignore duplicates
      return this._join(ws, s, msg, now);
    }

    // ---- gameplay (requires a joined session) -------------------------------
    if (!s.id) return this._send(ws, { t: 'error', code: 'join_first' });

    switch (msg.t) {
      case 'pos': {
        s.x = clampNum(msg.x, -400, 400, s.x);
        s.z = clampNum(msg.z, -400, 400, s.z);
        s.yaw = clampNum(msg.yaw, -10, 10, s.yaw);
        s.mv = msg.mv ? 1 : 0;
        s.veh = typeof msg.veh === 'string' ? msg.veh.slice(0, 16) : null;
        ws.serializeAttachment(s);
        this._maybeBroadcast(now);
        if (now - s.lastSave > STATE_SAVE_MS) {
          s.lastSave = now;
          this._persistPosition(s, ws);
        }
        return;
      }
      case 'ping':
        return this._send(ws, { t: 'pong', ts: msg.ts ?? null, now });
      case 'chat': {
        const text = String(msg.m ?? '').slice(0, 120);
        if (!text) return;
        this._broadcastAll({ t: 'chat', id: s.id, name: s.name, m: text, now });
        return;
      }
      case 'look': {
        if (msg.app && typeof msg.app === 'object') s.app = sanitizeApp(msg.app);
        ws.serializeAttachment(s);
        this._broadcastAll({ t: 'look', id: s.id, app: s.app });
        return;
      }
      default:
        return this._send(ws, { t: 'error', code: 'unknown_type' });
    }
  }

  async webSocketClose(ws, code, reason) {
    await this._leave(ws, code);
  }

  async webSocketError(ws) {
    await this._leave(ws, 1011);
  }

  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  async _auth(ws, s, msg, now) {
    if (now - s.authStart >= 1000) {
      s.authStart = now;
      s.authUsed = 0;
    }
    if (++s.authUsed > AUTH_BUDGET_PER_SEC) {
      return this._send(ws, { t: 'auth', ok: false, code: 'slow_down' });
    }
    ws.serializeAttachment(s);

    const name = normalizeName(msg.name);
    if (!name) return this._send(ws, { t: 'auth', ok: false, code: 'bad_name' });

    const isRegister = msg.t === 'register';
    const result = isRegister
      ? await createAccount(this.state.storage, name, msg.pin, `u_${crypto.randomUUID().slice(0, 8)}`)
      : await verifyLogin(this.state.storage, name, msg.pin);

    if (!result.ok) {
      return this._send(ws, { t: 'auth', ok: false, code: result.code, attemptsLeft: result.attemptsLeft, retryAfter: result.retryAfter });
    }

    const account = result.account;
    const token = await issueToken(this.state.storage, account);

    this._send(ws, {
      t: 'auth',
      ok: true,
      name,
      playerId: account.playerId,
      token,
      created: isRegister,
      accounts: await accountCount(this.state.storage),
    });
  }

  async _logout(ws, s) {
    if (s.playerId) {
      const token = s.token;
      const acc = s.account ? await this.state.storage.get(`account:${s.account}`) : null;
      await revokeToken(this.state.storage, token, acc);
    }
    this._send(ws, { t: 'auth', ok: true, loggedOut: true });
  }

  // ---------------------------------------------------------------------------
  // Join / leave
  // ---------------------------------------------------------------------------
  async _join(ws, s, msg, now) {
    let account = null;
    let token = null;

    if (typeof msg.token === 'string') {
      const res = await resolveToken(this.state.storage, msg.token);
      if (!res.ok) return this._send(ws, { t: 'error', code: 'unknown_token' });
      account = res.account;
      token = msg.token;
    }

    if (account) {
      const clash = this._sessionByName(account.nameLower, ws);
      if (clash) return this._send(ws, { t: 'error', code: 'already_online' });
      s.name = account.name;
      s.playerId = account.playerId;
      s.account = account.nameLower;
      s.token = token;
    } else {
      // Guests: no persistence, no reserved name. Colliding display names get a suffix
      // so two people called "Benz" are never ambiguous on screen.
      const base = (normalizeName(msg.name) || 'Guest').slice(0, NAME_MAX);
      s.name = this._uniqueGuestName(base);
      s.playerId = `g_${crypto.randomUUID().slice(0, 8)}`;
      s.account = null;
      s.token = null;
    }

    s.id = `p_${crypto.randomUUID().slice(0, 8)}`;
    s.app = sanitizeApp(msg.app);
    s.joinedAt = now;
    s.lastSeen = now;
    s.lastSave = now;
    s.x = clampNum(msg.x, -400, 400, 0);
    s.z = clampNum(msg.z, -400, 400, 0);
    s.yaw = clampNum(msg.yaw, -10, 10, 0);

    // Returning players resume where they logged off.
    let restore = null;
    if (account) {
      const saved = await this.state.storage.get(`pos:${account.nameLower}`);
      if (saved && Number.isFinite(saved.x)) {
        s.x = clampNum(saved.x, -400, 400, 0);
        s.z = clampNum(saved.z, -400, 400, 0);
        restore = { x: s.x, z: s.z, yaw: clampNum(saved.yaw, -10, 10, 0) };
      }
    }

    ws.serializeAttachment(s);

    const peers = this._sessions()
      .filter((o) => o.ws !== ws && o.s.id && now - o.s.lastSeen < DROP_AFTER_MS)
      .map(({ s: o }) => ({ id: o.id, name: o.name, app: o.app, x: o.x, z: o.z, yaw: o.yaw, veh: o.veh, account: !!o.account }));

    const { clock, nextTickAt } = await this.clock.onJoin(now, peers.length === 0);

    this._send(ws, {
      t: 'welcome',
      id: s.id,
      room: this.room,
      tick: BROADCAST_MS,
      clock,
      peers,
      you: { id: s.id, name: s.name, playerId: s.playerId, account: !!s.account },
      restore,
      now,
    });
    this._scheduleFlush(nextTickAt);

    this._broadcastAll(
      { t: 'join', id: s.id, name: s.name, app: s.app, x: s.x, z: s.z, yaw: s.yaw, veh: s.veh, account: !!s.account },
      ws,
    );

    // Send the newcomer a picture of the room immediately instead of waiting a tick.
    this._sendSnapshot(ws, s, now);
  }

  async _leave(ws, code) {
    const s = ws.deserializeAttachment();
    if (!s?.id) return;
    const leftId = s.id;
    s.id = null;
    try { ws.serializeAttachment(s); } catch { /* closing */ }
    if (s.account) await this._persistPosition(s, ws);
    this._broadcastAll({ t: 'leave', id: leftId, code }, ws);

    const remaining = this._sessions().filter((o) => o.ws !== ws && o.s.id);
    if (remaining.length === 0) {
      await this.clock.onEmpty(Date.now());
      try { await this.state.storage.deleteAlarm(); } catch { /* none set */ }
    }
  }

  _persistPosition(s, ws) {
    if (!s.account) return Promise.resolve();
    return this.state.storage.put(`pos:${s.account}`, {
      x: round(s.x, 1),
      z: round(s.z, 1),
      yaw: round(s.yaw, 2),
      veh: s.veh,
      at: Date.now(),
    });
  }

  _sessionByName(nameLower, exceptWs) {
    for (const { ws, s } of this._sessions()) {
      if (ws !== exceptWs && s.account === nameLower && s.id) return s;
    }
    return null;
  }

  _uniqueGuestName(base) {
    const taken = new Set(this._sessions().map(({ s }) => (s.name || '').toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base.slice(0, NAME_MAX - 3)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base.slice(0, NAME_MAX - 6)} ${Math.floor(Math.random() * 999)}`;
  }

  // ---------------------------------------------------------------------------
  // Broadcasting
  // ---------------------------------------------------------------------------
  // Coalesced per-socket broadcast: a player who sends at 10 Hz is answered at
  // 5 Hz, and a burst of movement can never fan out more than one frame per socket.
  // If a socket isn't due yet we set a single alarm to catch the trailing update —
  // otherwise the last few metres of movement before a player stops would be lost.
  _maybeBroadcast(now) {
    const nextDue = this._flushSnapshots(now);
    if (Number.isFinite(nextDue)) this._scheduleFlush(nextDue);
    return nextDue;
  }

  _flushSnapshots(now) {
    let nextDue = Infinity;
    for (const { ws, s } of this._sessions()) {
      if (!s.id) continue;
      if (now - s.lastSeen > DROP_AFTER_MS) {
        ws.close(4001, 'timeout');
        continue;
      }
      const due = s.lastSnapAt + BROADCAST_MS;
      if (now >= due) this._sendSnapshot(ws, s, now);
      else nextDue = Math.min(nextDue, due);
    }
    return nextDue;
  }

  _scheduleFlush(at) {
    this.state.storage
      .getAlarm()
      .then((existing) => {
        if (existing === null || existing > at) return this.state.storage.setAlarm(at);
        return null;
      })
      .catch(() => {});
  }

  // Fires the deferred trailing snapshot and/or 30s city clock tick, then hibernates
  // between ticks (or stops completely when no joined players remain).
  async alarm() {
    const now = Date.now();
    const joined = this._sessions().filter((o) => o.s.id);
    if (joined.length === 0) {
      await this.clock.onEmpty(now);
      return;
    }
    const nextSnapDue = this._flushSnapshots(now);
    const nextClockDue = await this.clock.maybeTick(now, (msg) => this._broadcastJoined(msg));
    const nextAlarm = Math.min(nextSnapDue, nextClockDue);
    if (Number.isFinite(nextAlarm)) {
      try { await this.state.storage.setAlarm(nextAlarm); } catch { /* ignore */ }
    }
  }

  _broadcastJoined(msg) {
    const text = JSON.stringify(msg);
    for (const { ws, s } of this._sessions()) {
      if (!s.id) continue;
      try { ws.send(text); } catch { /* closing */ }
    }
  }

  _sendSnapshot(ws, me, now) {
    me.lastSnapAt = now;
    ws.serializeAttachment(me);
    const p = [];
    for (const { s } of this._sessions()) {
      if (!s.id || s.id === me.id) continue;
      if (now - s.lastSeen > ABSENT_AFTER_MS) continue;          // ghost: gone quiet
      if (Math.hypot(s.x - me.x, s.z - me.z) > INTEREST_RADIUS) continue; // culled
      p.push([s.id, round(s.x), round(s.z), round(s.yaw, 2), s.mv, s.veh]);
    }
    this._send(ws, { t: 'snap', now, p });
  }

  _sessions() {
    return this.state.getWebSockets().map((ws) => ({ ws, s: ws.deserializeAttachment() || blankSession() }));
  }

  _broadcastAll(msg, except) {
    const text = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch {
        // socket already closing; the close handler will clean up
      }
    }
  }

  _send(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closed */
    }
  }
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------
function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function round(v, dp = 1) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

const APP_KEYS = ['skin', 'shirt', 'pants', 'hair', 'hairStyle', 'build'];

function sanitizeApp(app) {
  const out = {};
  if (!app || typeof app !== 'object') return null;
  for (const k of APP_KEYS) {
    const v = app[k];
    if (typeof v === 'string' && v.length <= 32) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
