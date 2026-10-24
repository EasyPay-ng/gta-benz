// MetroVenture 3D — static game data (no Three.js dependency, safe to import in Node tests)

export const SAVE_KEY = 'metroventure_openworld_save_v1';
export const SAVE_VERSION = 9; // v9: interactive furniture & doors, rest/energy, hotel stays & the South Waterfront public district

export const STARTING_CASH = 500;
export const PAYROLL_INTERVAL = 30; // real seconds per 12-in-game-minute shift (30s * 24 = 720s = 12m)
export const TOTAL_CITIZENS = 12;

// ---------------------------------------------------------------------------
// Dynamic time system (feature 11 — 1 real hour = 1 in-game day, 24× real time)
// ---------------------------------------------------------------------------
export const CLOCK_SPEED = 24;               // 24 in-game seconds per 1 real second
export const INGAME_MINUTE_MS = 60_000;
export const INGAME_HOUR_MS = 3_600_000;
export const INGAME_DAY_MS = 86_400_000;
export const CLOCK_START_HOUR = 8;           // new saves start at Day 1 · 08:00
export const SHIFT_INGAME_MINUTES = 12;      // 12 in-game min = 30 real s at 24×
export const STREET_LAMP_POOL = 8;           // max real PointLights pooled across the 25 intersections

// ---------------------------------------------------------------------------
// City grid
// ---------------------------------------------------------------------------
export const ROAD_LINES = [-150, -75, 0, 75, 150]; // road centre lines (both axes)
export const ROAD_HALF = 7;          // half road width (2 lanes)
export const LANE_OFFSET = 3.5;      // lane centre offset from road centre
export const SIDEWALK_W = 3;         // sidewalk width
export const BLOCK_HALF = 27.5;      // half the buildable interior of a block
export const SIDEWALK_RING = 29;     // half-size of the walkable sidewalk ring around a block
export const BLOCK_CENTERS = [-112.5, -37.5, 37.5, 112.5];
export const WORLD_LIMIT = 242;

// Roads along X (constant z) and along Z (constant x)
export const STREET_NAMES_Z = ['1st St', '2nd St', 'Central St', '4th St', '5th St'];          // roads at z = ROAD_LINES[i]
export const STREET_NAMES_X = ['Harbor Ave', 'Market Ave', 'Broad Ave', 'Tech Ave', 'Lagoon Ave']; // roads at x = ROAD_LINES[i]

// ---------------------------------------------------------------------------
// Occupations
// ---------------------------------------------------------------------------
// headgear: cap | peaked | hardhat | chefhat | visor | beanie | flatcap | null
export const OCCUPATIONS = {
  courier: {
    id: 'courier', title: 'Express Courier', kind: 'starter', basePay: 220,
    uniform: { shirt: '#f59e0b', pants: '#1f2937', headgear: 'cap', hat: '#b45309', accent: '#fde68a' },
    description: 'Pick up parcels at the depot and deliver them anywhere in the city. Driving is faster!',
  },
  security: {
    id: 'security', title: 'City Security Officer', kind: 'starter', basePay: 280,
    uniform: { shirt: '#1e3a8a', pants: '#111827', headgear: 'peaked', hat: '#0f172a', accent: '#facc15' },
    description: 'Patrol three checkpoints around the city, then get paid for the round.',
  },
  cabbie: {
    id: 'cabbie', title: 'Metro Cab Driver', kind: 'starter', basePay: 150, requiresVehicle: true,
    uniform: { shirt: '#facc15', pants: '#111827', headgear: 'flatcap', hat: '#1f2937', accent: '#111827' },
    description: 'Needs a car. Pick up passengers and drive them to their destination. Fare grows with distance; taxis earn +30%.',
  },
  mechanic: {
    id: 'mechanic', title: 'Master Mechanic', kind: 'business', business: 'garage', basePay: 340,
    uniform: { shirt: '#475569', pants: '#334155', headgear: 'beanie', hat: '#dc2626', accent: '#ef4444' },
    description: 'Service cars at Apex Auto Garage.',
  },
  chef: {
    id: 'chef', title: 'Head Line Chef', kind: 'business', business: 'diner', basePay: 300,
    uniform: { shirt: '#f8fafc', pants: '#111827', headgear: 'chefhat', hat: '#ffffff', accent: '#ef4444' },
    description: 'Cook and serve at Metro Fresh Diner.',
  },
  dispatcher: {
    id: 'dispatcher', title: 'Fleet Dispatcher', kind: 'business', business: 'logistics', basePay: 420,
    uniform: { shirt: '#16a34a', pants: '#1f2937', headgear: 'hardhat', hat: '#facc15', accent: '#fef08a' },
    description: 'Load cargo at the SwiftCargo hub and run deliveries across town.',
  },
  engineer: {
    id: 'engineer', title: 'Software Engineer', kind: 'business', business: 'tech', basePay: 520,
    uniform: { shirt: '#7c3aed', pants: '#1e293b', headgear: 'visor', hat: '#22d3ee', accent: '#c4b5fd' },
    description: 'Write code, run tests and ship releases at ByteForge.',
  },
};

