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

| On foot | Driving, 3D Cockpit & Street Heat |
|---|---|
| `WASD` / arrows: move · `Shift`: sprint | `W`/`S`: gas, brake & reverse · `A`/`D`: steer |
| `X` / `P` (or HUD `🎥`): toggle **1st-Person** / **3rd-Person** camera | `X` / `P` (or HUD `🎥`): toggle **Outside Chase** / **3D Cockpit Interior** |
| Mouse drag, `Q`/`R`: look / orbit camera · wheel: zoom | Mouse drag, `Q`/`R` in cockpit: look around cabin, mirrors & side windows |
| `E`: interact · open/close doors · use furniture · ride lift · `Space`: jump | `Space`: handbrake (drift & twin tyre skids!) · `G`: horn · `E`: waypoints |
| `B` or `1`–`8`: character actions, greetings & dances | `F`: exit · `T`: Garage & Roadside Assist |
| `U` (or HUD `🎓`): **Metro Grand University** (1,105 courses) | High-speed hits & explosions raise **Police Heat (`★`–`★★★`)** |
| `Y` (or HUD `🏗`): **3D Architect Build Mode** · `E` at a **Metro Lift** to ride floors | `E` place · `X` demolish · `Q`/`R` rotate · `C` colour · `Tab` item · `PgUp`/`PgDn` storey |
| `F`: get in/out of your car · `V`: valet · `T`: Garage · `C`: look · `H`: help · `M`: mute | `F5` save / `F9` load |

On touch devices you get an on-screen joystick and buttons (including `🎥` camera view toggle).

## Features

- **First-Person Street POV & 11 Unique Bespoke 3D Car Interiors (`X` / `P` / `🎥`).** Switch seamlessly at any time between classic Third-Person Orbit/Chase and immersive First-Person (`src/camera.js`, persisted in save v7):
  - **On-foot First-Person:** eye-level street perspective scaled to your character's body build with natural walk/sprint head-bob, responsive pitch/yaw freelook and WASD strafing — hiding your own head/hat/shades so nothing clips your vision while your 3D outfit, jacket/tunic, chains, swinging arms, carried courier parcels, legs and footwear remain visible when looking down.
  - **11 Unique 3D Car Cockpit Interiors & Live 3D Mirrors (`src/vehicles.js`):** every single vehicle model has its own distinct 3D cabin architecture, unique steering wheel geometry, unique 12 Hz instrument cluster theme, bespoke center console & signature equipment — *Rusty Hatchback* (2-spoke commuter wheel, amber twin-needle analog dials, green Single-DIN FM radio, manual stick + clutch pedal & swinging pine-tree air freshener), *City Sedan* (walnut burl woodgrain, gold analog dash clock & ivory luxury cluster), *Metro Cab* (dash-top digital `FARE $ · HIRED` meter, yellow dispatch console & CB radio handset), *Workhorse Pickup* (4-spoke heavy-duty truck wheel, A-pillar grab handles, column shifter + floor 4WD `2H/4H/4L` transfer lever), *Cargo Van* (walk-through flat floor, steel rear cargo bulkhead with mesh window, overhead parcel shelf & delivery manifest clipboard), *'69 Stallion GT* (drilled 3-spoke mahogany wood-rim wheel, twin chrome gauge pods, 3 dash auxiliary pods, vintage push-button AM radio & white cue-ball Hurst shifter), *Benz V12 Sport* (flat-bottom AMG wheel with red 12-o'clock stripe, frameless panoramic widescreen & turbine vents), *Aero Spider Convertible* (open-air cockpit, body-coloured center spine, yellow center-tach & dash-top Chronosport stopwatch), *Benz G-Wagen 4×4* (passenger off-road grab handle, 3 chrome diff-lock switches & inclinometer display), *Valkyrie X12 Hypercar* (open-top rectangular carbon F1 yoke with 8 shift LEDs + rotary manettino dials, 4-point red racing harnesses & V12 G-force telemetry), and *Metro Police Interceptor* (swivel ruggedized MDT police laptop, dash-top Doppler radar gun, siren controller & steel prisoner partition cage) — all paired with **real-time live 3D planar reflections** on the **Center Rearview Mirror** and **Left & Right Side Wing Mirrors** plus **seated 3D driver legs & shoes**.

