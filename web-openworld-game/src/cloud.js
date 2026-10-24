// Cloud accounts & saves — the browser half of the AccountHub.
//
// The world is going online-only, so `localStorage` stops being the source of
// truth: the server owns your account, your wallet and your save. This module
// is the thin, testable client for that API:
//
//   register / login / logout   → a bearer token
//   loadSave / save / deleteSave→ the cloud save, with revision checks
//
// Everything here is injectable (`fetchImpl`, `token`) and free of DOM access,
// so `tests/cloud.test.mjs` drives it against a fake fetch with no network.

/**
 * Turn a city-server WebSocket URL into the HTTP origin the REST API lives on.
 *   ws://127.0.0.1:8787/ws?room=metro-1  →  http://127.0.0.1:8787
 *   wss://city.example.com/ws            →  https://city.example.com
 */
export function httpOrigin(serverUrl) {
  if (!serverUrl) return null;
  try {
    const url = new URL(serverUrl, 'http://localhost');
    url.protocol = url.protocol === 'wss:' || url.protocol === 'https:' ? 'https:' : 'http:';
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

const ERROR_MESSAGES = {
  no_token: 'Sign in to use cloud saves.',
  unknown_token: 'That session expired — sign in again.',
  bad_name: 'Names are 3–16 characters: letters, numbers, spaces, dots, dashes or underscores.',
  bad_pin: 'PINs are 4–32 letters or numbers.',
  name_taken: 'That name is already taken.',
  no_account: 'No account with that name yet — register instead.',
  locked: 'Too many wrong PINs. Wait a minute and try again.',
  bad_save: 'That save looked corrupted and was not uploaded.',
  save_too_new: 'Your save is newer than the server understands.',
  bad_cash: 'That save had an impossible cash value.',
  too_large: 'That save is too large for the cloud.',
  revision_conflict: 'Your save changed on another device — syncing again.',
  not_found: 'The server does not have that endpoint.',
  network: 'Could not reach the city server.',
  quota: 'The free daily server quota is used up until 00:00 UTC.',
  offline: 'You are offline — this save is only on this device.',
};

/** Map an HTTP failure onto a stable code the UI can act on. */
export function mapCloudError(status, body) {
  const code = body?.code || (status === 401 ? 'no_token' : status === 429 ? 'quota' : status >= 500 ? 'network' : 'unknown');
  return {
    code,
    status,
    message: body?.message || ERROR_MESSAGES[code] || `Server error (${status}).`,
    quota: code === 'quota' || status === 429,
    retryAfter: body?.retryAfter || 0,
    attemptsLeft: body?.attemptsLeft,
  };
}

export function cloudMessageFor(code) {
  return ERROR_MESSAGES[code] || 'Something went wrong.';
}

export class CloudClient {
  constructor({ serverUrl, fetchImpl = globalThis.fetch, token = null, timeoutMs = 12_000 } = {}) {
    this.origin = httpOrigin(serverUrl);
    this.fetch = fetchImpl;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  get available() {
    return !!this.origin && typeof this.fetch === 'function';
  }

  async request(path, { method = 'GET', body = null, auth = true, keepalive = false } = {}) {
    if (!this.available) return { ok: false, error: { code: 'offline', message: ERROR_MESSAGES.offline, quota: false } };
    const headers = { accept: 'application/json' };
    if (body !== null) headers['content-type'] = 'application/json';
    if (auth && this.token) headers.authorization = `Bearer ${this.token}`;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      const res = await this.fetch(`${this.origin}${path}`, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        signal: controller?.signal,
        keepalive,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) {
        return { ok: false, status: res.status, error: mapCloudError(res.status, json) };
      }
      return { ok: true, status: res.status, body: json };
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      return {
        ok: false,
        status: 0,
        error: { code: aborted ? 'network' : 'offline', message: ERROR_MESSAGES[aborted ? 'network' : 'offline'], quota: false },
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async register(name, pin) {
    const res = await this.request('/api/register', { method: 'POST', body: { name, pin }, auth: false });
    if (res.ok && res.body?.token) this.token = res.body.token;
    return res;
  }

  async login(name, pin) {
    const res = await this.request('/api/login', { method: 'POST', body: { name, pin }, auth: false });
    if (res.ok && res.body?.token) this.token = res.body.token;
    return res;
  }

  async logout() {
    const res = await this.request('/api/logout', { method: 'POST', body: {} });
    this.token = null;
    return res;
  }

  async me() {
    return this.request('/api/me');
  }

  /** @returns {{ok:true, save:object|null, meta:object|null}|{ok:false, error:object}} */
  async loadSave() {
    return this.request('/api/save');
  }

  /**
   * Upload a save. `baseRevision` makes this safe against a second device:
   * the server answers 409 instead of overwriting newer progress.
   */
  async save(save, { baseRevision = null, keepalive = false } = {}) {
    return this.request('/api/save', { method: 'PUT', body: { save, baseRevision }, keepalive });
  }

  async deleteSave() {
    return this.request('/api/save', { method: 'DELETE' });
  }
}

// ---------------------------------------------------------------------------
// Save plumbing
// ---------------------------------------------------------------------------
/**
 * The blob we upload: the whole persisted state. Runtime-only flags are dropped
 * so the cloud copy is exactly what `migrateState()` expects back.
 */
export function saveEnvelope(state) {
  if (!state || typeof state !== 'object') return null;
  const { modal, modalShop, phoneOpen, phoneApp, phoneSeen, loginOpen, helpOpen, ...persisted } = state;
  return persisted;
}

/**
 * Boot policy — the whole point of the online rebuild.
 *
 * If the game can reach a city server, the server is the only save: local
 * progress is not loaded, and any leftover offline save is deleted rather than
 * migrated. Without a server (the `dev:offline` harness, GitHub Pages, ?offline=1)
 * the old local save still works, because there is nowhere else to put it.
 */
export function bootPolicy(serverUrl, hasLocalSave = false) {
  const online = !!httpOrigin(serverUrl);
  return {
    online,
    serverUrl: online ? serverUrl : null,
    useCloud: online,
    purgeLocalSave: online && !!hasLocalSave,
    showHelp: !online || !hasLocalSave,
  };
}

/** Human line for the HUD / toast after a sync attempt. */
export function syncLabel(result) {
  if (!result) return 'Cloud save: idle';
  if (result.ok) return `Cloud save: revision ${result.body?.meta?.revision ?? '?'}`;
  if (result.error?.quota) return 'Cloud save: daily quota reached';
  if (result.error?.code === 'offline' || result.error?.code === 'network') return 'Cloud save: offline';
  return `Cloud save: ${result.error?.message || 'failed'}`;
}