// Rank ladder: tasks completed in an occupation -> rank
export const RANKS = [
  { name: 'Trainee', xp: 0 },
  { name: 'Junior', xp: 3 },
  { name: 'Associate', xp: 7 },
  { name: 'Senior', xp: 12 },
  { name: 'Lead', xp: 20 },
  { name: 'Legend', xp: 32 },
];
export const RANK_PAY_BONUS = 0.15; // +15% pay per rank above Trainee

// ---------------------------------------------------------------------------
// Startups / buildable lots
// ---------------------------------------------------------------------------
// face: +1 => building front faces +z, -1 => faces -z
export const BUSINESSES = {
  garage: {
    id: 'garage', name: 'Apex Auto Garage', cost: 1500, occupation: 'mechanic',
    revenuePerWorker: 130, wagePerWorker: 60, color: '#dc2626', accent: '#f8fafc',
    x: -37.5, z: 37.5, face: -1,
    workSpots: [
      { x: -6, z: 7, label: 'Inspect the car in service bay 1' },
      { x: 6, z: 7, label: 'Swap the tyres in service bay 2' },
      { x: 12, z: -2, label: 'Grab parts from the storage rack' },
      { x: -12, z: -2, label: 'Run diagnostics at the tool bench' },
    ],
  },
  diner: {
    id: 'diner', name: 'Metro Fresh Diner', cost: 1200, occupation: 'chef',
    revenuePerWorker: 105, wagePerWorker: 50, color: '#0ea5e9', accent: '#f472b6',
    x: 37.5, z: 37.5, face: -1,
    workSpots: [
      { x: -5, z: 8, label: 'Fire up the grill' },
      { x: 5, z: 8, label: 'Serve plates at the counter' },
      { x: 11, z: 0, label: 'Unload fresh produce' },
      { x: -11, z: 0, label: 'Wash up at the dish station' },
    ],
  },
  logistics: {
    id: 'logistics', name: 'SwiftCargo Logistics Hub', cost: 2600, occupation: 'dispatcher',
    revenuePerWorker: 175, wagePerWorker: 80, color: '#16a34a', accent: '#facc15',
    x: -112.5, z: -37.5, face: 1,
    workSpots: [
      { x: -8, z: 9, label: 'Load cargo at dock A' },
      { x: 8, z: 9, label: 'Scan pallets at dock B' },
      { x: 13, z: 0, label: 'Sign the driver manifests' },
    ],
    delivery: true,
  },
  tech: {
    id: 'tech', name: 'ByteForge Tech Startup', cost: 4000, occupation: 'engineer',
    revenuePerWorker: 270, wagePerWorker: 120, color: '#7c3aed', accent: '#22d3ee',
    x: 112.5, z: -37.5, face: 1,
    workSpots: [
      { x: -6, z: 8, label: 'Write code at the hot desk' },
      { x: 6, z: 9.6, label: 'Run the test suite at the server rack' },
      { x: 11, z: -1, label: 'Pitch the demo to investors' },
      { x: -11, z: -1, label: 'Ship the release from the ops console' },
    ],
  },
};

export const BASE_JOB_SLOTS = 3;
export const SLOTS_PER_LEVEL = 2;
export const MAX_BUSINESS_LEVEL = 5;
export const LEVEL_REVENUE_BONUS = 0.2;

// ---------------------------------------------------------------------------
// Job stations (starter employers + vehicle dealership)
// ---------------------------------------------------------------------------
export const STATIONS = {
  courier: { id: 'courier', name: 'Express Courier Depot', occupation: 'courier', x: -37.5, z: -37.5, face: 1, color: '#f59e0b' },
  security: { id: 'security', name: 'City Security HQ', occupation: 'security', x: 37.5, z: -37.5, face: 1, color: '#1e3a8a' },
  cab: { id: 'cab', name: 'Metro Cab Co.', occupation: 'cabbie', x: 112.5, z: 37.5, face: -1, color: '#facc15' },
};

