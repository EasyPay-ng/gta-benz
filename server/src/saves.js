// Cloud-save envelope rules for the global account hub.
//
// The server deliberately does not understand the whole game state — that lives
// in `web-openworld-game/src/economy.js` and changes far more often than this
// file. What the server owns is the *contract*: how big a save may be, which
// versions it accepts, and how a revision is stamped so two devices can't
// silently overwrite each other.
//
// Pure functions only (no Durable Object, no `cloudflare:workers` import), so
// `server/test/hub.test.mjs` can exercise all of it with a memory storage stub.

export const MAX_SAVE_BYTES = 512 * 1024;      // 512 KB: a heavy save is ~60 KB
export const MAX_SAVE_BODY_BYTES = MAX_SAVE_BYTES + 8 * 1024;
export const MIN_SAVE_VERSION = 1;
export const CURRENT_SAVE_VERSION = 10;        // keep in step with src/data.js

/** Keys that must never reach a spread-merge on the client. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function clean(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 5000).map((v) => clean(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    out[k] = clean(v, depth + 1);
  }
  return out;
}

/**
 * Validate an untrusted save blob.
 * @returns {{ok:true, save:object, bytes:number, version:number}|{ok:false, code:string, bytes?:number}}
 */
export function validateSave(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, code: 'bad_save' };
  const version = Number(raw.version);
  if (!Number.isFinite(version) || version < MIN_SAVE_VERSION) return { ok: false, code: 'bad_version' };
  // A save from the future means the client is newer than the server: refuse it
  // rather than silently dropping the fields we don't know about.
  if (version > CURRENT_SAVE_VERSION) return { ok: false, code: 'save_too_new' };
  if (!Number.isFinite(Number(raw.cash)) || Number(raw.cash) < 0) return { ok: false, code: 'bad_cash' };

  let json;
  try {
    json = JSON.stringify(raw);
  } catch {
    return { ok: false, code: 'bad_save' };
  }
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_SAVE_BYTES) return { ok: false, code: 'too_large', bytes };
  return { ok: true, save: clean(raw), bytes, version };
}

/** Public metadata for a stored save (never ships the blob itself). */
export function saveMeta(record) {
  if (!record) return null;
  return {
    revision: record.revision || 0,
    updatedAt: record.updatedAt || 0,
    bytes: record.bytes || 0,
    version: record.version || 0,
    playtimeMs: record.playtimeMs || 0,
  };
}

/**
 * Build the record to persist. `baseRevision` lets a client say "I last saw
 * revision 4" — if the server has moved on, the write is refused as a conflict
 * instead of quietly losing someone's progress from another device.
 */
export function nextSaveRecord(previous, validated, { baseRevision = null, now = Date.now() } = {}) {
  const current = previous?.revision || 0;
  if (baseRevision !== null && baseRevision !== undefined && baseRevision !== current) {
    return { ok: false, code: 'revision_conflict', revision: current, updatedAt: previous?.updatedAt || 0 };
  }
  return {
    ok: true,
    record: {
      save: validated.save,
      revision: current + 1,
      updatedAt: now,
      bytes: validated.bytes,
      version: validated.version,
      playtimeMs: Number.isFinite(previous?.playtimeMs) ? previous.playtimeMs : 0,
    },
  };
}