- **Metro Grand University — Huge Walk-In 3D Campus & 1,105 Real-World Academic Courses (`U` / `🎓` / `src/university.js`).** Located just North of `1st St` (`U` on the minimap), the monumental `160 m × 76 m` campus features a wrought-iron entrance archway, Honor Quad marble fountain, and **3 physically enterable walk-in 3D halls** playable seamlessly in **both 1st-Person and 3rd-Person** (with automatic indoor 3rd-person ceiling camera clamping):
  - **Walk-In 3D Halls:** stroll straight through open double-doors into the **Chancellor's Clocktower & Lecture Rotunda** (Admissions desk, Diploma Wall, tiered lecture benches, resident Professor in cap & gown, and a **giant live-updating 3D Amphitheatre Smartboard** synced to the 24× city clock), the **West Grand Library** (3D mahogany bookstacks & green banker's reading lamps), and the **East Science, AI & Medical Hall** (laboratory benches & server racks).
  - **1,105 Real-World Academic Courses across 12 Faculties:** browse and instant-search recognizable programs across *Computer Science, AI & Cybersecurity*, *Engineering & Architecture*, *Medicine, Nursing & Public Health*, *Business, Finance & Economics*, *Law, Criminology & Public Policy*, *Natural & Physical Sciences*, *Media, Design & Performing Arts*, *Humanities & Social Sciences*, *Education*, *Agriculture & Environmental Science*, *Aviation, Maritime & Logistics*, and *Culinary, Automotive & Applied Trades* — from **$0 Free Undergraduate Certificates** up to **BSc / BA / BEng / LLB / MBBS / MBA / MSc / PhD** tracks.
  - **Open Enrollment Roleplay + Lectures, Exams & Career Boosts:** freely enroll or switch active majors anytime, carry an official **Student ID & GPA transcript**, attend live campus lectures (`+50%` stipend bonus on campus) or library/lab study sessions to earn credits, and pass **3-question faculty final exams** to earn official Degrees, cash Fellowship Grants, **automatic Graduation Gown & Mortarboard Cap unlocks** in your Wardrobe, and **permanent career & startup revenue multipliers** (up to `2.25×`).

- **Every Building Is Walk-In — Multi-Storey Skyscrapers with Working Metro Lifts (`src/world.js`, `src/interiors.js`).** Walk straight through the open front doors of *every* building in Metro City: the 18 skyline towers (each one is sliced into up to **10 real storeys** plus an open-air **Sky Deck**), the job HQs (Express Courier, City Security, Metro Cab), **Maison Verve**, **Metro Motors**, the four startup lots (garage, diner, logistics, tech) and all three **Metro Grand University** halls.
  - **Real Storeys, Not Fake Backgrounds:** each tower has a walkable slab for every floor, a perimeter with windows, a furnished lobby, a **Metro Lift** core at the corner, and a rooftop parapet so you can stand on the sky deck and look out over the city in 1st or 3rd person.
  - **A Metro Lift on Every Corner (`E`):** press `E` at the glowing lift panel to open the floor directory — *Lobby, Floor 2 · Open-Plan Office, Floor 3 · Boardroom, Floor 7 · Penthouse, Sky Deck…* — and ride instantly. Reception desks inside shops & job HQs (`E`) open the same menus as their street pads, so you can manage your startup, browse Maison Verve or clock in from inside the building.
  - **Every Floor Is Furnished in 3D:** desks & monitors, boardroom tables, sofas, beds, kitchens, pool tables, server racks, lab benches, hospital beds, pallets and planters are generated deterministically per theme (*Corporate, Residential, Grand Hotel, Tech, Medical*), complete with glass window bands, ceiling light panels, lift doors and warm interior lighting. Indoor camera ceilings are clamped automatically for both camera modes.
- **3D Architect — Build & Furnish Mode (`Y` / `🏗`, `src/build.js`).** Raise your own multi-storey structures anywhere in the city, then furnish them:
  - **Structure on a 4 m grid:** marble & hardwood floor slabs, solid walls, window walls, doorway walls, glass curtain walls, **climbable 3D stairs (+1 storey)**, support pillars, glass balcony railings and pitched gable roofs.
  - **Furniture on a 0.5 m grid:** lounge sofas, king beds, executive desks with monitors, dining/conference tables, widescreen TVs, tall bookshelves, warm floor lamps and indoor palms.
  - **Sculpted 3D previews & controls:** a translucent snapping ghost follows your crosshair; `Q`/`R` rotate, `C` cycles 9 architectural colours, `Tab`/`1`–`9` switch pieces, `PageUp`/`PageDown` raise the build plane a storey at a time, `E` places and `X` demolishes. Everything you build is **solid** (walls & furniture collide), **walkable** (floors & stair risers are real surfaces) and **saved** with your game (`SAVE_VERSION = 8`, `state.builds`).