export const DEALERSHIP = { id: 'dealer', name: 'Metro Motors', x: -112.5, z: 37.5, face: -1, color: '#0f766e' };
export const BOUTIQUE = { id: 'boutique', name: 'Maison Verve Boutique', x: -37.5, z: -112.5, face: 1, color: '#ec4899' };
export const UNIVERSITY = {
  id: 'university',
  name: 'Metro Grand University',
  x: 0,
  z: -196,
  face: 1,
  color: '#1d4ed8',
  accent: '#f59e0b',
  bounds: { minX: -80, maxX: 80, minZ: -234, maxZ: -158 },
};

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------
// dimensions in metres; speeds in m/s (1 m/s = 3.6 km/h)
export const VEHICLE_MODELS = {
  hatch: {
    id: 'hatch', name: 'Rusty Hatchback', price: 0, forSale: false, tier: 'standard',
    tagline: 'Dependable daily beater.',
    len: 3.9, wid: 1.75, bodyH: 0.62, cabinH: 0.62, cabinLen: 2.1, cabinZ: -0.2, wheelR: 0.33,
    maxSpeed: 24, accel: 9, brake: 22, steer: 0.62, grip: 7, style: 'hatch',
    fuelPerKm: 3.0, fillPrice: 60,
  },
  sedan: {
    id: 'sedan', name: 'Lagos Cruiser Sedan', price: 1800, forSale: true, tier: 'standard',
    tagline: 'Smooth executive commuter.',
    len: 4.6, wid: 1.85, bodyH: 0.6, cabinH: 0.6, cabinLen: 2.3, cabinZ: -0.15, wheelR: 0.35,
    maxSpeed: 31, accel: 11, brake: 26, steer: 0.58, grip: 8, style: 'sedan',
    fuelPerKm: 2.6, fillPrice: 120,
  },
  taxi: {
    id: 'taxi', name: 'Metro Cab Taxi', price: 2200, forSale: true, fixedColor: '#facc15', tier: 'standard',
    tagline: '+30% fare bonus on cabbie shifts.',
    len: 4.6, wid: 1.85, bodyH: 0.6, cabinH: 0.6, cabinLen: 2.3, cabinZ: -0.15, wheelR: 0.35,
    maxSpeed: 29, accel: 10.5, brake: 26, steer: 0.6, grip: 8, style: 'taxi',
    fuelPerKm: 2.7, fillPrice: 120,
  },
  pickup: {
    id: 'pickup', name: 'Okada Ridge Pickup', price: 2600, forSale: true, tier: 'standard',
    tagline: 'High-clearance utility workhorse.',
    len: 5.1, wid: 2.0, bodyH: 0.8, cabinH: 0.7, cabinLen: 1.9, cabinZ: 0.55, wheelR: 0.44,
    maxSpeed: 28, accel: 10, brake: 24, steer: 0.55, grip: 7.5, style: 'pickup',
    fuelPerKm: 3.2, fillPrice: 130,
  },
  van: {
    id: 'van', name: 'SwiftCargo Van', price: 3200, forSale: true, tier: 'standard',
    tagline: 'Heavy commercial delivery van.',
    len: 5.2, wid: 2.05, bodyH: 0.9, cabinH: 1.15, cabinLen: 4.1, cabinZ: -0.35, wheelR: 0.4,
    maxSpeed: 25, accel: 8.5, brake: 22, steer: 0.5, grip: 7, style: 'van',
    fuelPerKm: 3.4, fillPrice: 130,
  },
  muscle: {
    id: 'muscle', name: "'69 Stallion GT", price: 5200, forSale: true, tier: 'signature',
    tagline: 'Supercharged V8 fastback with chrome blower & twin stripes.',
    defaultLivery: 'twin_stripe',
    len: 4.75, wid: 1.94, bodyH: 0.58, cabinH: 0.52, cabinLen: 2.0, cabinZ: -0.28, wheelR: 0.37,
    maxSpeed: 41, accel: 15.8, brake: 27, steer: 0.57, grip: 8.1, style: 'muscle',
    fuelPerKm: 3.8, fillPrice: 145,
  },
  sports: {
    id: 'sports', name: 'Benz V12 Sport', price: 6500, forSale: true, tier: 'signature',
    tagline: 'Track-bred grand tourer coupe.',
    len: 4.5, wid: 1.95, bodyH: 0.5, cabinH: 0.48, cabinLen: 1.8, cabinZ: -0.35, wheelR: 0.36,
    maxSpeed: 46, accel: 17, brake: 32, steer: 0.55, grip: 9.5, style: 'sports',
    fuelPerKm: 3.6, fillPrice: 140,
  },
  roadster: {
    id: 'roadster', name: 'Aero Spider Roadster', price: 8200, forSale: true, tier: 'exotic',
    tagline: 'Open-top convertible speedster — show off your fit at 160 km/h.',
    len: 4.4, wid: 1.96, bodyH: 0.48, cabinH: 0.46, cabinLen: 1.75, cabinZ: -0.15, wheelR: 0.36,
    maxSpeed: 45, accel: 16.5, brake: 33, steer: 0.62, grip: 10.0, style: 'roadster',
    fuelPerKm: 3.4, fillPrice: 140,
  },
  gwagen: {
    id: 'gwagen', name: 'Benz G-Wagen 4x4', price: 9500, forSale: true, tier: 'exotic',
    tagline: 'Commanding luxury 4x4 SUV with bullbar, roof rack & rear spare.',
    len: 4.85, wid: 2.04, bodyH: 0.84, cabinH: 0.86, cabinLen: 3.25, cabinZ: -0.36, wheelR: 0.45,
    maxSpeed: 38, accel: 14.2, brake: 29, steer: 0.56, grip: 9.3, style: 'gwagen',
    fuelPerKm: 3.9, fillPrice: 160,
  },
  hyper: {
    id: 'hyper', name: 'Valkyrie X12 Hypercar', price: 14500, forSale: true, tier: 'exotic',
    tagline: 'Mid-engine V12 flagship — teardrop canopy, side intakes & quad exhausts.',
    defaultLivery: 'carbon_hood',
    len: 4.68, wid: 2.06, bodyH: 0.44, cabinH: 0.42, cabinLen: 1.85, cabinZ: -0.05, wheelR: 0.37,
    maxSpeed: 52, accel: 19.5, brake: 36, steer: 0.58, grip: 10.5, style: 'hyper',
    fuelPerKm: 4.1, fillPrice: 175,
  },
  police: {
    id: 'police', name: 'Metro Police Interceptor', price: 0, forSale: false, fixedColor: '#0f172a',
    len: 4.45, wid: 1.9, bodyH: 0.56, cabinH: 0.55, cabinLen: 2.05, cabinZ: -0.2, wheelR: 0.36,
    maxSpeed: 41, accel: 15, brake: 28, steer: 0.54, grip: 9.0, style: 'police',
    fuelPerKm: 2.8, fillPrice: 110,
  },
};

