# MetroVenture 3D (gta-benz)

A GTA-style **3D open-world occupation & startup tycoon** that runs in the browser. Built with Three.js and plain HTML/CSS/JS. There's no build step and no backend: progress is saved in `localStorage`, and the game deploys to GitHub Pages.

**Work jobs → buy vacant lots → launch startups → hire unemployed citizens → raise city employment → drive it all in your own cars.**

## Play locally

```bash
npm start            # = python3 -m http.server 8080 --directory web-openworld-game
# open http://localhost:8080
```

Any static file server works. ES modules don't load from `file://`, so you can't just double-click `index.html`.

## Multiplayer (optional, free)

The game is single-player by default and stays that way unless it finds a server.

```bash
npm run dev          # game + city server on http://localhost:8080
npm run dev:offline  # game only
```

Players sign in with a **display name and a PIN** (no email), so a name stays theirs
across sessions and devices; guests can play without one. Open two tabs on the same
machine — use two browsers or a private window, since one browser holds one session —
and you will see each other walking, driving and on the minimap. The server is a Cloudflare Worker + Durable Object that fits inside the
Workers free plan (no card, no bill); `npm run deploy`-style instructions, the protocol,
the cost maths and the honest list of what is *not* synced yet are in
[`MULTIPLAYER.md`](MULTIPLAYER.md).

Point a deployed game at a deployed server once:

```
https://easypay-ng.github.io/gta-benz/?server=wss%3A%2F%2F<worker>.<subdomain>.workers.dev%2Fws%3Froom%3Dmetro-1
```

## Controls

| On foot | Driving & Street Heat |
|---|---|
| `WASD` / arrows: move · `Shift`: sprint | `W`/`S`: gas, brake & reverse · `A`/`D`: steer |
| Mouse drag, `Q`/`R`: orbit camera · wheel: zoom | `Space`: handbrake (drift & twin tyre skids!) · `G`: horn |
| `E`: interact · `Space`: jump | `E`: complete waypoints / stalled-car assist |
| `B` or `1`–`8`: character actions, greetings & dances | `F`: exit · `T`: Garage & Roadside Assist |
| `F`: get in/out of your car · `V`: valet (calls your last car) | High-speed hits & explosions raise **Police Heat (`★`–`★★★`)** — outrun cruisers to cool down |
| `T`: Garage & Roadside Assist · `C`: character creator · `H`: help · `M`: mute | `F5`: save · `F9`: load (also autosaves) |

On touch devices you get an on-screen joystick and buttons.

## Features

- **Realistic PBR visuals & atmospheric city.** Procedural diffuse, normal, roughness and emissive PBR maps (`src/textures.js`) with ACES Filmic tone mapping, PMREM environment reflections and a custom atmospheric `SkyDome` shader (dawn/sunset horizon scatter, drifting clouds and twinkling night stars). Features tyre-polished weathered asphalt, irregular flagstone sidewalks, curb storm drains, 6 brick/limestone/glass-curtain architectural facades, multi-cluster avenue trees and soft additive streetlamp & vehicle lens flares.
- **Open-world city & 24× day/night cycle.** A 4×4 block grid with named streets, zebra crossings, skyline towers, parks, outskirts and a live minimap. In-game time runs at **24× real time** (`1 real hour = 24 in-game hours`, shown as `Day N · HH:MM`), with an orbiting sun, 25 intersection street lamps, glowing building windows & fuel canopies, and car headlights/taillights at night. Online rooms sync to a shared server clock.
- **Sculpted 3D humanoids, jumping & expressive emotes.** Anatomically proportioned characters with 2-segment articulated arms and legs (elbows & knees), sculpted sneakers, facial features, 5 hair styles, 3 body builds and automatic job uniforms/headgear. Supports biomechanical walk/sprint cycles, **vertical jump physics (`Space`)**, and **8 expressive emotes & dances (`B` / `1`–`8`)** — Wave, Respect Greet, Applause, Celebrate, Flex, Afro-Groove, Robot and Street Shuffle — synced live to nearby multiplayer peers.
- **Occupations with ranks.** Pay rises 15% per rank, from Trainee up to Legend.
  - Starter jobs: *Express Courier* (parcel deliveries), *City Security Officer* (3-checkpoint patrols), *Metro Cab Driver* (needs a car; pick up and drop off passengers; taxis earn +30%).
  - Startup jobs: *Master Mechanic*, *Head Line Chef*, *Fleet Dispatcher* (includes cargo delivery runs), *Software Engineer*.
