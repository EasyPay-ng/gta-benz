// MetroVenture 3D — static game data (no Three.js dependency, safe to import in Node tests)

export const SAVE_KEY = 'metroventure_openworld_save_v1';
export const SAVE_VERSION = 4; // v4: 24x in-game clock, vehicle lastServicedInGameMs, telemetry & roadside assist

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
export const WORLD_LIMIT = 195;

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

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------
// dimensions in metres; speeds in m/s (1 m/s = 3.6 km/h)
export const VEHICLE_MODELS = {
  hatch: {
    id: 'hatch', name: 'Rusty Hatchback', price: 0, forSale: false,
    len: 3.9, wid: 1.75, bodyH: 0.62, cabinH: 0.62, cabinLen: 2.1, cabinZ: -0.2, wheelR: 0.33,
    maxSpeed: 24, accel: 9, brake: 22, steer: 0.62, grip: 7, style: 'hatch',
    fuelPerKm: 3.0, fillPrice: 60,
  },
  sedan: {
    id: 'sedan', name: 'Lagos Cruiser Sedan', price: 1800, forSale: true,
    len: 4.6, wid: 1.85, bodyH: 0.6, cabinH: 0.6, cabinLen: 2.3, cabinZ: -0.15, wheelR: 0.35,
    maxSpeed: 31, accel: 11, brake: 26, steer: 0.58, grip: 8, style: 'sedan',
    fuelPerKm: 2.6, fillPrice: 120,
  },
  taxi: {
    id: 'taxi', name: 'Metro Cab Taxi', price: 2200, forSale: true, fixedColor: '#facc15',
    len: 4.6, wid: 1.85, bodyH: 0.6, cabinH: 0.6, cabinLen: 2.3, cabinZ: -0.15, wheelR: 0.35,
    maxSpeed: 29, accel: 10.5, brake: 26, steer: 0.6, grip: 8, style: 'taxi',
    fuelPerKm: 2.7, fillPrice: 120,
  },
  pickup: {
    id: 'pickup', name: 'Okada Ridge Pickup', price: 2600, forSale: true,
    len: 5.1, wid: 2.0, bodyH: 0.8, cabinH: 0.7, cabinLen: 1.9, cabinZ: 0.55, wheelR: 0.44,
    maxSpeed: 28, accel: 10, brake: 24, steer: 0.55, grip: 7.5, style: 'pickup',
    fuelPerKm: 3.2, fillPrice: 130,
  },
  van: {
    id: 'van', name: 'SwiftCargo Van', price: 3200, forSale: true,
    len: 5.2, wid: 2.05, bodyH: 0.9, cabinH: 1.15, cabinLen: 4.1, cabinZ: -0.35, wheelR: 0.4,
    maxSpeed: 25, accel: 8.5, brake: 22, steer: 0.5, grip: 7, style: 'van',
    fuelPerKm: 3.4, fillPrice: 130,
  },
  sports: {
    id: 'sports', name: 'Benz V12 Sport', price: 6500, forSale: true,
    len: 4.5, wid: 1.95, bodyH: 0.5, cabinH: 0.48, cabinLen: 1.8, cabinZ: -0.35, wheelR: 0.36,
    maxSpeed: 46, accel: 17, brake: 32, steer: 0.55, grip: 9.5, style: 'sports',
    fuelPerKm: 3.6, fillPrice: 140,
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

export const CAR_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#f8fafc', '#111827', '#9333ea', '#f97316', '#64748b', '#0d9488', '#be185d'];

// Fuel stations — one on each of three outer blocks (marked F on the minimap)
export const FUEL_STATIONS = {
  lagoon: { id: 'lagoon', name: 'Lagoon Fuels', x: 112.5, z: 112.5, face: -1, color: '#ea580c' },
  harbor: { id: 'harbor', name: 'Harbor Fuels', x: -112.5, z: -112.5, face: 1, color: '#0284c7' },
  metro: { id: 'metro', name: 'Metro Fuels', x: 37.5, z: 112.5, face: -1, color: '#16a34a' },
};

// ---------------------------------------------------------------------------
// Character appearance options
// ---------------------------------------------------------------------------
export const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e', '#3b2412', '#ffdbac'];
export const SHIRT_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#f8fafc', '#111827', '#ec4899'];
export const PANTS_COLORS = ['#1f2937', '#1e3a8a', '#78350f', '#374151', '#4d7c0f', '#0f172a', '#a8a29e'];
export const HAIR_COLORS = ['#111111', '#3b2412', '#6b4423', '#b8860b', '#9ca3af', '#7f1d1d'];
export const HAIR_STYLES = ['short', 'buzz', 'afro', 'long', 'bald'];
export const BUILDS = {
  Balanced: { w: 1, h: 1 },
  Lean: { w: 0.86, h: 1.03 },
  Broad: { w: 1.22, h: 0.98 },
};

export const DEFAULT_APPEARANCE = {
  name: 'Benz',
  skin: '#8d5524',
  shirt: '#3b82f6',
  pants: '#1f2937',
  hair: '#111111',
  hairStyle: 'short',
  build: 'Balanced',
};

export const CITIZEN_NAMES = [
  'Tunde', 'Amara', 'Chidi', 'Zainab', 'Femi', 'Ngozi',
  'Kemi', 'Emeka', 'Aisha', 'Bayo', 'Funke', 'Ike',
];