// Fuel, damage & wear (feature 4 — see UPGRADE_PLAN.md §4)
// Speeds are m/s everywhere (1 m/s = 3.6 km/h).
export const DAMAGE_SPEED_KMH = 30;      // impacts above this closing speed damage the body
export const IMPACT_DMG_FACTOR = 4;      // hp lost = (relSpeedMps − threshold) × 4
export const IMPACT_DMG_CAP = 40;        // …max hp lost per impact
export const SCRAPE_SPEED_MPS = 5;       // 5..8.33 m/s: minor scrape damage
export const SCRAPE_DMG = 1;
export const TIRE_WEAR_PER_KM = 0.05;
export const ENGINE_WEAR_PER_KM = 0.03;
export const ENGINE_HIGH_SPEED_THRESHOLD = 25; // m/s — above this, extra engine wear
export const ENGINE_HIGH_SPEED_EXTRA = 0.02;   // per km
export const REPAIR_COST_PER_HP = 3;
export const REPAIR_TIRE_BUNDLE = 25;         // tyre sets restore this much condition
export const REPAIR_TIRE_BUNDLE_COST = 150;
export const REPAIR_ENGINE_BUNDLE = 25;
export const REPAIR_ENGINE_BUNDLE_COST = 200;
export const MOTORS_REPAIR_MARKUP = 1.2;  // Metro Motors charges city rates (+20%)
export const TOW_PRICE = 250;

// Roadside assistance & mobile mechanic (callable from anywhere)
export const ROADSIDE_CALLOUT_FEE = 150;       // dispatch fee for on-the-spot mobile repairs
export const ROADSIDE_REPAIR_MARKUP = 1.4;     // mobile parts/labour rate (+40%, or +15% if you own Apex)
export const ROADSIDE_APEX_MARKUP = 1.15;      // discounted mobile rate when Apex Auto Garage is built
export const ROADSIDE_FUEL_FEE = 95;           // emergency jerrycan delivery fee
export const ROADSIDE_FUEL_AMOUNT = 35;        // % of tank added by emergency jerrycan

// Telemetry thresholds (feature 9 — see UPGRADE_PLAN.md §9)
export const TELEMETRY_WARN_LEVEL = 50;        // amber bar + warning toast below 50%
export const TELEMETRY_CRIT_LEVEL = 25;        // red pulsing bar + danger toast below 25%
export const TELEMETRY_FUEL_BLINK = 10;        // blinking fuel icon + tick SFX below 10%
export const TELEMETRY_ENGINE_FAULT = 20;      // "ENGINE FAULT" banner + tailpipe smoke below 20%
export const TELEMETRY_HZ = 2;                 // HUD bar refresh rate (Hz)

export const CAR_COLORS = [
  '#dc2626', '#2563eb', '#16a34a', '#f8fafc', '#111827', '#9333ea', '#f97316',
  '#64748b', '#0d9488', '#be185d', '#eab308', '#06b6d4', '#059669', '#d6d3d1',
];

// Custom Mod Shop options (paint respray, racing liveries, alloy rims & street underglow)
export const RESPRAY_COST = 220;
export const APEX_MOD_DISCOUNT = 0.75; // 25% discount on custom car mods when Apex Auto Garage is built

export const CAR_LIVERIES = {
  clean:       { id: 'clean',       name: 'Factory Clean',       price: 80,  stripeHex: null },
  twin_stripe: { id: 'twin_stripe', name: 'Twin Racing Stripes', price: 360, stripeHex: '#f8fafc' },
  gold_trim:   { id: 'gold_trim',   name: '24k Gold Stripes',    price: 580, stripeHex: '#fbbf24' },
  carbon_hood: { id: 'carbon_hood', name: 'Carbon Aero Package', price: 460, stripeHex: '#18181b' },
};

