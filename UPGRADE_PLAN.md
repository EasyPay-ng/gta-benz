# MetroVenture 3D — Upgrade Plan: Detailed Development Prompts

The 11 agreed upgrade points, formatted into implementation-ready prompts for a development
AI (or human). Each feature has: what ships, the current-state facts it builds on, the
decisions already made (veto them now, they are baked into the prompts), a copy-paste
**prompt**, and an acceptance checklist.

Feature number ≠ build order. The recommended build order is at the bottom (§M).

---

## 0. Ground truth (read before implementing anything)

- **Stack**: Three.js r170 (vendored at `web-openworld-game/vendor/three.module.min.js`),
  vanilla ES modules, **no build step, no new dependencies**, deploys to GitHub Pages.
  Single-player must keep working with no server; multiplayer is optional.
- **Files** (as of this commit):
  - `web-openworld-game/index.html` (165 ln) — HUD, `#modal`/`#modal-body` generic modal,
    `#prompt` E-interaction, `#toasts`, `#vehicle-hud`, login, character creator, touch controls.
  - `web-openworld-game/game.js` (1776 ln) — renderer, loop, input, camera, enter/exit/valet,
    citizens AI, tasks, modals, HUD, minimap, audio, save/load. Interactables are registered
    with `consider(x, z, radius, label, fn, weight)` into `game.prompt`; `openModal(renderFn)`
    renders any modal.
  - `src/data.js` (212 ln) — all tunables: `SAVE_KEY`, `SAVE_VERSION = 2`, `PAYROLL_INTERVAL = 30`
    (seconds), roads/blocks, `OCCUPATIONS`, `RANKS`, `BUSINESSES` (4 lots), `STATIONS`
    (courier/security/cab), `DEALERSHIP`, `VEHICLE_MODELS` (6 models, speeds in **m/s**),
    appearance options, citizen names.
  - `src/economy.js` (265 ln) — **pure, unit-tested** game-state logic: `createInitialState()`,
    `migrateState()`, ranks, job clock in/out, tasks, `buyLot/upgradeBusiness/hireCitizen/
    collectProfit/runPayrollCycle/tickPayroll/buyVehicle`.
  - `src/character.js` (305 ln) — shared humanoid rig. Poses: `stand | sit | work | dive` via
    `setPose(pose, duration)`; procedural, no animation assets. Uniform + headgear swap by
    occupation (`setOccupation`).
  - `src/world.js` (706 ln) — procedural city: roads at x/z ∈ {-150,-75,0,75,150}, 16 blocks,
    sidewalks, nav graph + BFS, AABB colliders. All buildings (stations, dealer, lots,
    skyline towers) are **exterior shells** — a glass door plane exists but there are no
    interiors, rooms or enterable geometry.
  - `src/vehicles.js` (419 ln) — `buildCarMesh`, `Vehicle` (player arcade physics),
    `TrafficCar` (lane AI). No HP, fuel or wear.
  - `src/net.js` (474 ln) — multiplayer transport (reconnect, 10 Hz send, 5 Hz playback).
  - `server/src/` — Cloudflare Worker + Durable Object `city-room.js` (440 ln) + `accounts.js`
    (name+PIN accounts, `playerId`, 24-byte session tokens). Protocol v1 table is in
    `MULTIPLAYER.md` §3.
- **Save**: `localStorage` key `metroventure_openworld_save_v1`, `SAVE_VERSION = 2`.
  `migrateState()` fills defaults for older saves.
- **What multiplayer does NOT sync yet** (MULTIPLAYER.md §6): traffic, citizens, economy,
  vehicle ownership. Positions are client-authoritative. Nothing persists server-side except
  last-seen position + accounts.
- **Debug**: `window.__mv` exposes the live game object (state, player, vehicles, citizens,
  traffic, net, remotes).

### Global conventions — apply to every feature below

1. No new npm dependencies, no build step. ES modules only.
2. Every tunable number lives in `src/data.js` (UPPER_SNAKE, commented).
3. Pure logic (costs, wages, wear, needs, leases, keys) → pure module(s) with tests in
   `web-openworld-game/tests/` (run via `npm test`, `node --test`).
4. Save migration: bump `SAVE_VERSION` per feature; extend `createInitialState()` and
   `migrateState()`; every previous save version must load without data loss.
5. Multiplayer: extend the protocol with backward-compatible optional fields where possible;
   new message types need both `net.js` and `server/src/city-room.js`, plus an updated row in
   the `MULTIPLAYER.md` protocol table. Keep interest culling (160 m), 10 Hz/5 Hz
   coalescing, and server-side clamps. Anything with cross-player effect must be
   **server-authoritative** (Durable Object state), never client-only.
6. UI reuses `#modal` + `openModal()` + `toast()` + `#prompt` (the `consider()` pattern).
   Match the glassmorphism style in `style.css`.
7. Every feature must leave the offline single-player path working (`npm run dev:offline`).
8. Every feature updates `README.md` (Features + Controls if keys change) and exposes its
   live state on `window.__mv`.
9. Tests: `npm test` and `server/test/smoke.mjs` pass before a feature is done.

### Time scale (feature 11, but used by features 1, 3, 4, 10)

1 real-life hour = 24 in-game hours, i.e. the in-game clock runs at **24× real time**:

| In-game unit | Real time |
|---|---|
| 1 minute | 2.5 s |
| 1 hour | 2.5 min |
| 1 day | 1 h |
| 1 week | 7 h |

Consequences this plan relies on:

- Existing 30 s payday cadence stays (it becomes "12 in-game minutes per shift" — a UI
  relabel only, no balance change).
- "Daily wage" (security, feature 1) accrues per **in-game day = 1 real hour**.
- "Weekly" rent (feature 10) = **7 in-game days = 7 real hours** per lease week.
- Vehicle wear/fuel (feature 4) are driven by **distance and time actually driven**, so the
  time scale doesn't hollow them out.

---

## 1. Hire Security Operatives

**What ships**: hire AI operatives (and later, real players) as security. Guards protect
the employer, their houses, cars and assigned properties; take follow / hold-post /
guard-zone commands; react to threats with a limited pursuit radius, then return to post;
earn daily wages on the in-game clock that accrue while the employer is offline (server-side).

**Current state**: `City Security HQ` exists as a station (job station + sign + interact
pad) but only hosts the player's *City Security Officer* patrol job. No guard entities, no
combat system anywhere in the game, no wage accrual.

**Decisions (already made — flag to veto)**:

- **D1 — Soft combat, not damage combat.** The game has no player-vs-player damage system,
  so guards do *security response*, not fights: on aggro they advance, raise a hand
  (`point` emote), play an alarm SFX, show a threat toast, and apply a slow 1.5 s to the
  offending player. **Real damage combat is explicitly out of scope** and re-opened as its
  own feature. This keeps multiplayer friendly on the free server.
- **D2 — Aggro is proximity-based** (threat inside the protected zone / touching the
  employer), not hostility-based, because there is no hostility signal.
- **D3 — AI guards are per-client simulations in v1** (like citizens). Player-employer
  guards arrive in a later pass and are server-recorded. Single-player works fully offline.
- **D4 — Unpaid wages → strike.** If wages are more than 2 in-game days overdue, the guard
  stands down (sits on the curb) until paid. Flavor + a reason to keep the cash flow going.

**Prompt**:

```
Context: MetroVenture 3D — see UPGRADE_PLAN.md §0 for stack, files, save, protocol and
global conventions. This is feature 1 (security operatives), part of milestone M7,
building on the in-game clock from feature 11.

Task: implement hireable security operatives.

A. Data (src/data.js):
   - OCCUPATION 'securityGuard' look: dark navy uniform, peaked cap (reuse the existing
     headgear set from src/character.js setOccupation — add the variant there).
   - GUARD config: GUARD_HIRE_COST, GUARD_DAILY_WAGE (per in-game day = 1 real hour),
     GUARD_PURSUIT_DIST (40 m), GUARD_ZONE_R (default 15 m, range 10–30),
     GUARD_MAX = 4 per employer, GUARD_STRIKE_DAYS = 2.

B. Pure logic (new file src/security.js, tested in tests/security.test.mjs):
   - hireGuard(state) / dismissGuard(state, guardId)
   - guardWageOwed(state, guardId, inGameNowMs) -> number
   - payGuardWages(state, guardId | 'all', inGameNowMs)
   - guardStatus(guard, state, inGameNowMs) -> 'active' | 'strike'
   Guards are stored in state.security = { operatives: [ { id, name, uniform, post:
   { type: 'follow' | 'post' | 'zone', x, z, r }, hiredAtInGameMs, lastPaidInGameMs,
   employer: 'local' } ] }. Bump SAVE_VERSION; migrate old saves (default: none hired).

C. World (game.js + src/world.js):
   - City Security HQ modal gains a "Hire operative" section: cost, wage, current guards,
     hire/dismiss, per-guard command panel (Follow / Hold post / Guard zone with x,z,r
     pickers; for 'zone' the player clicks a spot on the minimap or walks over it and
     presses E).
   - AI guard entity reuses the citizen pathing (sidewalk nav graph + BFS from world.js)
     and the shared Character rig (securityGuard occupation look).
   - Behaviours: follow (stay ~3 m behind employer, re-path on player moves), post (walk
     to x,z and stand), zone (patrol the perimeter of the circle, face centre).
   - Security response (soft combat, D1): if a player (any local/remote player) enters
     the protected radius while a guard is active — protected = employer within 5 m, the
     assigned post, the guard's zone, or any property in the employer's inventory owned
     as apartment/office (feature 10) — the guard walks toward the threat, plays the
     'point' emote, plays an alarm SFX, toasts "SECURITY: <name> — step back!", and slows
     the offender 1.5 s (throttle one slow per threat per 10 s). Pursuit: chase at most
     GUARD_PURSUIT_DIST beyond the zone, then return to post (D2).
   - Strike (D4): unpaid > GUARD_STRIKE_DAYS → guard sits on a nearby bench, command
     inputs refused, wage counter in red.

D. Wages on the in-game clock (feature 11):
   - Wages accrue continuously on the clock: owed = wage/day × days since lastPaid.
   - HUD chip "💲 Guard wages due: $X" appears when owed > 0; HQ modal shows the ledger.
   - Paying deducts cash (economy.js pure helper + test). While the employer is offline
     in multiplayer, the server keeps the clock (that is the M7b server pass); in
     single-player, the client clock (feature 11) fast-forwards on load, which is the
     documented approximation.
   - window.__mv.security exposes { state.security, guards: [live entities] }.

E. Save: state.security with the shape above; migrateState fills it for old saves.

Acceptance:
   - Hire 4 guards max, each with a distinct name from CITIZEN_NAMES leftovers or a guard
     name list; dismiss refunds nothing.
   - All three post types work and re-path correctly when the player moves.
   - Approach a guard's zone in single-player with a second local "citizen" (reuse
     citizens as the threat test-double via window.__mv): guard chases, emotes, toasts,
     1.5 s slow applied, then returns to post after 40 m pursuit.
   - Pause cash flow: let wages accrue 2 in-game days (fast-forward via
     window.__mv), verify strike state, pay, verify active again.
   - Save → reload: guards, posts and wage ledger survive.
   - npm test + npm run dev:offline pass.
```

**Acceptance checklist (summary)**: hire/dismiss UI · 3 post types · soft-combat response
+ pursuit cap · strike on overdue wages · wage ledger on the in-game clock · save
migration · `window.__mv.security` · offline single-player intact · tests green.

---

## 2. Character Animations, Emotes & Jumping

**What ships**: jumping; dance/expressive emotes (wave, clap, greet, celebrate, 3 dance
styles); an on-screen **Actions & Emotes** menu plus hotkeys; emotes are visible to all
nearby players in multiplayer.

**Current state**: `src/character.js` has procedural poses `stand | sit | work | dive`
driven in `update(dt)` — no assets, no jump, no emotes. `MULTIPLAYER.md` §8 already
plans the net side: an `emote` field on the `pos` message.

**Decisions**:

- **D1 — Jump is cosmetic.** The city floor is flat; jump gives vertical velocity +
  gravity (max height ~0.9 m, ~0.5 s airtime) but collides with nothing and can't be
  used to reach anything. No jump while in a vehicle.
- **D2 — Emotes are procedural keyframes** in `character.js` (sinusoidal limb motion),
  no external animation files (keeps the no-build-step constraint).
- **D3 — Hotkeys**: `B` opens the Actions & Emotes panel; emotes `1`–`8` fire directly
  when not in a vehicle. Emotes auto-cancel on movement.

**Prompt**:

```
Context: MetroVenture 3D — see UPGRADE_PLAN.md §0. This is feature 2.

Task: add jumping and an emote system to the shared character rig, with a UI panel,
hotkeys and multiplayer broadcast.

A. src/character.js:
   - Extend the pose system: setEmote(id, durationMs = 0) — id ∈
     'dance1' | 'dance2' | 'dance3' | 'wave' | 'clap' | 'greet' | 'celebrate' | 'jump'.
     Emotes run as procedural keyframes inside update(dt) (limb rotations as functions
     of a phase timer); setPose continues to own stand/sit/work/dive and any emote
     overrides them while active.
   - 'dance1': salsa (hip sway + arm raises, ~2 s, repeatable); 'dance2': robot
     (stiff arm/leg isolations, ~2.4 s); 'dance3': floss (arm floss + shoulder roll,
     ~2 s); 'wave': right arm wave (~1.8 s); 'clap': two-hand clap ×3 (~1.6 s);
     'greet': nod + hand to chest (~1.5 s); 'celebrate': arms up + small hop ×2
     (~1.8 s). Loop emotes only for dances; single-shot emotes end by themselves.
   - Jump: add y physics to the rig (vy, gravity, ground = 0). Height ≈ 0.9 m.
     Expose isAirborne() for SFX/camera.

B. game.js:
   - Player: Space (on foot) or a touch button triggers jump; emotes auto-cancel when
     movement input starts.
   - New "Actions & Emotes" panel (button on the #side rail labelled "✋ Actions",
     hotkey B): a modal with an 8-slot grid (icon + name + duration) + a Jump row;
     clicking fires the emote immediately (modal stays open for repeat use).
   - Hotkeys 1–8 fire emotes directly when on foot.
   - Citizens flavour (optional, cheap): a hired citizen occasionally (≤ 1 per 90 s per
     citizen, probability-gated) plays 'wave' or 'clap' when the player is within 6 m.

C. Multiplayer (src/net.js + server/src/city-room.js + MULTIPLAYER.md table):
   - Optional field on the client 'pos' message: { emote: '<id>', until: <ts> } — only
     present while an emote is active (server must not require it). Server forwards it
     unchanged in 'snap' entries as an optional 6th element after veh (append at the
     end of the array to stay backward compatible: [id, x, z, yaw, mv, veh, emote]).
   - Remotes play the same setEmote; drop it on leave. No protocol version bump
     required (optional field), but document the row change in MULTIPLAYER.md §3.
   - Emotes broadcast at the existing 10 Hz send rate; nothing new is rate-limited.

D. Audio: small SFX per emote category (dance = rhythmic blip, wave/greet = soft whoosh,
   celebrate = chime, jump = tiny thud on land) through the existing audio helper,
   respecting mute (M).

E. Debug: window.__mv.player.setEmote(id) reachable from console.

Acceptance:
   - Jump: ~0.9 m height, no double-jump in air, no jump in vehicle, landing SFX.
   - All 8 emotes play on the player rig and cancel on WASD input.
   - Actions panel lists all 8 with hotkeys 1–8 working on foot.
   - Two tabs (npm run dev): one player dances, the other sees the same dance with
     matching name tag; emote disappears on leave.
   - Save/reload and character creator re-open do not break the rig.
   - npm test passes; no new dependencies.
```