- **Every Piece of Furniture Is Interactive — Wellbeing, Rest & Public Services (`src/props.js`, `src/publicPlaces.js`).** 27 prop types across the whole city respond to `E`: sofas, armchairs, chairs, park/promenade benches, king beds, sun loungers, hospital treatment beds, TV walls, bookshelves, desks, lab benches, kitchens, bars, pool tables, server racks, pianos, sculptures, planters, lamps, reception counters, treadmills, gym benches, dumbbell racks, cinema screens, art frames, dining tables and checkout counters — including **everything you place yourself in 3D Architect mode**.
  - **Real seating & an animation for every action:** the character's hips land on the actual cushion or mattress (sofas, chairs, park benches, beds, hospital beds and sun loungers all use real seat geometry — no more floating or hanging off the edge), and **every prop plays a scripted animation**: drinking at the bar (glass raised, two sips), eating, cooking at the hob, playing the piano (both hands bouncing across the keys), taking a pool shot (lean in, draw the cue, strike), reading with page turns, typing at a desk, running on the treadmill, bench-pressing, dumbbell curls, watering plants, admiring art, using the reception counter and watching TV.
  - **The TV actually shows something:** TV walls and the mall's cinema screen switch on to a live canvas channel (Metro News with a scrolling ticker, sports with a moving ball and scoreboard, a cartoon, or a widescreen film), then switch off when you stand up. Watching from a sofa seats you facing the screen.
  - **Wellbeing:** the prop restores the right wellbeing stat and the camera follows. Live **Wellbeing** HUD row (energy · comfort · hotel key): energy drains as you walk and sprint, and low energy slows your sprint; comfort, health and fitness each have their own effects. Sitting regenerates energy & comfort, beds restore energy overnight, TV/bookshelf/desk hook into leisure & university study, the kitchen feeds you for $12, the bar pours a drink, the server rack pays a freelance bonus, the pool table, piano and gym equipment each have their own verb, and every prop has a cooldown so bonuses can't be farmed.
  - **Reception desks open their real menus:** clock in at the courier/security/cab desks, browse Maison Verve, run your startup, or check in at the hotel — all from inside the building.
- **Every Building Walk-In with Standard Walls & Windows.** Metro Motors' showroom and a new **Fuel & Go** convenience store on each of the three forecourts are now enterable buildings with real doors, reception/counter service and stocking shelves — alongside the towers, job HQs, Maison Verve and university halls. Every walk-in interior is lined with **painted plaster walls, skirting boards, framed windows and a ceiling trim** so rooms look like real rooms from the inside instead of showing the exterior window texture.
- **South Waterfront — Hotel, Hospital, Museum, Mall, Gym & Library District (`src/publicPlaces.js`, `src/world.js`).** A brand-new civic district runs south of `3rd St` (map labels **H A C G L**): the **13-storey Grand Meridian Hotel** (standard $120 / deluxe $260 / penthouse $640 a night — book a room, ride the lift, sleep in a real hotel bed, check out), **Metro General Hospital** (checkup $45, emergency $120, full treatment $260 plus interactive treatment beds), the **Museum of Art** (3 ticket tiers, three galleries and a sculpture court), **Metro Central Mall & Cineplex** (fashion boutiques, a food court of 6 meals & a six-screen cinema), **Metro Iron Fitness Club** (day pass, PT session, protein bar) and **Metro Public Library** (free borrowing, quiet study desks, borrowable books that boost study).
  - **The district is a real place:** a new cross avenue with street lamps, a palm-lined promenade with benches, sun loungers, a lifeguard tower and a sea wall over the beach, all walk-in with openable doors and reception counters.
  - **Denser downtown:** every skyline block now packs a 3×3 parcel of towers, all street-facing, so the skyline and your lift directory grew with it.