export const RIM_FINISHES = {
  silver: { id: 'silver', name: 'Alloy Silver',   hex: '#d4d4d8', price: 140 },
  black:  { id: 'black',  name: 'Forged Stealth', hex: '#18181b', price: 320 },
  gold:   { id: 'gold',   name: '24k Gold Spoke', hex: '#fbbf24', price: 520 },
  cyan:   { id: 'cyan',   name: 'Cyber Anodized', hex: '#22d3ee', price: 460 },
};

export const UNDERGLOW_OPTIONS = {
  none:    { id: 'none',    name: 'No Underglow', hex: null,      price: 0 },
  cyan:    { id: 'cyan',    name: 'Miami Cyan',   hex: '#22d3ee', price: 480 },
  purple:  { id: 'purple',  name: 'Ultraviolet',  hex: '#a855f7', price: 480 },
  crimson: { id: 'crimson', name: 'Ruby Red',     hex: '#ef4444', price: 480 },
  emerald: { id: 'emerald', name: 'Toxic Green',  hex: '#22c55e', price: 480 },
  gold:    { id: 'gold',    name: 'Solar Gold',   hex: '#f59e0b', price: 560 },
};

// Fuel stations — one on each of three outer blocks (marked F on the minimap)
export const FUEL_STATIONS = {
  lagoon: { id: 'lagoon', name: 'Lagoon Fuels', x: 112.5, z: 112.5, face: -1, color: '#ea580c' },
  harbor: { id: 'harbor', name: 'Harbor Fuels', x: -112.5, z: -112.5, face: 1, color: '#0284c7' },
  metro: { id: 'metro', name: 'Metro Fuels', x: 37.5, z: 112.5, face: -1, color: '#16a34a' },
};

// ---------------------------------------------------------------------------
// Character appearance & Maison Verve Boutique 3D Clothing Catalog
// ---------------------------------------------------------------------------
export const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e', '#3b2412', '#ffdbac'];
export const SHIRT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#f8fafc', '#111827', '#ec4899', '#7f1d1d', '#d97706'];
export const PANTS_COLORS = ['#1f2937', '#1e3a8a', '#78350f', '#374151', '#4d7c0f', '#0f172a', '#a8a29e', '#f8fafc', '#991b1b'];
export const SHOE_COLORS = ['#1c1917', '#f8fafc', '#dc2626', '#2563eb', '#eab308', '#78350f', '#a855f7'];
export const HAIR_COLORS = ['#111111', '#3b2412', '#6b4423', '#b8860b', '#9ca3af', '#7f1d1d'];
export const HAIR_STYLES = ['short', 'buzz', 'afro', 'long', 'bald'];
export const BUILDS = {
  Balanced: { w: 1, h: 1 },
  Lean: { w: 0.86, h: 1.03 },
  Broad: { w: 1.22, h: 0.98 },
};

