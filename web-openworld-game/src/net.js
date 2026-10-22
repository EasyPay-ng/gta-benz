// MetroVenture 3D — multiplayer transport (browser side).
//
// Talks to the city server in ../server (a Cloudflare Durable Object). The client is
// intentionally dumb: it sends its own position at 10 Hz and plays back whatever
// snapshots arrive. No prediction, no rollback, no authority — see MULTIPLAYER.md
// for why that is the right v1 and what changes in later phases.
//
// Identity: a display name + PIN, held by the server. The client never stores the
// PIN — only a session token (see game.js). Guests can play without one.
//
// The module has no Three.js dependency so it can be exercised in Node too.

export const PROTOCOL_VERSION = 2;

const SEND_HZ = 10;            // outbound position rate
const KEEPALIVE_MS = 1000;     // resend even when standing still
const PING_MS = 5000;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

// Statuses surfaced to the UI:
//   idle | connecting | auth_required | authenticating | online | reconnecting | offline
export class NetClient {
  /**
   * @param {object} opts
   * @param {string} opts.url        ws:// or wss:// endpoint (…/ws?room=metro-1)
   * @param {object} [opts.identity] {mode:'token'|'guest'|'credential', name, pin, token}
   * @param {object} opts.appearance character creator colours
   * @param {object} [opts.handlers] {onStatus, onWelcome, onJoin, onLeave, onSnapshot,
   *                                  onChat, onAuth, onAuthError, onAuthRequired, onToken}
   */
  constructor({ url, identity = null, appearance, handlers = {} }) {
    // Accept http(s) URLs too, so a server can just be configured as a path.
    this.url = String(url).replace(/^http(s?):/i, 'ws$1:');
    this.identity = identity;
    this.appearance = appearance || null;
    this.handlers = handlers;

    this.id = null;          // room presence id (per connection)
    this.playerId = null;    // stable account id
    this.name = null;        // display name as awarded by the server
    this.account = false;    // signed in vs guest
    this.token = identity?.token || null;
    this.restore = null;     // saved position handed back on login

    this.status = 'idle';
    this.rtt = null;
    this.serverClock = null; // { inGameBase, perfBase, speed, day, hhmm } from server
    this.peers = new Map(); // id -> { id, name, app, x, z, yaw, mv, veh, visible, tx, tz, tyaw }
    this.chat = [];         // last few messages, for the UI

    this.ws = null;
    this.closedByUs = false;
    this.attempt = 0;
    this.reconnectAt = 0;
    this.nextSend = 0;
    this.nextPing = 0;
    this.lastSent = null;
    this.sendCount = 0;
    this.recvCount = 0;
    this.fatal = null;
  }

  get connected() { return this.status === 'online'; }