- **Realistic PBR visuals & atmospheric city.** Procedural diffuse, normal, roughness and emissive PBR maps (`src/textures.js`) with ACES Filmic tone mapping, PMREM environment reflections and a custom atmospheric `SkyDome` shader (dawn/sunset horizon scatter, drifting clouds and twinkling night stars). Features tyre-polished weathered asphalt, irregular flagstone sidewalks, curb storm drains, 6 brick/limestone/glass-curtain architectural facades, multi-cluster avenue trees and soft additive streetlamp & vehicle lens flares.
- **Open-world city & 24× day/night cycle.** A 4×4 block grid with named streets, zebra crossings, skyline towers, parks, outskirts and a live minimap. In-game time runs at **24× real time** (`1 real hour = 24 in-game hours`, shown as `Day N · HH:MM`), with an orbiting sun, 25 intersection street lamps, glowing building windows & fuel canopies, and car headlights/taillights at night. Online rooms sync to a shared server clock.
- **Sculpted 3D humanoids, Maison Verve Boutique, Personal Wardrobe, jumping & emotes.** Anatomically proportioned characters with 2-segment articulated arms and legs (elbows & knees), facial features, 5 hair styles, 3 body builds and automatic job uniforms/headgear.
  - **Maison Verve Boutique (`B` on minimap) & Wardrobe (`C`):** spend cash on unique 3D garments & accessories — *Streetwear Hoodies* (3D hood + kangaroo pocket + drawstrings), *Varsity Bomber Jackets*, *Executive Suits & Silk Ties*, *Royal Senator / Agbada Tunics* (knee-length drape + 24k gold embroidery), *Sleeveless Jerseys*, *Cargo Pants*, *Summer Shorts*, *High-Tops*, *Combat Boots*, *Penny Loafers*, *Snapbacks*, *Bucket Hats*, *Traditional Fila Caps*, *24k Gold Crowns*, *Aviator / Gold / Cyber Shades*, and *Silver & 24k Gold Cuban Chains* (plus discounted Signature Outfit Bundles). Unlocked items stay in your **Look & Wardrobe (`C`)** forever, and citizens across Metro City wear varied streetwear and traditional outfits too.
  - Supports biomechanical walk/sprint cycles, **vertical jump physics (`Space`)**, and **8 expressive emotes & dances (`B` / `1`–`8`)** — Wave, Respect Greet, Applause, Celebrate, Flex, Afro-Groove, Robot and Street Shuffle — synced live to nearby multiplayer peers.
- **Occupations with ranks.** Pay rises 15% per rank, from Trainee up to Legend.
  - Starter jobs: *Express Courier* (parcel deliveries), *City Security Officer* (3-checkpoint patrols), *Metro Cab Driver* (needs a car; pick up and drop off passengers; taxis earn +30%).
  - Startup jobs: *Master Mechanic*, *Head Line Chef*, *Fleet Dispatcher* (includes cargo delivery runs), *Software Engineer*.
- **Startups.** Four buildable lots: Apex Auto Garage, Metro Fresh Diner, SwiftCargo Logistics Hub and ByteForge Tech. Each starts with 3 job slots and gains +2 per upgrade, up to level 5. The building grows with each level. Shift payouts run every 12 in-game minutes (30 real s: revenue − wages).
- **Hiring.** Talk to unemployed citizens, or use "Hire nearest citizen" in the startup menu. Hired citizens put on your uniform, walk to your business along the sidewalks and work there.
- **Sculpted clearcoat vehicles, Street FX & Police Heat.**
  - Bevelled `ExtrudeGeometry` car hulls & greenhouses with metallic clearcoat PBR paint, 5-spoke alloy rims, brake rotors, spoilers/hood scoops, xenon headlights and crimson tail-lamp bars.
  - **Street FX (`src/fx.js`):** persistent twin black rubber tyre skid marks & drift smoke, velocity-streaked orange collision sparks, and dramatic wreck explosions with expanding fireballs, ground scorch decals, flickering flames and towering dark smoke plumes.
  - **Wanted Street Heat & Police Interceptors (`src/heat.js`):** reckless high-speed traffic crashes, pedestrian scares or car explosions raise **Police Heat (`★☆☆`–`★★★`)** and dispatch pursuing **Metro Police Interceptors** with flashing red/blue LED lightbars and wail sirens. Break line-of-sight to cool down and evade, or pay a ticket fine if boxed in and busted.
  - **Metro Motors Exotic Wing & Custom Mod Shop (`src/customization.js`):** alongside the daily fleet (*Rusty Hatchback*, *City Sedan*, *Metro Cab*, *Workhorse Pickup*, *Cargo Van*, *Benz V12 Sport*), Metro Motors showcases 4 custom-sculpted signature vehicles — the ***'69 Stallion GT*** (fastback muscle coupe with towering chrome blower scoop & ducktail), ***Aero Spider Convertible*** (open-top roadster with frameless windshield, leather bucket cockpit, roll-hoops & visible driver), ***Benz G-Wagen 4×4*** (upright luxury off-roader with chrome bullbar, expedition roof LEDs, side-exit pipes & rear tailgate spare wheel), and ***Valkyrie X12 Hypercar*** (mid-engine wedge with fighter canopy, V12 side scoops, quad cannons & swan-neck carbon GT wing). Open **Metro Customs** (at Metro Motors, from Garage `T`, or with a **25% owner discount** at your **Apex Auto Garage**) to customize clearcoat paint, *Twin Racing Stripes / 24k Gold Stripes / Carbon Aero Hoods*, *Silver / Stealth Black / 24k Gold / Cyber Cyan* 5-spoke rims, and *Street Neon Underglow* — persisted per car and synced live in multiplayer.