export const CLOTHING_ITEMS = {
  top: {
    tee:     { id: 'tee',     slot: 'top', field: 'topStyle', name: 'Classic Crew Tee',       price: 0,    desc: 'Clean fitted short-sleeve tee.' },
    jersey:  { id: 'jersey',  slot: 'top', field: 'topStyle', name: 'Street Mesh Jersey',     price: 260,  desc: 'Sleeveless basketball cut with contrast trim.' },
    hoodie:  { id: 'hoodie',  slot: 'top', field: 'topStyle', name: 'Heavyweight Hoodie',     price: 360,  desc: 'Long-sleeve hoodie with draped hood & kangaroo pouch.' },
    bomber:  { id: 'bomber',  slot: 'top', field: 'topStyle', name: 'Varsity Bomber Jacket',  price: 620,  desc: 'Layered open bomber over white tee with shoulder stripes.' },
    suit:    { id: 'suit',    slot: 'top', field: 'topStyle', name: 'Executive Suit & Tie',   price: 1150, desc: 'Tailored blazer with crisp dress shirt, lapels & silk tie.' },
    senator: { id: 'senator', slot: 'top', field: 'topStyle', name: 'Royal Senator Tunic',    price: 1450, desc: 'Draped Nigerian Senator kaftan with gold chest embroidery.' },
    gown:    { id: 'gown',    slot: 'top', field: 'topStyle', name: 'Academic Convocation Gown', price: 950, desc: 'Draped university graduation robe with 24k gold stole (unlocked free on graduating!).' },
  },
  bottom: {
    jeans:   { id: 'jeans',   slot: 'bottom', field: 'bottomStyle', name: 'Tapered Denim',       price: 0,   desc: 'Everyday slim-fit street denim.' },
    shorts:  { id: 'shorts',  slot: 'bottom', field: 'bottomStyle', name: 'Athletic Shorts',     price: 220, desc: 'Knee-length shorts with ribbed crew socks.' },
    cargo:   { id: 'cargo',   slot: 'bottom', field: 'bottomStyle', name: 'Techwear Cargos',     price: 380, desc: 'Tactical utility trousers with 3D side thigh pockets.' },
    slacks:  { id: 'slacks',  slot: 'bottom', field: 'bottomStyle', name: 'Tailored Dress Slacks', price: 480, desc: 'Pressed luxury wool trousers.' },
  },
  shoe: {
    sneakers: { id: 'sneakers', slot: 'shoe', field: 'shoeStyle', name: 'Low-Top Sneakers',     price: 0,   desc: 'Clean street trainers with white cupsole.' },
    hightops: { id: 'hightops', slot: 'shoe', field: 'shoeStyle', name: 'Retro High-Tops',      price: 380, desc: 'Padded high-ankle basketball kicks.' },
    boots:    { id: 'boots',    slot: 'shoe', field: 'shoeStyle', name: 'Chelsea Lug Boots',    price: 460, desc: 'Chunky dark-lugged leather boots.' },
    loafers:  { id: 'loafers',  slot: 'shoe', field: 'shoeStyle', name: 'Gold-Bit Loafers',     price: 680, desc: 'Italian dress loafers with 24k gold horsebit.' },
  },
  hat: {
    none:     { id: 'none',     slot: 'hat', field: 'hatStyle', name: 'No Hat',              price: 0,    desc: 'Show off your hairstyle.' },
    snapback: { id: 'snapback', slot: 'hat', field: 'hatStyle', name: 'Street Snapback',     price: 180,  desc: 'Structured flat-brim street cap.' },
    bucket:   { id: 'bucket',   slot: 'hat', field: 'hatStyle', name: 'Designer Bucket Hat', price: 240,  desc: '360° sloped-brim streetwear bucket hat.' },
    fila:        { id: 'fila',        slot: 'hat', field: 'hatStyle', name: 'Traditional Fila Cap',       price: 420,  desc: 'Hand-woven folded Nigerian chief cap.' },
    mortarboard: { id: 'mortarboard', slot: 'hat', field: 'hatStyle', name: 'Graduation Mortarboard Cap', price: 350,  desc: 'Square university mortarboard with swinging 24k gold tassel (unlocked free on graduating!).' },
    crown:       { id: 'crown',       slot: 'hat', field: 'hatStyle', name: '24k Tycoon Crown',           price: 2500, desc: 'Solid gold jewelled crown for city moguls.' },
  },
  glasses: {
    none:         { id: 'none',         slot: 'glasses', field: 'glasses', name: 'No Eyewear',       price: 0,   desc: 'Clear natural gaze.' },
    aviator:      { id: 'aviator',      slot: 'glasses', field: 'glasses', name: 'Dark Aviators',    price: 290, desc: 'Tinted teardrop lenses with sleek frame.' },
    gold_shades:  { id: 'gold_shades',  slot: 'glasses', field: 'glasses', name: 'Cartier Gold',     price: 680, desc: 'Squared luxury shades with 24k gold bridge & temples.' },
    cyber_shades: { id: 'cyber_shades', slot: 'glasses', field: 'glasses', name: 'Neon Cyber Visor', price: 820, desc: 'Luminous wrap-around synthwave visor.' },
  },
  chain: {
    none:   { id: 'none',   slot: 'chain', field: 'chain', name: 'No Chain',             price: 0,    desc: 'Clean neckline.' },
    silver: { id: 'silver', slot: 'chain', field: 'chain', name: 'Iced Cuban Silver',    price: 450,  desc: 'Heavy rhodium-plated Cuban link chain.' },
    gold:   { id: 'gold',   slot: 'chain', field: 'chain', name: '24k Gold Medallion',   price: 1200, desc: 'Thick 24k gold chain with pendant medallion.' },
  },
};

export const OUTFIT_BUNDLES = [
  {
    id: 'street_king',
    name: 'Street King Drip',
    price: 980,
    tagline: 'Varsity bomber, tactical cargos, retro high-tops & dark aviators.',
    items: [['top', 'bomber'], ['bottom', 'cargo'], ['shoe', 'hightops'], ['glasses', 'aviator']],
    colors: { shirt: '#111827', pants: '#374151', shoeColor: '#dc2626' },
  },
  {
    id: 'ceo_mogul',
    name: 'Boardroom Mogul Set',
    price: 2150,
    tagline: 'Tailored suit & tie, pressed slacks, gold-bit loafers & Cartier shades.',
    items: [['top', 'suit'], ['bottom', 'slacks'], ['shoe', 'loafers'], ['glasses', 'gold_shades']],
    colors: { shirt: '#0f172a', pants: '#0f172a', shoeColor: '#1c1917' },
  },
  {
    id: 'lagos_royalty',
    name: 'Lagos Royalty Senator',
    price: 2950,
    tagline: 'Embroidered Senator tunic, traditional Fila cap, gold loafers & 24k medallion.',
    items: [['top', 'senator'], ['bottom', 'slacks'], ['hat', 'fila'], ['shoe', 'loafers'], ['chain', 'gold']],
    colors: { shirt: '#f8fafc', pants: '#f8fafc', hatColor: '#d97706', shoeColor: '#1c1917' },
  },
  {
    id: 'night_runner',
    name: 'Cyber Night Runner',
    price: 1550,
    tagline: 'Heavyweight hoodie, cargos, cyber visor & iced silver chain.',
    items: [['top', 'hoodie'], ['bottom', 'cargo'], ['shoe', 'boots'], ['glasses', 'cyber_shades'], ['chain', 'silver']],
    colors: { shirt: '#a855f7', pants: '#111827', shoeColor: '#1c1917' },
  },
];