**Acceptance checklist**: jump physics · 8 emotes · panel + hotkeys + touch button ·
remote playback via `pos.emote` · SFX · debug hook · tests green.

---

## 3. Furniture, Electronics & Player Needs System

**What ships**: interactive furniture (chairs/sofas: sit; beds: sleep with time-skip;
fridges: eat from inventory; TVs: watch; computers: use; coffee machines: drink;
showers/baths: hygiene) and four survival bars — health, hunger, energy, hygiene —
that decrease on the in-game time scale and are restored by sleeping, eating, drinking
coffee and hygiene actions.

**Current state**: no interiors exist yet (feature 7/8 — the furniture needs somewhere
to live), no needs, no food items. The diner startup (Metro Fresh Diner) is a natural
food vendor.

**Decisions**:

- **D1 — Furniture is data, not code.** Every furniture item is an entry in the room
  file of feature 7/8: `{ id, type, x, z, rot, interact }`. `src/furniture.js` maps
  `type` → mesh builder + interact handler. Adding a new furniture type never touches
  world generation.
- **D2 — Needs tick on the in-game clock** (feature 11), so rates are per in-game
  minute; physical activity adds instant drains (sprint, driving).
- **D3 — Collapse, not death.** At 0 health the player collapses, is carried to their
  apartment (or the cab station if they own none), loses a small cash fine, and wakes
  at 50% health. No permadeath — this is a tycoon game.
- **D4 — Sleep is a time skip**: choosing "wake at 07:00" fast-forwards the clock to
  that time, restores energy fully, hunger keeps draining at rest rate, and the scene
  fades out/in. This is the same clock fast-forward used on load.

**Prompt**:

```
Context: MetroVenture 3D — see UPGRADE_PLAN.md §0. This is feature 3; it depends on the
in-game clock (feature 11, M1) and on at least one enterable interior (feature 7/8,
M5a — the player's apartment or the diner). Implement furniture + needs so they work
in whichever interiors exist at the time.

A. Data (src/data.js):
   - NEEDS config: per-in-game-minute decay rates — hunger -0.5, energy -0.35
     (-1.2 sprinting, -0.9 driving), hygiene -0.1; health drains -0.8/in-game-min
     while hunger==0 or energy==0 (stacks). Rest rates while asleep: hunger -0.1,
     energy +full by wake, hygiene 0.
   - FOOD_ITEMS / DRINK_ITEMS: { id, name, icon, hunger, energy, price, vendor } —
     e.g. samosa (hunger 15, $5), jollof bowl (hunger 40, $15), kebab (hunger 30, $10),
     water (energy 10, $3), coffee (energy 25, $8, small hunger -5).
   - COLLAPSE_FINE.

B. Pure logic (src/needs.js, tested in tests/needs.test.mjs):
   - tickNeeds(state, dtInGameMs, activity: 'idle'|'walk'|'sprint'|'drive'|'asleep')
   - eatItem(state, itemId) / drinkItem / shower(state) / sleepThrough(state,
     wakeInGameMs) — each mutates state.needs and returns the applied deltas for UI.
   - state.needs = { health, hunger, energy, hygiene } (all 0–100, start 100).
     Bump SAVE_VERSION + migrate.

C. Furniture (new src/furniture.js):
   - buildFurniture(type) -> THREE.Group (low-poly boxes/cylinders consistent with the
     existing world.js box() aesthetic, shared materials).
   - Furniture types: chair, sofa, bed, fridge, tv, computer, coffeeMachine, shower,
     desk, plant (decor), tap (water).
   - Each interactive type registers a game.prompt consider() entry when its building
     is entered:
       chair/sofa → "Sit down" (character sit pose, camera lowers; standing up via E)
       bed → "Sleep" modal: wake-time picker (05:00–12:00) → time-skip fade (D4)
       fridge → modal listing FOOD_ITEMS in inventory (or "Fridge is empty — buy food
         at the Diner"); E eats the selected item
       tv → "Watch TV" (sit/auto, energy +0.2/in-game-min, small hygiene-neutral
         relaxation, E stops)
       computer → "Use computer" (typing pose = work pose; pure flavour + +XP tick for
         Software Engineers on the clock)
       coffeeMachine → "Buy & drink coffee" ($8, energy +25)
       shower → "Shower" (2 s animation pose, hygiene → 100, water sound)
       tap → "Drink water" (energy +10, free)
   - Food bought at the Metro Fresh Diner modal (add a "Takeaway" tab) goes into the
     inventory from feature 5 (kind 'food'). Until feature 5 lands, food is a
     state.inventory array anyway — build the array now; feature 5 formalises it.

D. HUD (index.html + game.js):
   - Four slim bars under the cash stat (❤ Health / 🍔 Hunger / ⚡ Energy / 🚿 Hygiene),
     glass style, 1 Hz refresh, red flash + toast when any crosses 25%.
   - Collapse (D3): screen fade, toast "You collapsed from exhaustion", carried to
     apartment door (or cab station), fine deducted, wake at 50%.

E. Debug: window.__mv.needs = { tick(dtInGameMs, activity), state: () => game.state.needs }.

Acceptance:
   - Fast-forward the clock 24 in-game hours doing nothing: hunger/energy/hygiene
     visibly drop; health drops only after hunger/energy hit 0.
   - Sprint 1 in-game hour: energy drops at the sprint rate.
   - Eat jollof: hunger +40; drink coffee: energy +25, small hunger cost; shower:
     hygiene 100.
   - Sleep: fade, clock jumps to chosen time, energy 100, toast.
   - Collapse at 0 health: fine, respawn at home, 50% health.
   - All furniture poses look right on all 3 body builds (Balanced/Lean/Broad).
   - Save/reload: needs persist.
   - npm test green (needs.test.mjs covers tick, eat, sleep, collapse rules).
```

**Acceptance checklist**: 4 needs bars · clock-driven decay + activity modifiers ·
furniture data-driven with all 10 types · sleep time-skip · food/drink items + diner
vendor · collapse rule · save migration · tests green.

---

## 4. Vehicle Damage, Maintenance & Fuel

**Status**: implemented on `arena/2156b951-gta-benz` (save v3) — cond on every vehicle,
distance wear, impact damage, 3 fuel stations, stall & wreck states, refuel + mechanic
modals (Metro Motors city rates / Apex house rates), tow, HUD fuel readout,
`tests/vehicleCond.test.mjs`. Repair/tow/wreck rules built to the D4/D5 defaults below;
the owner requested a review of those rules — adjust once confirmed.