- **Live vehicle telemetry, wear & roadside assist.** Every car tracks body `HP`, `FUEL`, `TIRES` and `ENGINE` on a live 4-bar dashboard HUD (`green → amber <50% → pulsing red <25%`).
  - Impacts above 30 km/h dent the body (harder hits hurt more, up to 40 HP per crash); slow scrapes nick it.
  - Fuel drains as you drive — below 10% the fuel icon blinks with a soft reserve tick; run dry and the engine stalls. Top up at **Lagoon Fuels**, **Harbor Fuels** or **Metro Fuels** (`F` on the minimap).
  - Tyres and the engine wear with distance; worn tyres slide, and an engine below 20% triggers an `ENGINE FAULT` banner, exhaust smoke and limp-home speed.
  - At 0 HP the car is **wrecked** and smokes until towed or repaired.
  - **Shop & Roadside service:** visit **Metro Motors' mechanic** (+20% city rates) or your **Apex Auto Garage** (house rates), OR press **`T`** anywhere (or **`E`** beside a wrecked/stalled car) to open **Garage & Roadside Assist** and call a tow ($250), dispatch a mobile mechanic ($150 call-out + parts), or buy an emergency +35% fuel can ($95).
- **AI traffic.** 12 cars drive right-hand lanes across the grid and brake for pedestrians, cars and you. They honk if you block them.
- **Save system.** `localStorage` key `metroventure_openworld_save_v1` (v9). Stores cash, look, job XP, startups, employees, vehicles, positions, every 3D piece you have built (`state.builds`) and your **wellbeing & hotel stay** (`state.leisure`). Old v2–v8 saves migrate automatically with an empty build plot, a fresh wellbeing meter and no booked room.

## Project layout

```
web-openworld-game/
  index.html          HUD, modals, character creator, help, touch controls
  style.css           glassmorphism UI
  game.js             entry: renderer, loop, player, citizens, tasks, UI, save/load
  src/data.js         all tunable data (jobs, startups, vehicles, clock, telemetry, emotes, heat, camera)
  src/camera.js       pure 1st/3rd-person & 3D car cockpit camera state, freelook & world-pose math
  src/university.js   pure 1,105-course catalog across 12 faculties, live campus schedule, exams & pay multipliers
  src/interiors.js    pure multi-storey plans, floor archetypes, lift stops, furniture & interior collision
  src/props.js        pure interactive-furniture catalogue, wellbeing/energy model, cooldowns, swing-door state
  src/publicPlaces.js pure South Waterfront places, hotel booking, hospital, museum, mall, gym & library services
  src/build.js        pure 3D Architect catalog, grid snapping, placement/collision, stairs & save migration
  src/time.js         pure 24× city clock, day/night lighting & shift boundaries
  src/economy.js      pure game-state logic & save migrations (unit-tested, no DOM)
  src/customization.js pure Boutique wardrobe, outfit bundles, vehicle mods & multiplayer vehicle codec
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

The suite covers the pure game logic (economy, clock, telemetry, heat, university, build mode, interiors, furniture/doors, public places, seat geometry & prop animations) plus Three.js scene-graph integration tests for the 11 car cockpits, the walk-in university halls and every walk-in building/lift (headless, no browser required):

- **76 client tests** — `npm test`
- **89 server tests** — `npm --prefix server run test:all` (smoke, accounts & NetClient E2E)

## Deploy to GitHub Pages

In **Settings → Pages**, set **Source** to **GitHub Actions**. Every push to `main` runs the tests, then publishes `web-openworld-game/`.