  connect() {
    // A socket we already asked to close is dead weight; replace it.
    if (this.ws && this.ws.readyState <= 1) return;
    this.ws = null;
    this.fatal = null;
    this._setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this._fail(err);
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.attempt = 0;
      this._enterRoom();
    });

    ws.addEventListener('message', (ev) => {
      this.recvCount++;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this._handle(msg);
    });

    ws.addEventListener('close', () => {
      if (this.ws !== ws) return; // superseded by a newer socket
      this.ws = null;
      this.id = null;
      for (const p of this.peers.values()) this.handlers.onLeave?.(p.id);
      this.peers.clear();
      if (this.closedByUs) {
        this._setStatus('offline');
        return;
      }
      if (this.fatal) {
        this._setStatus('offline');
        return;
      }
      if (this.status === 'auth_required') {
        this._setStatus('auth_required');
        this.handlers.onAuthRequired?.();
        return;
      }
      this._setStatus('reconnecting');
      const wait = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
      this.attempt++;
      this.reconnectAt = performance.now() + wait;
    });

    ws.addEventListener('error', () => {
      // 'close' follows and owns the retry logic.
    });
  }

  // Join with whatever identity we were given; ask the UI if we have none.
  _enterRoom() {
    const id = this.identity;
    if ((id?.mode === 'credential' || id?.mode === 'register') && id.name && id.pin) {
      this._setStatus('authenticating');
      this._send({ t: id.mode === 'register' ? 'register' : 'login', v: PROTOCOL_VERSION, name: id.name, pin: id.pin });
      return;
    }
    if (this.token) {
      this._send({ t: 'join', v: PROTOCOL_VERSION, token: this.token, app: this.appearance });
      return;
    }
    if (id?.mode === 'guest') {
      this._send({ t: 'join', v: PROTOCOL_VERSION, guest: true, name: id.name || 'Guest', app: this.appearance });
      return;
    }
    // No identity yet: let the game show the sign-in card.
    this._setStatus('auth_required');
    this.handlers.onAuthRequired?.();
  }

  // Switching identity mid-session (guest → account, or another account) needs a
  // clean socket, because the room ties presence to the session that joined it.
  _resetSocket() {
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try { old.close(1000, 'switch'); } catch { /* already closed */ }
    }
    this.id = null;
    for (const p of this.peers.values()) this.handlers.onLeave?.(p.id);
    this.peers.clear();
    this.attempt = 0;
    this.reconnectAt = 0;
    this.closedByUs = false;
  }

  /** Sign in; creates the account if the name is free (one-button first-run). */
  signIn(name, pin) {
    this.identity = { mode: 'credential', name, pin };
    this.token = null;
    if (this.id) { this._resetSocket(); this.connect(); return; }
    if (this.ws?.readyState === 1) {
      this._setStatus('authenticating');
      this._send({ t: 'login', v: PROTOCOL_VERSION, name, pin });
    } else {
      this.closedByUs = false;
      this.connect();
    }
  }

  /** Create an account explicitly (used when the user picks "Create account"). */
  register(name, pin) {
    this.identity = { mode: 'register', name, pin };
    this.token = null;
    if (this.id) { this._resetSocket(); this.connect(); return; }
    if (this.ws?.readyState === 1) {
      this._setStatus('authenticating');
      this._send({ t: 'register', v: PROTOCOL_VERSION, name, pin });
    } else {
      this.closedByUs = false;
      this.connect();
    }
  }

  /** Continue without an account: playable, but no reserved name and no saved spot. */
  playAsGuest(name = 'Guest') {
    this.identity = { mode: 'guest', name };
    this.token = null;
    this.closedByUs = false;
    if (this.id) { this._resetSocket(); this.connect(); return; }
    if (this.ws?.readyState === 1) {
      this._send({ t: 'join', v: PROTOCOL_VERSION, guest: true, name, app: this.appearance });
    } else {
      this.connect();
    }
  }

  /** Revoke the session token on the server and forget it locally. */
  signOut(forgetOnly = false) {
    if (!forgetOnly && this.ws?.readyState === 1) this._send({ t: 'logout' });
    this.token = null;
    this.identity = null;
    this.name = null;
    this.playerId = null;
    this.account = false;
    this.closedByUs = true;
    try { this.ws?.close(1000, 'signout'); } catch { /* already closed */ }
    this.ws = null;
    this._setStatus('offline');
  }

  disconnect() {
    this.closedByUs = true;
    try { this.ws?.close(1000, 'bye'); } catch { /* already closed */ }
    this.ws = null;
    this._setStatus('offline');
  }

  /**
   * Called once per frame by the game loop. Handles reconnects and throttled sends.
   * @param {number} dt seconds
   * @param {{x:number,z:number,yaw:number,moving:boolean,vehicle:string|null}} local
   */
  update(dt, local) {
    const now = performance.now();

    if (!this.ws) {
      if (!this.closedByUs && this.reconnectAt && now >= this.reconnectAt) {
        this.reconnectAt = 0;
        this.connect();
      }
      return;
    }
    if (!this.id || this.status !== 'online' || !local) return;

    if (now >= this.nextPing) {
      this.nextPing = now + PING_MS;
      this._send({ t: 'ping', ts: Math.round(now) });
    }

    if (now < this.nextSend) return;
    const veh = local.vehicle || null;
    const moved = !this.lastSent
      || Math.abs(local.x - this.lastSent.x) > 0.05
      || Math.abs(local.z - this.lastSent.z) > 0.05
      || Math.abs(local.yaw - this.lastSent.yaw) > 0.02
      || veh !== this.lastSent.vehicle;

    if (!moved && now - this.lastSent.at < KEEPALIVE_MS) return;

    this.nextSend = now + 1000 / SEND_HZ;
    this.lastSent = { x: local.x, z: local.z, yaw: local.yaw, vehicle: veh, at: now };
    this._send({
      t: 'pos',
      x: round(local.x, 2),
      z: round(local.z, 2),
      yaw: round(local.yaw, 3),
      mv: local.moving ? 1 : 0,
      veh,
    });
  }

  setAppearance(appearance) {
    this.appearance = appearance;
    if (this.connected) this._send({ t: 'look', app: appearance });
  }

  say(text) {
    if (!this.connected || !text) return;
    this._send({ t: 'chat', m: String(text).slice(0, 120) });
  }

  /** Peers currently close enough to be rendered. */
  visiblePeers() {
    return [...this.peers.values()].filter((p) => p.visible);
  }

  /** Current authoritative server in-game clock (ms), or null when disconnected. */
  clockNow() {
    if (!this.connected || !this.serverClock) return null;
    const elapsed = Math.max(0, performance.now() - this.serverClock.perfBase);
    return this.serverClock.inGameBase + elapsed * this.serverClock.speed;
  }

  _syncClock(c) {
    if (!c || !Number.isFinite(c.inGameMs)) return;
    this.serverClock = {
      inGameBase: c.inGameMs,
      perfBase: performance.now(),
      speed: Number.isFinite(c.speed) && c.speed > 0 ? c.speed : 24,
      day: c.day ?? null,
      hhmm: c.hhmm ?? null,
    };
    this.handlers.onClock?.(this.clockNow(), c);
  }

  // ---------------------------------------------------------------------------
  _handle(msg) {
    switch (msg.t) {
      case 'auth': {
        if (!msg.ok) {
          if (msg.code === 'no_account' && this.identity?.mode === 'credential') {
            // First run: the name is free, so create it with the same PIN.
            this._send({ t: 'register', v: PROTOCOL_VERSION, name: this.identity.name, pin: this.identity.pin });
            return;
          }
          this._setStatus('auth_required');
          this.handlers.onAuthError?.(msg.code, msg);
          return;
        }
        if (msg.loggedOut) {
          this.handlers.onAuthError?.('logged_out', msg);
          return;
        }
        this.token = msg.token;
        this.playerId = msg.playerId;
        this.name = msg.name;
        this.account = true;
        this.identity = { mode: 'token', token: msg.token, name: msg.name };
        this._setStatus('connecting');
        this._send({ t: 'join', v: PROTOCOL_VERSION, token: msg.token, app: this.appearance });
        this.handlers.onAuth?.({ name: msg.name, playerId: msg.playerId, token: msg.token, created: msg.created });
        return;
      }
      case 'welcome': {
        this.id = msg.id;
        this.peers.clear();
        for (const p of msg.peers || []) this.peers.set(p.id, this._peer(p));
        this.name = msg.you?.name || this.name;
        this.account = !!msg.you?.account;
        this.playerId = msg.you?.playerId || this.playerId;
        this.restore = msg.restore || null;
        this._setStatus('online');
        if (msg.clock) this._syncClock(msg.clock);
        this.nextSend = 0;
        this.nextPing = performance.now(); // measure RTT straight after the handshake
        this.handlers.onWelcome?.(msg);
        break;
      }
      case 'clock': {
        this._syncClock(msg);
        break;
      }
      case 'join': {
        const p = this._peer({ id: msg.id, name: msg.name, app: msg.app, x: msg.x, z: msg.z, yaw: msg.yaw, veh: msg.veh, account: msg.account });
        p.visible = true;
        this.peers.set(msg.id, p);
        this.handlers.onJoin?.(p);
        break;
      }
      case 'leave': {
        this.peers.delete(msg.id);
        this.handlers.onLeave?.(msg.id);
        break;
      }
      case 'snap': {
        const seen = new Set();
        for (const row of msg.p || []) {
          const [id, x, z, yaw, mv, veh] = row;
          let p = this.peers.get(id);
          if (!p) { p = this._peer({ id }); this.peers.set(id, p); this.handlers.onJoin?.(p); }
          p.tx = x; p.tz = z; p.tyaw = yaw; p.mv = mv; p.veh = veh;
          if (!p.visible) { p.x = x; p.z = z; p.yaw = yaw; p.visible = true; }
          seen.add(id);
        }
        for (const p of this.peers.values()) if (!seen.has(p.id)) p.visible = false;
        this.handlers.onSnapshot?.(this.visiblePeers(), msg.now);
        break;
      }
      case 'look': {
        const p = this.peers.get(msg.id);
        if (p) { p.app = msg.app; this.handlers.onJoin?.(p); }
        break;
      }
      case 'chat': {
        this.chat.push({ id: msg.id, name: msg.name, m: msg.m, at: msg.now });
        if (this.chat.length > 50) this.chat.shift();
        this.handlers.onChat?.(msg);
        break;
      }
      case 'pong': {
        if (typeof msg.ts === 'number') this.rtt = Math.max(0, Math.round(performance.now() - msg.ts));
        break;
      }
      case 'error': {
        switch (msg.code) {
          case 'unknown_token': {
            // Token expired or was revoked: drop it and ask who you are.
            this.token = null;
            this.identity = null;
            this._setStatus('auth_required');
            this.handlers.onAuthError?.('session_expired', msg);
            this.handlers.onAuthRequired?.();
            return;
          }
          case 'already_online':
          case 'bad_name': {
            this.fatal = msg.code;
            const old = this.ws;
            this.ws = null;
            try { old?.close(4003, msg.code); } catch { /* closed */ }
            this._setStatus('offline');
            this.handlers.onAuthError?.(msg.code, msg);
            return;
          }
          default:
            this.handlers.onError?.(msg);
        }
        break;
      }
      default:
        break;
    }
  }

  _peer(data) {
    return {
      id: data.id,
      name: data.name || 'Citizen',
      app: data.app || null,
      account: !!data.account,
      x: data.x || 0,
      z: data.z || 0,
      yaw: data.yaw || 0,
      mv: 0,
      veh: data.veh || null,
      visible: false,
      tx: data.x || 0,
      tz: data.z || 0,
      tyaw: data.yaw || 0,
    };
  }

  _send(obj) {
    if (this.ws?.readyState !== 1) return false;
    try {
      this.ws.send(JSON.stringify(obj));
      this.sendCount++;
      return true;
    } catch {
      return false;
    }
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.handlers.onStatus?.(status);
  }

  _fail(err) {
    this._setStatus('offline');
    this.handlers.onError?.({ t: 'error', code: 'connect_failed', msg: String(err) });
  }
}

