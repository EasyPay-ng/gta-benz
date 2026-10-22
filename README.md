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

| On foot | Driving |
|---|---|
| `WASD` / arrows: move · `Shift`: sprint | `W`/`S`: gas, brake & reverse · `A`/`D`: steer |
| Mouse drag, `Q`/`R`: orbit camera · wheel: zoom | `Space`: handbrake (drift) · `G`: horn |
| `E` / `Space`: interact | `E`: complete waypoints |
| `F`: get in/out of your car · `V`: valet (calls your last car) | `F`: exit |
| `C`: character creator · `H`: help · `M`: mute | `F5`: save · `F9`: load (also autosaves) |

On touch devices you get an on-screen joystick and buttons.

## Features

- **Open-world city.** A 4×4 block grid with named streets, zebra crossings, skyline towers, parks, outskirts and a live minimap.
- **Modular 3D humanoids.** The player and 12 citizens share one rig: skin tone, clothes, 5 hair styles and 3 body builds. Uniforms and headgear (cap, peaked cap, hard hat, chef hat, visor, beanie, flat cap) swap automatically by occupation.
- **Occupations with ranks.** Pay rises 15% per rank, from Trainee up to Legend.
  - Starter jobs: *Express Courier* (parcel deliveries), *City Security Officer* (3-checkpoint patrols), *Metro Cab Driver* (needs a car; pick up and drop off passengers; taxis earn +30%).
  - Startup jobs: *Master Mechanic*, *Head Line Chef*, *Fleet Dispatcher* (includes cargo delivery runs), *Software Engineer*.
- **Startups.** Four buildable lots: Apex Auto Garage, Metro Fresh Diner, SwiftCargo Logistics Hub and ByteForge Tech. Each starts with 3 job slots and gains +2 per upgrade, up to level 5. The building grows with each level. Payday comes every 30 s (revenue − wages).
- **Hiring.** Talk to unemployed citizens, or use "Hire nearest citizen" in the startup menu. Hired citizens put on your uniform, walk to your business along the sidewalks and work there.
- **Vehicles.**
  - Arcade physics with handbrake drifts, collisions, steering wheels and brake lights.
  - Your character sits in the driver's seat; cab passengers ride beside you.
  - Metro Motors sells a sedan, taxi, pickup, van and the *Benz V12 Sport*, each with a colour picker.
  - The valet brings your car to the nearest curb.
- **Cars wear out.** Every car has body HP, a fuel tank, tyre and engine condition.
  - Impacts above 30 km/h dent the body (harder hits hurt more, up to 40 HP per crash); slow scrapes nick it.
  - Fuel drains as you drive — top up at **Lagoon Fuels**, **Harbor Fuels** or **Metro Fuels** (marked `F` on the minimap). Run dry and the engine stalls where you are.
  - Tyres and the engine wear with distance; worn tyres slide, a tired engine limps home at reduced top speed.
  - At 0 HP the car is **wrecked**: it smokes until a mechanic tows it in ($250) and repairs it.
  - Repairs: **Metro Motors' mechanic** (city rates, +20%) or your own **Apex Auto Garage** service bay (house rates) once you've built it.
- **AI traffic.** 12 cars drive right-hand lanes across the grid and brake for pedestrians, cars and you. They honk if you block them.
- **Save system.** `localStorage` key `metroventure_openworld_save_v1`. Stores cash, look, job XP, startups, employees, vehicles and positions.

## Project layout

```
web-openworld-game/
  index.html          HUD, modals, character creator, help, touch controls
  style.css           glassmorphism UI
  game.js             entry: renderer, loop, player, citizens, tasks, UI, save/load
  src/data.js         all tunable data (jobs, startups, vehicles, map constants)
  src/economy.js      pure game-state logic (unit-tested, no DOM)
  src/character.js    modular humanoid rig + outfits + animation
  src/world.js        procedural city, lots, stations, sidewalk nav graph, collisions
  src/vehicles.js     car meshes, driving physics, AI traffic
  vendor/three.module.min.js   Three.js r170 (vendored, MIT)
  src/net.js          multiplayer transport (reconnect, 10 Hz send, 5 Hz playback)
  tests/economy.test.mjs
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
