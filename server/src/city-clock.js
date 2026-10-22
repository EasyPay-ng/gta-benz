// CityClock — authoritative 24× room clock stored in CityRoom's Durable Object storage.
//
// Design (see UPGRADE_PLAN.md §11B & MULTIPLAYER.md §3):
//   * 1 real hour = 24 in-game hours (24× real time; 30 real s = 12 in-game minutes).
//   * Persisted as a single record ('clock') in DO storage so city time never resets
//     when all players leave or the Durable Object is evicted from memory.
//   * Hibernation-friendly: ticks via DO alarm every 30 real seconds ONLY while at
//     least one player is in the room; when the last socket leaves, CityRoom persists
//     the clock and deletes the alarm so idle cities cost zero duration.

export const CLOCK_SPEED = 24;
export const CLOCK_TICK_MS = 30_000;      // 30 real s = 12 in-game minutes
export const INGAME_MINUTE_MS = 60_000;
export const INGAME_HOUR_MS = 3_600_000;
export const INGAME_DAY_MS = 86_400_000;
export const CLOCK_START_MS = 8 * INGAME_HOUR_MS; // Day 1 · 08:00

const STORAGE_KEY = 'clock';

export function formatClockPayload(inGameMs, speed = CLOCK_SPEED) {
  const clamped = Math.max(0, Math.round(inGameMs));
  const day = Math.floor(clamped / INGAME_DAY_MS) + 1;
  const remDay = clamped % INGAME_DAY_MS;
  const totalMin = Math.floor(remDay / INGAME_MINUTE_MS);
  const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return {
    inGameMs: clamped,
    day,
    hhmm: `${hh}:${mm}`,
    speed,
  };
}

export class RoomClock {
  constructor(storage, { tickMs = CLOCK_TICK_MS, speed = CLOCK_SPEED } = {}) {
    this.storage = storage;
    this.tickMs = tickMs > 0 ? tickMs : CLOCK_TICK_MS;
    this.speed = speed > 0 ? speed : CLOCK_SPEED;
    this._rec = null;
  }

  async _load(now) {
    if (!this._rec) {
      const saved = await this.storage.get(STORAGE_KEY);
      if (saved && Number.isFinite(saved.inGameMs) && Number.isFinite(saved.updatedAt)) {
        this._rec = {
          inGameMs: saved.inGameMs,
          updatedAt: saved.updatedAt,
          lastBroadcastAt: Number.isFinite(saved.lastBroadcastAt) ? saved.lastBroadcastAt : saved.updatedAt,
          speed: Number.isFinite(saved.speed) ? saved.speed : this.speed,
        };
      } else {
        this._rec = {
          inGameMs: CLOCK_START_MS,
          updatedAt: now,
          lastBroadcastAt: now,
          speed: this.speed,
        };
        await this.storage.put(STORAGE_KEY, this._rec);
      }
    }
    const elapsed = Math.max(0, now - this._rec.updatedAt);
    if (elapsed > 0) {
      this._rec.inGameMs += elapsed * this._rec.speed;
      this._rec.updatedAt = now;
    }
    return this._rec;
  }

  /** Called when a player joins the room; returns welcome clock payload + next tick alarm. */
  async onJoin(now, wasEmpty = false) {
    const rec = await this._load(now);
    if (wasEmpty || now - rec.lastBroadcastAt > this.tickMs) {
      rec.lastBroadcastAt = now;
    }
    await this.storage.put(STORAGE_KEY, rec);
    return {
      clock: formatClockPayload(rec.inGameMs, rec.speed),
      nextTickAt: rec.lastBroadcastAt + this.tickMs,
    };
  }

  /** Called from DO `alarm()` while players are present. Broadcasts every `tickMs`. */
  async maybeTick(now, broadcast) {
    const rec = await this._load(now);
    if (now - rec.lastBroadcastAt >= this.tickMs - 25) {
      rec.lastBroadcastAt = now;
      await this.storage.put(STORAGE_KEY, rec);
      const payload = formatClockPayload(rec.inGameMs, rec.speed);
      broadcast({ t: 'clock', ...payload, now });
    }
    return rec.lastBroadcastAt + this.tickMs;
  }

  /** Called when the last joined player disconnects so the room can hibernate cleanly. */
  async onEmpty(now) {
    const rec = await this._load(now);
    rec.lastBroadcastAt = now;
    await this.storage.put(STORAGE_KEY, rec);
  }
}