function round(v, dp = 2) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------------------
// Helper for the static game: figure out whether/where to connect.
//   ?server=wss://metroventure-city.you.workers.dev/ws?room=metro-1
//   localStorage.metroventure_server = "wss://…"  (sticky across reloads)
//   ?offline=1                                     (force single-player)
// ---------------------------------------------------------------------------
export async function discoverServerUrl(href = location.href, storage = globalThis.localStorage, fetchImpl = globalThis.fetch) {
  const params = new URL(href).searchParams;
  if (params.get('offline') === '1') return null;

  const explicit = resolveServerUrl(href, storage);
  if (explicit) return explicit;

  // A dev server (tools/dev-server.mjs) or a deployment can advertise the city
  // server in /net.json. GitHub Pages has no such file, so the game stays
  // single-player there unless you pass ?server=.
  try {
    const res = await fetchImpl(new URL('/net.json', href), { cache: 'no-store' });
    if (!res.ok) return null;
    const cfg = await res.json();
    return cfg?.url ? new URL(cfg.url, href).toString() : null;
  } catch {
    return null;
  }
}

export function resolveServerUrl(href = location.href, storage = globalThis.localStorage) {
  const params = new URL(href).searchParams;
  if (params.get('offline') === '1') return null;
  const fromQuery = params.get('server');
  if (fromQuery) {
    try { storage?.setItem('metroventure_server', fromQuery); } catch { /* private mode */ }
    return fromQuery;
  }
  try { return storage?.getItem('metroventure_server') || null; } catch { return null; }
}