**What ships**: per-vehicle HP, fuel, tire and engine wear; collision damage above
30 km/h; fuel stations; breakdown states (no fuel → stall, HP 0 → wreck + ejection);
repairs at the garage.

**Current state**: `Vehicle` in `src/vehicles.js` is pure arcade physics (accel/brake/
grip/steer, collisions) with no condition. No fuel stations in `world.js`. The Apex
Auto Garage startup lot and the Metro Motors dealership exist as exteriors.

**Decisions**:

- **D1 — Units.** All speeds stay m/s in code. The agreed "speeds ≥ 30" means **30 km/h
  ≈ 8.33 m/s** (any meaningful crash); below that, no HP loss. The threshold is a
  tunable: `DAMAGE_SPEED_KMH = 30`.
- **D2 — Fuel is a 0–100 tank**, consumption per model per km driven (`FUEL_PER_KM`:
  hatch 3.0, sedan 2.6, taxi 2.7, pickup 3.2, van 3.4, sports 3.6), so a full tank
  covers roughly 10–15 real minutes of driving. Filling is instant in a 2 s animated
  pump interaction, priced per model (`FILL_PRICE`: hatch $60 → sports $140).
- **D3 — Wear**: tires -0.05%/km, engine -0.03%/km, plus engine extra -0.02%/km above
  25 m/s. Worn tires reduce grip (grip × (0.6 + 0.4 × tires/100)); worn engine cuts
  maxSpeed similarly.
- **D4 — Repair location**: Apex Auto Garage **if the player built it** (their own
  business — nice loop), otherwise Metro Motors (dealer, 20% markup). A tow is
  available from either ($250, car arrives at the shop).
- **D5 — Wrecks persist**: a wrecked car becomes a static prop (collider stays,
  engine dead, smoke effect) until repaired; the player exits on impact and must
  walk/taxi to a shop.

**Prompt**:

```
Context: MetroVenture 3D — see UPGRADE_PLAN.md §0. This is feature 4, milestone M2.
No multiplayer changes in this feature (condition is local; syncing a 'wrecked' flag
is a later optional step).

A. Data (src/data.js):
   - Per model: fuelPerKm, fillPrice, tankSize = 100.
   - GLOBALS: DAMAGE_SPEED_KMH = 30, IMPACT_DMG_FACTOR = 4 (hp loss =
     (relSpeedMps - threshold) × 4, capped 40 per impact), SCRAPE_SPEED_MPS = 5
     (below threshold but above this: -1 hp per impact), REPAIR_COST_PER_HP = 3,
     REPAIR_TIRE_BUNDLE = 150 (restores 25 tire), REPAIR_ENGINE_BUNDLE = 200
     (restores 25 engine), TOW_PRICE = 250.

B. Save: each vehicle gains cond: { hp: 100, fuel: 100, tires: 100, engine: 100 }.
   Bump SAVE_VERSION; migrateState gives defaults to old vehicles (all 100).
   window.__mv.vehicles[*].cond visible.

C. Pure logic (src/vehicleCond.js, tests/vehicleCond.test.mjs):
   - applyDrive(state, vehId, distKm, dtInGameMs, topSpeedMps) — fuel/wear math.
   - applyImpact(state, vehId, relSpeedMps) -> hp delta (threshold rule D1).
   - repairOptions(state, vehId, atShop: 'apex' | 'motors') -> itemised costs.
   - doRepair(state, vehId, atShop, parts[]) -> applied.
   - fuelStations are defined in data.js: 3 stations on roads (e.g. at
     (75, 112.5) 'Lagoon Fuels', (-75, -112.5) 'Harbor Fuels', (112.5, -75)
     'Metro Fuels'), each with pump positions and a collider footprint.

D. World (src/world.js):
   - Build the 3 fuel stations: canopy, 4 pumps (with hoses as thin boxes), signage
     'FUELS 24/7', price board, night-glow sign, AABB colliders.

E. Driving (src/vehicles.js + game.js):
   - Fuel: decreases with distance driven (throttle-weighted: ×0.4 at idle/low speed,
     ×1.0 at high). fuel ≤ 0 → engine stalls (car coasts to a stop, 'Out of fuel'
     toast + horn SFX, F to exit).
   - Wear: per D3; grip/maxSpeed modifiers wired into the existing physics constants
     at runtime (do not mutate data.js objects — compute per frame from cond).
   - Impacts: on collision with another car/wall/collider, compute relative speed;
     applyImpact rule D1; hit-flash on the car + impact SFX scaled by severity.
   - hp ≤ 0 → wrecked (D5): car stops, driver ejected at the door, smoke sprite
     (cheap: 5 animated quads or an emissive flicker), vehicle rendered slightly
     scorched (darken material 30%), no longer enterable; it stays in state.vehicles
     as wrecked: true.
   - Fueling: E at a pump → modal: tank %, cost for full, "Fill up" (2 s pump
     animation with fuel sound, then fuel = 100, cash debited; refuse if cash short).
   - Repair: E at Apex Auto Garage (if built) or Metro Motors → "Mechanic" modal
     (this is the real-time telemetry's shop side, feature 9 builds the read-only
     side): itemised list — HP bar → repair cost, Tires (25-step bundle), Engine
     (25-step bundle), plus "Tow my wrecked car ($250)" when a wreck exists. Repair
     plays a 3 s wrench SFX + progress; wrecked cars become drivable again (scorch
     stays at hp < 35, cosmetic).

F. HUD (with feature 9): vehicle HUD gains HP/fuel/tires/engine bars — implement the
   data flow now (cond readable at 2 Hz) and the bars in feature 9's pass.

Acceptance:
   - Drive 10 km in the sedan: fuel, tires and engine drop per the test vectors.
   - 20 km/h crash: no hp loss. 40 km/h crash: hp −33 (≈(11.1-8.33)×4).
   - Empty the tank: car coasts, stalls, toast, must reach a fuel station.
   - Wreck the hatch (console: window.__mv → cond.hp = 1): ejection, smoke, car is a
     static collider, cannot re-enter, tow works, repair restores drive.
   - Worn tires to 40%: grip visibly lower (slip on drift).
   - Repair costs match repairOptions(); short cash refuses.
   - Save/reload: cond persists; old saves get all-100 defaults.
   - npm test green including the new test file.
```

**Acceptance checklist**: cond on every vehicle (migrated) · distance wear · impact
threshold rule · 3 fuel stations + pumping UX · stall & wreck states · repair shop +
tow · HUD data flow · tests green.

---

## 5. Exclusive Vehicle Access & Inventories

**What ships**: only the owner (or a key holder) can drive a vehicle; a real
inventory system (item kinds: vehicle keys, property keys, food, drinks) that is the
foundation for key transfer (feature 6), property keys (feature 10) and food (feature 3).

**Current state**: single-player — anything is drivable. Multiplayer — vehicle
ownership is per-client, not synced (MULTIPLAYER.md §6). No inventory exists.

**Decisions**:

- **D1 — `ownerId` on every vehicle**: the account `playerId` (server-issued on
  `join`). Single-player/guest: `ownerId: 'local'`. Pre-existing save vehicles get
  `ownerId: 'local'` via migration.
- **D2 — Server is the ownership authority in multiplayer.** The DO stores
  `{ vehicles: { [vehId]: { ownerId, keys: [playerId, …], wrecked } } }` in its
  durable storage (compact JSON — free-tier storage is small, see MULTIPLAYER.md §1).
  The `welcome` message gains an optional `vehicles` field so each client learns the
  room's vehicle registry on join.