export const DEFAULT_APPEARANCE = {
  name: 'Benz',
  skin: '#8d5524',
  shirt: '#3b82f6',
  pants: '#1f2937',
  hair: '#111111',
  hairStyle: 'short',
  build: 'Balanced',
  topStyle: 'tee',
  bottomStyle: 'jeans',
  shoeStyle: 'sneakers',
  shoeColor: '#1c1917',
  hatStyle: 'none',
  hatColor: '#111827',
  glasses: 'none',
  chain: 'none',
};

export const CITIZEN_NAMES = [
  'Tunde', 'Amara', 'Chidi', 'Zainab', 'Femi', 'Ngozi',
  'Kemi', 'Emeka', 'Aisha', 'Bayo', 'Funke', 'Ike',
];

// ---------------------------------------------------------------------------
// Character Jump & Expressive Emotes (feature 2 — see UPGRADE_PLAN.md §2)
// ---------------------------------------------------------------------------
export const JUMP_VELOCITY = 4.35;   // m/s upward impulse (~0.95 m apex)
export const JUMP_GRAVITY = 10.2;    // m/s² downward acceleration

export const EMOTES = [
  { id: 'wave',      key: '1', icon: '👋', name: 'Wave',           duration: 1.9, loop: false },
  { id: 'greet',     key: '2', icon: '🤝', name: 'Respect Greet',  duration: 1.7, loop: false },
  { id: 'clap',      key: '3', icon: '👏', name: 'Applause',       duration: 1.8, loop: false },
  { id: 'celebrate', key: '4', icon: '🙌', name: 'Celebrate',      duration: 2.1, loop: false },
  { id: 'flex',      key: '5', icon: '💪', name: 'Flex',           duration: 2.0, loop: false },
  { id: 'dance1',    key: '6', icon: '🕺', name: 'Afro-Groove',    duration: 2.4, loop: true },
  { id: 'dance2',    key: '7', icon: '🤖', name: 'Robot',          duration: 2.4, loop: true },
  { id: 'dance3',    key: '8', icon: '🔥', name: 'Street Shuffle', duration: 2.2, loop: true },
];

// ---------------------------------------------------------------------------
// Street Chaos, Police Pursuit Heat & FX pools
// ---------------------------------------------------------------------------
export const HEAT_MAX_STARS = 3;
export const HEAT_STAR_THRESHOLDS = [22, 55, 92]; // points for ★☆☆, ★★☆, ★★★
export const HEAT_MAX_SCORE = 120;
export const HEAT_CRASH_SPEED_MPS = 10.5;         // ramming traffic faster than ~38 km/h adds heat
export const HEAT_COOLDOWN_DELAY = 6.5;           // seconds out of cruiser sight before heat decays
export const HEAT_DECAY_PER_SEC = 4.5;            // score drained per second while evading
export const HEAT_BUST_DIST = 6.2;                // cruiser proximity (m) to start bust timer
export const HEAT_BUST_MAX_SPEED = 2.2;           // player must be nearly stopped (m/s)
export const HEAT_BUST_SECONDS = 2.4;             // continuous pinned time before fine
export const HEAT_FINE_PER_STAR = 140;            // $ fine per star when busted
export const HEAT_SIGHT_DIST = 62;                // cruiser line-of-sight distance (m)
export const HEAT_MAX_CRUISERS = 2;               // active police interceptors at 2–3 stars

export const SKID_POOL_SIZE = 560;
export const SPARK_POOL_SIZE = 72;
export const SCORCH_POOL_SIZE = 28;

// ---------------------------------------------------------------------------
// Camera modes (Third-Person Orbit ↔ First-Person Street POV / Sleek Car Cockpit)
// ---------------------------------------------------------------------------
export const CAM_MODES = ['third', 'first'];
export const CAM_THIRD_FOV = 62;
export const CAM_FIRST_FOV = 74;
export const CAM_COCKPIT_FOV = 72;
export const CAM_FOOT_EYE_HEIGHT = 1.56;       // metres above ground for Balanced build
export const CAM_FOOT_EYE_FORWARD = 0.14;      // slight forward offset clear of torso/collar
export const CAM_FIRST_PITCH_MIN = -1.15;      // look down at outfit/shoes (~-66°)
export const CAM_FIRST_PITCH_MAX = 1.15;       // look up at skyline towers (~+66°)
export const CAM_COCKPIT_YAW_MAX = 2.15;       // head swivel inside car cabin (~±123°)
export const CAM_COCKPIT_PITCH_MIN = -0.78;    // glance down at gauges, wheel & shifter
export const CAM_COCKPIT_PITCH_MAX = 0.65;     // glance up at roof header / open sky
export const CAM_COCKPIT_RECENTER_DELAY = 1.8; // s after freelook before gentle auto-center while driving
export const CAM_HEADBOB_FREQ = 9.4;           // stride frequency factor in 1st-person
export const CAM_HEADBOB_AMP = 0.03;           // max vertical bob (m) at full sprint

