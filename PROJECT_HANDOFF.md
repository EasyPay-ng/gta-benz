# MetroVenture 3D: Project Handoff

## Vision
A GTA-style 3D open-world sandbox mixed with an occupation & startup tycoon. The player:
1. works starter jobs to earn seed money,
2. buys vacant lots to launch startups, each of which unlocks a new occupation,
3. hires the city's 12 unemployed citizens to raise **City Employment** and earn passive profit,
4. upgrades buildings (+2 job slots per level) and buys cars to get around faster.

Web-first (Three.js + vanilla JS, no build step) with `localStorage` saves, deployable to GitHub Pages.

## Current state (branch `arena/c5aea0ad-gta-benz`)
Everything lives in `web-openworld-game/`. See `README.md` for controls and file layout.

| System | Where | Notes |
|---|---|---|
| Data / tuning | `src/data.js` | jobs, ranks, startups, stations, vehicles, colours, map grid |
| Economy (pure) | `src/economy.js` | buy/upgrade/hire/payroll/collect/tasks/vehicles/migrate; tested in `tests/` |
| Characters | `src/character.js` | shared rig; `setAppearance`, `setOccupation` (uniform + headgear), poses: stand/work/sit/dive |
| City | `src/world.js` | roads at x/z ∈ {-150,-75,0,75,150}; 16 blocks; sidewalk nav graph + BFS; AABB colliders; lot visuals per level |
| Vehicles | `src/vehicles.js` | `Vehicle` (player physics), `TrafficCar` (lane-following AI), `buildCarMesh` |
| Game | `game.js` | input, camera, enter/exit/valet, citizens AI, tasks, modals, HUD, minimap, audio, save/load |

**Save key:** `metroventure_openworld_save_v1`, version 2. `migrateState()` fills in defaults for older or partial saves.

**Debug:** `window.__mv` exposes the live game object (state, player, vehicles, citizens, traffic).

### The Unity C# reference scripts aren't in this repo
The original summary mentioned `gta-occupations-unity/` C# scripts. They weren't in this repo when work started and haven't been recreated yet.

## Ideas for next steps
- Bigger city with districts, plus day/night cycle with street lights and car headlights
- Custom startup builder (choose type, name and colours on any lot)
- Fuel, repairs at Apex Auto Garage, and vehicle damage
- Business events (rush hour, inspections), wage negotiation, citizen happiness
- Missions or story chain, police heat/wanted level (GTA flavour)
- Optional cloud save (Firebase / Supabase) on top of localStorage
- Unity port using the data model in `src/data.js` + `src/economy.js`