- **D3 — Inventory is local until transfer happens.** Items live in
  `state.inventory = { items: [{ id, kind, refId, label }] }`, max 24 slots.
  Transfers (keys, feature 6) go through the server; food is never transferred.
- **D4 — Lock UX**: a non-owner at a car sees prompt "🔒 Locked — <owner>'s
  <model>"; E shakes the car + thud SFX. Owners always enter; key holders enter once
  the grant is confirmed by the server (optimistic UI, rolled back on error).

**Prompt**:

```
Context: MetroVenture 3D — see UPGRADE_PLAN.md §0. This is feature 5, milestone M3,
after the clock (M1). Feature 6 (key transfer) builds directly on this.

A. Pure logic (src/inventory.js, tests/inventory.test.mjs):
   - addItem(inv, item) -> ok | 'full'; removeItem(inv, itemId); findItem(inv, kind,
     refId?); INV_CAP = 24. Kinds: 'vkey' (refId = vehId), 'pkey' (refId = listingId),
     'food', 'drink'.
   - state.inventory created in createInitialState (start with the starter hatch's
     key, kind 'vkey'), bump SAVE_VERSION, migrate (old saves: one vkey per vehicle
     already in the garage).

B. Ownership (client):
   - state.vehicles[*].ownerId (D1). game.js enter-car logic: allow if
     ownerId === myId (local or my playerId) OR I hold a vkey for that vehId
     (single-player) OR server says keys contains myId (multiplayer — read from the
     room registry). Lock UX per D4.
   - Buying a car sets ownerId to the buyer. Valet (V) only works on owned/keyed cars.

C. Server (server/src/city-room.js + src/net.js + MULTIPLAYER.md):
   - DO state: vehicles registry (D2). On 'join' → include `vehicles` in welcome.
   - New client messages:
       'veh_owned' {vehId, ownerId}   — client announces a purchase (validated: must
                                        be the room's owner-of-record or 'local'→their
                                        playerId; server stores)
       'grant_key' {vehId, to}        — used by feature 6 after a hand-off
       'revoke_key' {vehId, to}
     Server validates: only ownerId may grant/revoke; only existing vehIds; errors
     {code: 'not_owner' | 'no_vehicle' | 'unknown_player'}.
   - Keep every existing message working unchanged (optional fields only where added).

D. UI:
   - New "Garage & Inventory" modal (side-rail button 🧰, also E at any of YOUR cars):
     left column = vehicle list (model, color chip, ownerId name, cond mini-bars from
     feature 4 data, "Locked?" state), right column = inventory grid (24 slots,
     item icons + tooltips). Keys show the car they open.
   - HUD: a small inventory counter chip when non-empty.

E. Debug: window.__mv.inventory, window.__mv.vehiclesRoom (multiplayer).

Acceptance:
   - Single-player: all owned cars enterable; console-set another ownerId → lock UX.
   - Two tabs (npm run dev): player A buys a car (veh_owned broadcast), B sees it in
     the room registry, B gets lock UX at A's car, A enters freely.
   - Inventory: add/remove/cap 24 enforced; vkey appears when a car is bought.
   - grant_key by non-owner rejected with 'not_owner' (test in server/test/smoke.mjs).
   - Old save loads: every vehicle has a key in inventory.
   - npm test + server smoke pass.
```

**Acceptance checklist**: ownerId on vehicles (migrated) · lock UX · 24-slot inventory
with 4 item kinds · server registry + 3 new messages with validation · Garage &
Inventory modal · smoke tests for the server rules.

---

## 6. Transferable Vehicle Keys

**What ships**: pull a vehicle key out of your inventory and hand it to another player
in multiplayer so trusted friends can drive your car; revokeable; persisted on the
server.

**Current state**: builds directly on feature 5 (vkey items + server registry).

**Decisions**:

- **D1 — Hand-off is proximity + confirm.** E on another player while holding a vkey
  → "Hand <Car> key to <name>?" confirm → 1 s hand-off animation (both characters
  face each other, item icon floats between them) → server `grant_key` → both get
  toasts; recipient's prompt at the car unlocks.
- **D2 — Revoke**: owner opens Garage & Inventory → key list → "Revoke" (or dismiss
  via HQ-style panel). Server removes; recipient's next enter attempt shows the lock.
- **D3 — A key is single-slot**: if the recipient already holds a key for that car,
  the hand-off is refused ("Already has it").
- **D4 — No double-spend**: only one key item per (vehId, holder) pair, enforced in
  the server registry, not the client inventory.

**Prompt**:

```
Context: MetroVenture 3D — see UPGRADE_PLAN.md §0. This is feature 6, milestone M3,
requires feature 5 to be merged.

A. Client (game.js):
   - consider() entry: within 2.5 m of a remote/local player while the local player
     holds a vkey not already held by them → "Hand <Car name> key to <their name>".
   - Confirm toast (E again within 3 s to confirm, matching the existing prompt
     confirm style) → 1 s hand-off animation: both rigs turn to face each other, a
     key icon (billboard sprite) travels from holder to recipient, SFX 'ping'.
   - On animation end: net.send('grant_key', {vehId, to: theirPlayerId}).
     Optimistic: recipient's local prompt unlocks immediately; on server error toast
     the failure and roll back (remove nothing — the item stays with the sender;
     grant is all-or-nothing server-side).
   - Owner revoke: in Garage & Inventory (feature 5), each granted key row shows the
     holder's name + a "Revoke" button → 'revoke_key' → toast to both (server
     broadcasts a 'key_event' to the room: {vehId, from, to, action}).

B. Server (city-room.js + smoke test):
   - grant_key: validator = sender is ownerId of vehId; receiver is in the room;
     pair not already held (D3/D4). Stores keys[] on the vehicle record, persists to
     DO storage, broadcasts key_event.
   - revoke_key: sender must be ownerId; removes; broadcasts.
   - welcome.vehicles already carries keys[] (feature 5) — recipients rehydrate
     "I can drive this" state on rejoin.
   - Guests: key transfer works with guests (their playerId is the guest id);
     guest rejoin loses keys (documented: keys are tied to accounts for durability).

C. MULTIPLAYER.md: protocol rows for grant_key / revoke_key / key_event; update §6
   "not multiplayer yet" — vehicle keys are now synced.

D. Debug: window.__mv.sendGrant(vehId, to) for two-tab QA.

Acceptance:
   - Two tabs: A grants to B; B drives A's car; A revokes; B's next attempt shows the
     lock + toast "Key revoked by <A>".
   - Double grant refused with a clear error (smoke test).
   - Rejoin: B reconnects, welcome.vehicles restores their key.
   - Sender keeps… no: on successful grant the vkey leaves the sender's inventory and
     appears in the recipient's (the item moved); revoke sends it back to the owner's
     inventory. Verify both inventories at each step.
   - npm test + smoke pass.
```

**Acceptance checklist**: proximity hand-off with confirm + animation · server grant/
revoke with validation + persistence · key_event broadcast · inventory moves correctly
grant/revoke/rejoin · guests documented · MULTIPLAYER.md updated.

---

## 7 & 8. Fully Enterable Buildings & Unique Room Files

**What ships**: every building the player can see is enterable; each building's
interior comes from its own dedicated room file with multiple distinct rooms,
furniture (feeds feature 3), lights, and spawn/exit points.

**Current state**: all buildings in `src/world.js` are exterior shells (glass door
planes, signs, colliders). No interior geometry, no rooms, no scene transitions.

**Decisions**:

- **D1 — One ES module per building** under `web-openworld-game/src/interiors/`:
  `courier.js`, `security.js`, `cab.js`, `dealer.js`, `garage.js`, `diner.js`,
  `cargo.js`, `tech.js`, `realty.js` (feature 10), `fuelKiosk.js`, `apartmentA.js`,
  `apartmentB.js`, `office.js`, plus `genericLobby.js` as the fallback so **every**
  building (including decorative skyline towers) resolves to an interior. Each file
  default-exports:
  ```js
  { id, name, spawn: {x, z, yaw}, rooms: [ {name, walls:[…], floor, furniture:[…], lights:[…]} ] }
  ```
  No build step: plain ES modules imported by an index that maps buildingId → module.
- **D2 — Portal transition, not teleport.** Each door is a trigger plane (the existing
  glass-door position). Crossing it while walking in → fade (0.3 s), exterior group
  hidden, interior group shown (built lazily on first entry, cached; disposed on
  reset), player moved to `spawn`, world bounds swapped, exit door at the opposite
  side. Re-crossing exits. Cars cannot enter (doors are pedestrian).
- **D3 — Perf budget**: ≤ ~300 meshes per interior, shared materials, no per-interior
  real-time lights beyond 2 (rest are emissive materials + baked-looking gradient
  floor); the exterior scene's draw call count is unchanged while inside (exterior
  group visible=false).
- **D4 — Rooms are real subdivisions**: e.g. dealer = showroom + office + back lot;
  apartment = living/bedroom/kitchen/bath; skyline tower = lobby + floor of offices.
  Wall colliders keep the player inside rooms; doors between rooms are openings, not
  triggers.
- **D5 — Every building on the 16 blocks gets a room file** (the 8 named ones above
  cover stations/dealer/4 lots; the remaining blocks + towers use `genericLobby` with
  per-building name/colour params until custom files replace them — the file format
  is what makes them swappable without code changes).

**Prompt**:

```
Context: MetroVenture 3D — see UPGRADE_PLAN.md §0. This is feature 7/8, milestone
M5a. Feature 3's furniture types are consumed here; feature 10 adds realty/apartment
listings on top.

A. Room file format (src/interiors/ — new directory + index.js):
   - Default export shape per D1 above. Walls: [x, z, w, d] boxes; floor: {x, z, w,
     d, color, texture?}; furniture: feature-3 item entries {type, x, z, rot}; lights:
     ≤2 real point lights per interior + arbitrary emissive fixtures.
   - index.js: BUILDING_INTERIORS = { courier: () => import('./courier.js'), …,
     _default: () => import('./genericLobby.js') } — dynamic import keeps initial
     page load unchanged (no build step; GitHub Pages serves the modules fine).

B. world.js:
   - Building registry: every exterior building built by world.js registers
     { id, door: {x, z, nX, nZ}, interior: <key into index.js>, level? } (stations,
     dealer, 4 lots, fuel kiosks, skyline towers).
   - Door triggers: an interactable marker at each door (E = enter; walking into the
     door while moving also enters after a 0.3 s cross threshold — no accidental
     re-entries).
   - buildInterior(key): fetch module, construct a THREE.Group from the room file
     (reuse the world.js box()/sign() helpers via a small shared builder exported
     from world.js), add furniture via src/furniture.js, register AABB colliders for
     interior walls, set interior floor y so the transition is seamless (exterior
     ground = interior floor).
   - Scene swap per D2: game.setInterior(exteriorKey) / game.exitInterior() with
     fade; camera follow clamp swapped to the interior bounds; minimap shows a
     "you are inside" state (small room outline).
   - Exit: E at the interior door / walking out through it → back to exterior at the
     door position, exterior re-shown.

C. The named interiors (build all, in this order):
   1. courier.js — depot floor (parcels on shelves), dispatch desk, break room (tap,
      chairs), office (desks).
   2. security.js — HQ lobby, briefing room (table + chairs), ops wall (emissive map),
      lockup (decor).
   3. cab.js — dispatch board, driver benches, radio desk.
   4. dealer.js — showroom (the 6 VEHICLE_MODELS as static display cars on turntables
      = slow-rotating groups), sales office, back lot (your parked cars visible
      through the glass).
   5. garage.js (Apex, if built) — bays with lifts, tools, parts shelves; this is
      where feature 4's repair modal's "work" happens.
   6. diner.js (Metro Fresh, if built) — counter, 4 stools, 6 tables, kitchen (fridge,
      stove = decor), takeaway window (the feature-3 food vendor modal lives here).
   7. cargo.js (SwiftCargo, if built) — parcel wall, scales, office.
   8. tech.js (ByteForge, if built) — server room (emissive racks), open desks,
      lounge.
   9. fuelKiosk.js — small: counter, fridge (real, feature 3), office nook.
   10. genericLobby.js — parameterised (name, colours, floors): lobby + 1 office
      floor; used by skyline towers and remaining blocks.
   Buildings behind unbuilt lots (5–8) resolve to genericLobby with a "VACANT LOT —
   under construction" floor sign until the lot is bought (then the real file).

D. Audio: interior ambience per room type (low fan hum in tech, kitchen clatter in
   diner, city muffle when inside), crossfaded with the swap; door whoosh.

E. Debug: window.__mv.interior = { enter(key), exit(), current } — QA can enter any
   interior from the console.

Acceptance:
   - Count check: every exterior building the player can see (walk the whole city,
     16 blocks + towers) has a working door prompt — zero dead ends.
   - Each named interior has ≥2 distinct rooms with wall colliders the player cannot
     clip through.
   - First entry loads the module (network panel shows the fetch), second entry is
     instant (cached); exiting and re-entering another building works in any order.
   - Draw calls: interior scenes ≤ 300 meshes (log via window.__mv stats hook).
   - Furniture from feature 3 works inside (sit in diner stool, eat from kiosk fridge).
   - Cars cannot pass through doors; parked view-through-glass works in dealer.
   - Save while inside: on load the player is at the exterior door (not inside) —
     document that choice in README.
   - npm test; dev:offline works; no new dependencies.
```

**Acceptance checklist**: 100% of visible buildings enterable · per-building room files
(format + 10 named + generic fallback) · portal transitions with fade · room
subdivisions + colliders · lazy load/cache/dispose · perf budget · save/exit rule ·
debug hooks.

---

## 9. Real-Time Vehicle Telemetry

**What ships**: live readouts of tire health, engine condition, fuel and HP on the
in-vehicle HUD, warnings at thresholds, and the full shop-side breakdown in the
garage/garage-and-inventory modals.

**Current state**: `#vehicle-hud` shows speed + car name. Feature 4 produces the data
(`cond` on each vehicle at 2 Hz).

**Decisions**:

- **D1 — Four horizontal bars** (HP 🛡 / FUEL ⛽ / TIRES 🛞 / ENGINE ⚙) under the speed
  readout, 2 Hz refresh, colour green → amber (<50) → red (<25) with a pulse at <25.
- **D2 — Warning ladder**: toast at 50 and 25 per bar (one per crossing, re-arms on
  repair), horn-blink if fuel < 10 while driving, "ENGINE FAULT" banner at engine < 20.
- **D3 — Shop view**: the mechanic modal (feature 4) and the Garage & Inventory modal
  (feature 5) render the same data as itemised rows with repair actions — one shared
  `renderVehicleCard(veh)` helper so both stay in sync.
- **D4 — No new networking** in this feature (local data; a `wrecked` flag sync is a
  documented follow-up, not part of this prompt).

**Prompt**:

```
Context: MetroVenture 3D — see UPGRADE_PLAN.md §0. This is feature 9, milestone M2b
(feature 4 must be merged).

A. HUD (index.html + game.js):
   - #vehicle-hud: add the four bars (D1) with the glass style; update at 2 Hz from
     game.vehicles[i].cond; hidden when on foot (existing behaviour).
   - Warning ladder D2 with the existing toast() (variants: 'warn', 'danger').
   - Fuel < 10 while driving: fuel icon blinks + soft repeating tick SFX (max 3 s).
   - Engine < 20: "ENGINE FAULT — service soon" banner under the bars; the car's
     exhaust smoke (cheap quad puff) becomes visible — a telegraph that the physics
     already models via the feature-4 maxSpeed cut.

B. Shared renderer (game.js or a small src/vehCard.js):
   - renderVehicleCard(veh, { interactive: true|false }) used by: mechanic modal
     (feature 4), Garage & Inventory (feature 5), valet confirm screen. Row per bar
     + numeric % + last-service day (state.vehicles[*].lastServicedInGameMs, set by
     any repair, default 0).

C. Debug: window.__mv.telemetry = () => snapshot of all owned vehicles' cond.

Acceptance:
   - Bars move in real time while driving (watch fuel tick at 2 Hz); colours switch at
     50/25 exactly (console-driven cond values).
   - Each toast fires once per crossing and re-arms after repair.
   - Fuel < 10: blink + tick SFX; engine < 20: banner + smoke.
   - Mechanic modal and Garage & Inventory show identical numbers for the same car.
   - No HUD jitter at 2 Hz (bars use CSS transitions, not per-frame writes).
   - npm test (pure parts: warning-ladder state machine in src/vehCard.js, tested).
```

**Acceptance checklist**: 4 live bars · colour/pulse thresholds · warning ladder with
re-arm · engine-fault telegraph · shared vehicle card renderer · 2 Hz without jitter ·
pure-logic tests.

---

## 10 & 11. Real Estate Agency + Dynamic Time System

**What ships**: (11) the 24× in-game clock with day/night visuals and a server-side
clock for multiplayer; (10) a real estate agency where players buy/sell/rent
apartments and offices with weekly leases, secured by property keys.

**Current state**: `stats.day` counts 30 s paydays; no day/night; `PAYROLL_INTERVAL =
30`; no property system; no server clock (MULTIPLAYER.md §8 already designates the
clock as the next server step).

**Decisions**:

- **D1 — Clock ownership.** Single-player: client clock with
  `state.clock = { realBase (epoch ms), inGameBase (in-game ms), speed: 24 }`;
  `inGameNow = inGameBase + (Date.now() - realBase) × 24` → offline time passes on
  load (documented approximation). Multiplayer: the **clock is the first server
  authoritative service** — a Durable Object alarm (`city-clock` in the same worker,
  or a second DO) ticks every 30 real seconds, broadcasts `clock { inGameMs, day,
  hhmm }`; clients render from it and reconcile on `welcome.clock` + `restore`.
  The DO alarm keeps it alive on the free tier only while a room has sockets
  (hibernation pattern from city-room.js — no wasted wakeups).