// ---------------------------------------------------------------------------
// Full 3D Architect Build & Furnish Mode (Structure + Furniture)
// ---------------------------------------------------------------------------
export const BUILD_STORY_H = 3.2;              // standard player-built story height (m)
export const MAX_CUSTOM_BUILDS = 800;          // generous per-save piece budget

export const BUILD_COLORS = [
  '#f1f5f9', // Limestone White
  '#cbd5e1', // Architectural Concrete
  '#b45309', // Terracotta / Warm Brick
  '#78350f', // Rich Mahogany Wood
  '#1e293b', // Obsidian Slate
  '#1e3a8a', // Royal Navy
  '#991b1b', // Velvet Crimson
  '#065f46', // Emerald Sage
  '#f59e0b', // 24k Gold Accent
];


export const BUILD_ITEMS = [
  // --- Structure (snaps cleanly to a 4m architectural grid; supports multi-story stacking!) ---
  { id: 'floor_stone',  cat: 'structure', icon: '⬜', name: 'Marble Floor (4×4m)',   grid: 4.0, dist: 4.2, defaultColor: '#f1f5f9' },
  { id: 'floor_wood',   cat: 'structure', icon: '🟫', name: 'Hardwood Floor (4×4m)', grid: 4.0, dist: 4.2, defaultColor: '#78350f' },
  { id: 'wall_solid',   cat: 'structure', icon: '🧱', name: 'Solid Wall (4m)',       grid: 4.0, dist: 4.0, defaultColor: '#f1f5f9' },
  { id: 'wall_window',  cat: 'structure', icon: '🪟', name: 'Window Wall (4m)',      grid: 4.0, dist: 4.0, defaultColor: '#cbd5e1' },
  { id: 'wall_door',    cat: 'structure', icon: '🚪', name: 'Doorway Wall (4m)',     grid: 4.0, dist: 4.0, defaultColor: '#f1f5f9' },
  { id: 'glass_wall',   cat: 'structure', icon: '🏙', name: 'Glass Curtain (4m)',    grid: 4.0, dist: 4.0, defaultColor: '#1e293b' },
  { id: 'stairs',       cat: 'structure', icon: '🪜', name: '3D Stairs (+1 Floor)',  grid: 4.0, dist: 4.4, defaultColor: '#78350f' },
  { id: 'pillar',       cat: 'structure', icon: '🏛', name: 'Support Pillar',        grid: 4.0, dist: 3.6, defaultColor: '#f1f5f9' },
  { id: 'railing',      cat: 'structure', icon: '🚧', name: 'Glass Balcony Rail',    grid: 4.0, dist: 3.8, defaultColor: '#1e293b' },
  { id: 'roof_gable',   cat: 'structure', icon: '🏠', name: 'Pitched Roof (4×4m)',   grid: 4.0, dist: 4.4, defaultColor: '#991b1b' },

  // --- 3D Furniture & Interior Decor (fine 0.5m placement grid inside any room or tower!) ---
  { id: 'sofa',         cat: 'furniture', icon: '🛋', name: 'Luxury Lounge Sofa',    grid: 0.5, dist: 3.2, defaultColor: '#1e3a8a' },
  { id: 'bed',          cat: 'furniture', icon: '🛏', name: 'King Platform Bed',     grid: 0.5, dist: 3.5, defaultColor: '#991b1b' },
  { id: 'desk',         cat: 'furniture', icon: '🖥', name: 'Exec Desk & Monitors',  grid: 0.5, dist: 3.2, defaultColor: '#78350f' },
  { id: 'table',        cat: 'furniture', icon: '🍽', name: 'Dining / Conf. Table',  grid: 0.5, dist: 3.3, defaultColor: '#78350f' },
  { id: 'tv_stand',     cat: 'furniture', icon: '📺', name: 'Widescreen Smart TV',   grid: 0.5, dist: 3.2, defaultColor: '#1e293b' },
  { id: 'bookshelf',    cat: 'furniture', icon: '📚', name: 'Tall Bookshelf',        grid: 0.5, dist: 3.0, defaultColor: '#78350f' },
  { id: 'lamp',         cat: 'furniture', icon: '💡', name: 'Warm Floor Lamp',       grid: 0.5, dist: 2.8, defaultColor: '#f59e0b' },
  { id: 'plant',        cat: 'furniture', icon: '🪴', name: 'Indoor Palm Plant',     grid: 0.5, dist: 2.8, defaultColor: '#065f46' },
];