- **Startups.** Four buildable lots: Apex Auto Garage, Metro Fresh Diner, SwiftCargo Logistics Hub and ByteForge Tech. Each starts with 3 job slots and gains +2 per upgrade, up to level 5. The building grows with each level. Shift payouts run every 12 in-game minutes (30 real s: revenue − wages).
- **Hiring.** Talk to unemployed citizens, or use "Hire nearest citizen" in the startup menu. Hired citizens put on your uniform, walk to your business along the sidewalks and work there.
- **Sculpted clearcoat vehicles, Street FX & Police Heat.**
  - Bevelled `ExtrudeGeometry` car hulls & greenhouses with metallic clearcoat PBR paint, 5-spoke alloy rims, brake rotors, spoilers/hood scoops, xenon headlights and crimson tail-lamp bars.
  - **Street FX (`src/fx.js`):** persistent twin black rubber tyre skid marks & drift smoke, velocity-streaked orange collision sparks, and dramatic wreck explosions with expanding fireballs, ground scorch decals, flickering flames and towering dark smoke plumes.
  - **Wanted Street Heat & Police Interceptors (`src/heat.js`):** reckless high-speed traffic crashes, pedestrian scares or car explosions raise **Police Heat (`★☆☆`–`★★★`)** and dispatch pursuing **Metro Police Interceptors** with flashing red/blue LED lightbars and wail sirens. Break line-of-sight to cool down and evade, or pay a ticket fine if boxed in and busted.
  - Metro Motors sells a sedan, taxi, pickup, van and the *Benz V12 Sport*, each with a colour picker; the valet (`V`) brings your car to the nearest curb.
- **Live vehicle telemetry, wear & roadside assist.** Every car tracks body `HP`, `FUEL`, `TIRES` and `ENGINE` on a live 4-bar dashboard HUD (`green → amber <50% → pulsing red <25%`).
  - Impacts above 30 km/h dent the body (harder hits hurt more, up to 40 HP per crash); slow scrapes nick it.
  - Fuel drains as you drive — below 10% the fuel icon blinks with a soft reserve tick; run dry and the engine stalls. Top up at **Lagoon Fuels**, **Harbor Fuels** or **Metro Fuels** (`F` on the minimap).
  - Tyres and the engine wear with distance; worn tyres slide, and an engine below 20% triggers an `ENGINE FAULT` banner, exhaust smoke and limp-home speed.
  - At 0 HP the car is **wrecked** and smokes until towed or repaired.
  - **Shop & Roadside service:** visit **Metro Motors' mechanic** (+20% city rates) or your **Apex Auto Garage** (house rates), OR press **`T`** anywhere (or **`E`** beside a wrecked/stalled car) to open **Garage & Roadside Assist** and call a tow ($250), dispatch a mobile mechanic ($150 call-out + parts), or buy an emergency +35% fuel can ($95).
- **AI traffic.** 12 cars drive right-hand lanes across the grid and brake for pedestrians, cars and you. They honk if you block them.
- **Save system.** `localStorage` key `metroventure_openworld_save_v1`. Stores cash, look, job XP, startups, employees, vehicles and positions.

## Project layout

```
web-openworld-game/
  index.html          HUD, modals, character creator, help, touch controls
  style.css           glassmorphism UI
  game.js             entry: renderer, loop, player, citizens, tasks, UI, save/load
  src/data.js         all tunable data (jobs, startups, vehicles, clock, telemetry, emotes, heat)
  src/time.js         pure 24× city clock, day/night lighting & shift boundaries
  src/economy.js      pure game-state logic & save migrations (unit-tested, no DOM)
  src/vehicleCond.js  pure vehicle wear, damage, shop & roadside repair quotes
  src/vehCard.js      telemetry tiering, warning ladder & shared vehicle card renderer
  src/heat.js         pure wanted street-heat stars, pursuit escalation, evasion & bust logic
  src/textures.js     procedural PBR diffuse/normal/roughness/emissive maps, PMREM & SkyDome
  src/fx.js           pooled twin tyre skid marks, crash sparks, scorch decals & wreck fire/smoke
  src/character.js    sculpted 2-joint humanoid rig, outfits, jump physics & 8 procedural emotes
  src/world.js        PBR procedural city, street lamps, night glow, nav graph, collisions
  src/vehicles.js     sculpted clearcoat cars, 5-spoke rims, light flares, AI traffic & PoliceCar
  vendor/three.module.min.js   Three.js r170 (vendored, MIT)
  src/net.js          multiplayer transport (reconnect, 10 Hz send, 5 Hz playback, clock & emote sync)
  tests/              Node unit + Three.js scene-graph tests (economy, time, vehicleCond, vehCard, heat, realism)
server/               free multiplayer server (Cloudflare Worker + Durable Object)
tools/                dev server + /ws proxy used by `npm run dev`
.github/workflows/pages.yml   test + deploy to GitHub Pages on push to main
```

## Roadmap

The 11-point upgrade plan (security operatives, emotes, needs, vehicle damage & fuel,
vehicle keys, enterable buildings, telemetry, real estate, day/night clock) is
formatted into detailed development prompts in [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) —
including build order (milestones M1–M7) and a decision log.

## Tests

```bash
npm test
```

## Deploy to GitHub Pages

In **Settings → Pages**, set **Source** to **GitHub Actions**. Every push to `main` runs the tests, then publishes `web-openworld-game/`.