- **D2 — Day/night visuals (1 real hour per in-game day → a full day/night cycle per
  real hour):** sun direction + sky colour ramp (dawn 06:00, noon 12:00, dusk 18:00,
  midnight), ambient light level, street lamps (new world.js props at road
  intersections, emissive + ≤8 real lights pooled), car head/taillights (emissive
  cones; only the player's car gets a real light, traffic uses emissive only — perf),
  building window glow via the existing window textures (emissive at night), fuel
  station signs glow at night.
- **D3 — Realty data**:
  - `state.realty = { listings: [ { id, kind: 'apartment'|'office', buildingId,
    unit, label, price, rentPerWeek, ownerId: null|playerId, tenantId: null,
    leaseEndsInGameMs: null } ], }` seeded with 6 apartments (2 blocks converted to
    residential interiors from feature 7/8) + 2 offices + 2 "premium" penthouses
    unlocked when City Employment ≥ 6/12.
  - Buy: price (apartments $4k–15k, offices $6k–20k, penthouse $40k). Sell: 90% of
    price back (owner only, and only if unrented or ≥ 3 in-game days to lease end).
  - Rent: rentPerWeek per in-game week (7 real hours); lease auto-renews while cash
    covers it; eviction at 3 in-game days overdue (tenant locked out, items kept).
  - **Property keys (D1 of the keys family)**: owner + active tenant each hold a
    `pkey` inventory item (feature 5's kinds) — required to enter the unit (door
    prompt "🔒 <label> — needs key"); agent issues/reclaims keys on buy/rent/
    eviction.
- **D4 — Agency building**: "Metro Realty" office on an empty block (new
  DEALERSHIP-like data entry `REALESTATE`), interior from feature 7/8 (`realty.js`):
  listings wall (emissive board showing live inventory), agent desk (the modal),
  viewing lounge. The modal: listings grid (kind filter, price, "View" → teleports
  to the door for a walkthrough of empty units, Buy/Rent/Sell/Reclaim-key actions).
- **D5 — Weekly rent & wages use the same clock**: rent due dates, guard wages
  (feature 1), payoff relabel all read `inGameNow` — one time source, no drift.

**Prompt (split into two mergeable tasks — do 11 before 10)**:

```
TASK 11A — In-game clock + day/night (single-player first)

Context: MetroVenture 3D — see UPGRADE_PLAN.md §0. This is feature 11 (single-player
half), milestone M1 — the foundation feature.

A. New src/time.js (pure + thin DOM-free core, tested in tests/time.test.mjs):
   - TimeState { realBase, inGameBase, speed: 24 }
   - inGameNowMs(t, wallNow) ; inGameMinutesPerRealSecond = 0.4
   - clockLabel(inGameMs) -> 'Day 3 · 14:32' ; phase(inGameMs) -> 0..1 with named
     bands (night 20–05, dawn 05–08, day 08–18, dusk 18–20)
   - payroll/shift helper: in-game 12-minute shifts (keeps the existing 30 s cadence
     exactly — relabel only, verify with a test that 30 real s = 12 in-game min).
   - fastForwardTo(t, targetInGameMs) for the sleep time-skip (feature 3).
B. game.js:
   - state.clock created in createInitialState; migrateState for old saves (set
     realBase = now, inGameBase = current stats.day start, speed 24 — a v2 save
     resumes "now" without a time jump).
   - HUD: #hud-day becomes the clock label (Day N · HH:MM), ticked 1 Hz; stats.day
     derived from the clock (keep the field for save compatibility).
   - Payroll timer (stats.payrollTimer) rewritten as "seconds until next 12 in-game
     minute boundary" — identical 30 s cadence, now aligned to the clock.
C. world.js + game.js day/night (D2): sun DirectionalLight orbit, sky/ambient ramp
   table, street lamps at the 25 intersections (pool ≤8 real PointLights, rest
   emissive), headlight/taillight treatment per D2, window emissive at night, fuel
   sign glow (exists after feature 4; guard the reference if absent).
D. Debug: window.__mv.time = { now(), set(inGameMs), phase() } — set() fast-forwards
   for QA.
Acceptance:
   - Clock reads correctly at 24× (verify: 2.5 real min later = 1 in-game hour).
   - Kill the tab, come back: clock jumped by elapsed real time × 24 (v2 save rule).
   - Full day/night in 1 real hour; lamps on at dusk; player car has one real light;
     FPS unchanged within 5% (measure with the __mv stats hook).
   - Payday still every 30 s (test + observed).
   - npm test green.
```

```
TASK 11B — Server clock (multiplayer)

Context: same as above. Milestone M1b, after 11A.

A. server/src/city-clock.js (new Durable Object class in the same worker) or a second
   alarm on city-room: alarm every 30 real s → advance the room clock by 12 in-game
   minutes (30 real s × 24) → broadcast clock { inGameMs, day, hhmm } to the room;
   hibernates when empty (sockets survive, per the existing pattern).
   - welcome gains clock + a monotonic since-join offset so clients reconcile.
   - On first client join to an empty room: clock resumes from the last persisted
     room time (DO storage, one record) — the city's time does not reset per session.
B. net.js: handle clock messages; client prefers server clock over local when
   connected (local fallback when disconnected — documented in MULTIPLAYER.md).
C. Anything in 11A that reads "the clock" now reads a single getClock() that is
   server-sourced when online.
Acceptance:
   - Two tabs agree to the second; kill both, rejoin: time continued (not reset).
   - Offline tab + online tab: on reconnect the offline tab snaps to the server time
     (no negative drift).
   - Empty room hibernates (worker logs show no alarms while idle).
   - smoke.mjs: clock monotonicity across restarts.
```

```
TASK 10 — Real estate agency (milestone M6, after M5a interiors + M3 keys + M1 clock)

A. Data (src/data.js): REALESTATE agency location + listing seed table (D3),
   PROPERTY_KEY item kind already exists (feature 5), rent/sell constants.
B. Pure logic (src/realty.js, tests/realty.test.mjs):
   - buyListing(state, listingId, buyerId) / sellListing / startLease(state,
     listingId, tenantId, inGameNow) / tickLeases(state, inGameNow, cashLookup)
     (auto-renew, overdue → eviction at 3 days) / issueKey / reclaimKey.
   - state.realty seeded on createInitialState for new saves; migrate old saves with
     the seed table (all listings start unowned/available).
C. world.js + interior realty.js: agency building on the chosen block, listings wall
   reflecting live inventory (re-render on change), agent-desk consider() → modal.
D. Agency modal (game.js): listings grid — label, kind, price, rent/week, status
   (Available / Owned by X / Rented to Y until HH:MM). Actions per status:
   Available: Buy | Rent. Owned (mine): Sell (90%) | (unit full interior).
   Rented (mine as tenant): Lease ends in Xd — auto-renew note.
   "View unit" → fade-teleport to the unit door (feature 7/8 portal); unit interiors
   use apartmentA/B/office files; owned units show player-able furniture (feature 3:
   bed sleep, fridge, shower — home base!).
E. Unit doors: pkey required (feature 5 lock UX, kind 'pkey'); agent issues keys on
   buy/lease start, reclaims on sell/eviction; tenant eviction → toast + lock.
F. Server (multiplayer pass, after the single-player core works): listings + leases
   move to the DO (compact JSON, ≤ ~2 KB for the seed table), new messages
   'listing_action' {id, action, to?} validated like feature 5/6; welcome.realty in
   the payload. Single-player stays fully offline-functional.
G. Premium units (D3): unlock when City Employment ≥ 6 — "New listings available"
   toast; drives the tycoon loop.
Acceptance:
   - Buy an apartment: cash debited, pkey issued, unit enterable with key, furniture
     usable (sleep/food/shower), guard assignable to the home (feature 1 hook).
   - Rent a unit as tenant: weekly lease on the server clock; 7 real hours → auto-
     renewal; kill cash → 3 in-game days overdue → eviction, key reclaimed, lock.
   - Sell: 90% back; selling a rented unit refused while < 3 days to lease end.
   - View-unit teleport works for available units (empty shell) and owned units.
   - Two tabs: listing state shared; one buys, other sees "Owned" instantly.
   - Old saves migrate with the full seed table available.
   - npm test green (realty.test.mjs: buy/sell/lease/eviction/clock cases).
```

**Acceptance checklist (11)**: 24× clock (client + server DO) · offline fast-forward
· day/night visuals with perf budget · payday cadence unchanged · one `getClock()`
source. **(10)**: agency building + interior · seed listings + premium unlock ·
buy/sell/rent/eviction on the clock · pkey lock · server sync for multiplayer ·
tests.

---

## M. Recommended build order (milestones)

Aligned with MULTIPLAYER.md §8 ("where this fits the bigger plan"): the clock first,
keys after the clock, interiors before real estate, guards last (they consume clock +
property + emotes).

| Milestone | Features | Why this order |
|---|---|---|
| **M1** | 11A client clock + day/night · 11B server clock DO | Foundation: wages (1), needs (3), rent (10), wear pacing (4) all read the clock. |
| **M2** | 4 vehicle damage/fuel/wear · 9 telemetry · 3 fuel stations | Self-contained, single-player, big gameplay impact, no new entities. |
| **M3** | 5 ownership + inventory · 6 key transfer | Server records needed by 10 and 1; keys need the clock (lease/record times). |
| **M4** | 2 emotes + jump (client + `pos.emote`) | Independent, fun, small; does not block anything. Can slip anywhere. |
| **M5a** | 7/8 interiors: format + stations/dealer/lots/fuel kiosks/generic | Furniture (3) and realty (10) need enterable spaces. |
| **M5b** | 3 furniture + needs (uses M5a interiors + M3 inventory food) | Depends on interiors + clock + inventory. |
| **M6** | 10 real estate (single-player core → server pass) | Consumes clock + keys + apartment interiors. |
| **M7** | 1 AI security (single-player) · 7b server-recorded player-employed guards | Consumes clock, property, emotes, inventory; player-employer mode needs the server economy pass. |

Parallelism notes: M4 can run in a separate branch anytime; M2 and M4 are fully
independent; M5b's needs system can be developed against a test interior before all
buildings are done.

### Known open items (deliberately NOT in scope of the 11 prompts)

- **PvP combat with damage** (guards are soft-combat per D1 of feature 1) — needs a
  whole combat system; re-open as feature 12.
- **Server-side movement validation / anti-cheat** (MULTIPLAYER.md §6, "phase 7").
- **Cloud save** beyond the existing DO position restore.
- **Synced traffic/citizens** (host-authority world sim) — a separate design step.
- **More city blocks / districts** — the room-file format (7/8) is what makes this
  cheap later.

### Decision log (veto any of these before build starts)

| # | Decision | Where |
|---|---|---|
| D1 | Guards do soft combat (advance/point/alarm/slow), no damage | §1 |
| D1 | Speeds in code are m/s; "30" in the plan = 30 km/h ≈ 8.33 m/s damage threshold | §0, §4 |
| D2 | Fuel tank 0–100, per-model consumption, instant 2 s fill | §4 |
| D3 | Jump is cosmetic (flat city) | §2 |
| D3 | Collapse (not death) at 0 health; respawn at home + fine | §3 |
| D4 | Sleep = time skip to a chosen wake time | §3 |
| D1 | Server is authority for vehicles/keys/property; client owns local state | §5, §10 |
| D1 | Clock: client 24× with offline fast-forward; server DO when online | §11 |
| — | Payday stays 30 s, relabelled "12 in-game minute shift" | §11 |
| D5 | Save while inside a building → load at the exterior door | §7/8 |

---

*Generated for the `EasyPay-ng/gta-benz` repo (branch work happens in Arena sessions).
Each prompt is self-contained: paste the Context line + prompt block + the §0
conventions into a dev session and it has everything it needs.*
