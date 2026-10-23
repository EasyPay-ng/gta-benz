// MetroVenture 3D — MetroPhone: the pure in-game smartphone model.
//
// Everything a phone screen needs is derived here from the save state and the
// city data: the clock, the virtual calendar, the app catalog, message threads,
// garage/uni/jobs/wallet cards and the "nearby places" list. No DOM and no
// Three.js, so all of it is unit-tested in `tests/phone.test.mjs`.

import { hhmm, dayOf, hoursOfDay } from './time.js';
import { money } from './economy.js';
import {
  VEHICLE_MODELS, OCCUPATIONS, BUSINESSES, STATIONS, FUEL_STATIONS,
  DEALERSHIP, BOUTIQUE, UNIVERSITY, BUILD_ITEMS,
} from './data.js';
import { PUBLIC_PLACES } from './publicPlaces.js';
import { COURSE_BY_ID } from './university.js';
import { roadsideRepairQuote, canEmergencyRefuel } from './vehicleCond.js';

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------
/**
 * The home grid. `tone` colours the rounded-square icon, `hint` is the tiny
 * caption under the icon and `badge` names a live counter (see `appBadges`).
 */
export const PHONE_APPS = [
  { id: 'garage', name: 'Garage', icon: '🛠', tone: '#f97316', hint: 'Cars & repairs' },
  { id: 'university', name: 'Uni', icon: '🎓', tone: '#6366f1', hint: 'Courses & GPA' },
  { id: 'jobs', name: 'Jobs', icon: '💼', tone: '#10b981', hint: 'Shifts & XP' },
  { id: 'messages', name: 'Messages', icon: '💬', tone: '#38bdf8', hint: 'Inbox' },
  { id: 'wallet', name: 'Wallet', icon: '💳', tone: '#f59e0b', hint: 'Cash & assets' },
  { id: 'map', name: 'Map', icon: '🗺', tone: '#22c55e', hint: 'Nearby places' },
  { id: 'build', name: 'Build', icon: '🏗', tone: '#eab308', hint: '3D Architect' },
  { id: 'wardrobe', name: 'Look', icon: '👕', tone: '#ec4899', hint: 'Wardrobe' },
  { id: 'settings', name: 'Settings', icon: '⚙️', tone: '#64748b', hint: 'Game options' },
  { id: 'help', name: 'Help', icon: '❔', tone: '#a855f7', hint: 'Controls' },
];

export const PHONE_DOCK = ['garage', 'university', 'jobs', 'messages'];

export function appById(id) {
  return PHONE_APPS.find((a) => a.id === id) || null;
}

// ---------------------------------------------------------------------------
// Clock & calendar
// ---------------------------------------------------------------------------
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Day 1 of a new save is Friday 23 October (the city's founding day). */
export const CALENDAR_EPOCH = { weekday: 5, dayOfMonth: 23, month: 9 };

/** Split the in-game clock into "7:45" + "PM" parts for the lock screen. */
export function clockParts(inGameMs) {
  const [h24, m] = hhmm(inGameMs).split(':').map(Number);
  const hour = ((h24 + 11) % 12) + 1;
  const minute = String(m).padStart(2, '0');
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  return { hour, minute, suffix, label: `${hour}:${minute}`, full: `${hour}:${minute}${suffix}` };
}

/** Virtual calendar date for a (1-based) in-game day number. */
export function calendarFor(dayNumber) {
  const day = Math.max(1, Math.floor(Number(dayNumber) || 1));
  const offset = day - 1;
  const weekdayIdx = (CALENDAR_EPOCH.weekday + offset) % 7;
  // walk forward one month at a time so month lengths never have to be perfect
  let month = CALENDAR_EPOCH.month;
  let dayOfMonth = CALENDAR_EPOCH.dayOfMonth + offset;
  while (dayOfMonth > 30) { dayOfMonth -= 30; month = (month + 1) % 12; }
  return {
    weekday: WEEKDAYS[weekdayIdx],
    dayOfMonth,
    month: MONTHS[month],
    label: `${WEEKDAYS[weekdayIdx]} ${dayOfMonth} ${MONTHS[month]}`,
    short: `${WEEKDAYS[weekdayIdx].slice(0, 3)} ${dayOfMonth} ${MONTHS[month].slice(0, 3)}`,
  };
}

/** "Night mode" / "Golden hour" / "Daylight" / "Dawn" pill on the lock screen. */
export function phaseInfo(inGameMs) {
  const h = hoursOfDay(inGameMs);
  if (h >= 5 && h < 8) return { band: 'dawn', label: 'Dawn', icon: '🌅', tone: '#fbbf24' };
  if (h >= 8 && h < 17) return { band: 'day', label: 'Daylight', icon: '☀️', tone: '#38bdf8' };
  if (h >= 17 && h < 20) return { band: 'dusk', label: 'Golden hour', icon: '🌇', tone: '#f97316' };
  return { band: 'night', label: 'Night mode', icon: '🌙', tone: '#a78bfa' };
}

/** Status-bar battery, drained a little through the in-game day. */
export function batteryLevel(inGameMs) {
  const h = hoursOfDay(inGameMs);
  return h >= 8 && h < 22 ? 84 : 61;
}

// ---------------------------------------------------------------------------
// Home screen
// ---------------------------------------------------------------------------
/** Phone-clock text for the task banner / HUD. */
export function nextShiftLabel(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s <= 0) return 'Shift ready';
  if (s < 60) return `Shift in ${s}s`;
  return `Shift in ${Math.round(s / 60)}m`;
}

/**
 * The single banner under the clock. Priority: an active job shift, then a
 * booked hotel room, then unread messages, then university enrolment.
 */
export function homeBanner(state, unread = 0) {
  const job = state?.activeJob ? OCCUPATIONS[state.activeJob] : null;
  if (job) {
    return {
      app: 'jobs', icon: '🚚', tone: '#f97316',
      title: `${job.title} shift is live`,
      body: 'Open Jobs to check your task',
      action: 'Task',
    };
  }
  const hotel = state?.leisure?.hotel;
  if (hotel) {
    return {
      app: 'wallet', icon: '🏨', tone: '#fbbf24',
      title: `Room ${hotel.room} booked`,
      body: `${hotel.nights} night${hotel.nights === 1 ? '' : 's'} at the Grand Meridian`,
      action: 'View',
    };
  }
  if (unread > 0) {
    return {
      app: 'messages', icon: '💬', tone: '#38bdf8',
      title: `${unread} new message${unread === 1 ? '' : 's'}`,
      body: 'Dispatch, the Dean and City Hall are waiting',
      action: 'Read',
    };
  }
  const academic = state?.academic;
  if (academic?.activeCourseId && COURSE_BY_ID[academic.activeCourseId]) {
    const course = COURSE_BY_ID[academic.activeCourseId];
    return {
      app: 'university', icon: '🎓', tone: '#6366f1',
      title: `${course.code} · ${course.levelShort}`,
      body: `${course.creditsRequired} credits to ${course.degreeAward}`,
      action: 'Open',
    };
  }
  return {
    app: 'university', icon: '🎁', tone: '#6366f1',
    title: 'Enrolment is open',
    body: '1,105 courses across 12 faculties',
    action: 'Browse',
  };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
const THREAD_META = {
  dispatch: { from: 'Metro Dispatch', icon: '🚚', tone: '#f97316' },
  dean: { from: "MGU Dean's Office", icon: '🎓', tone: '#6366f1' },
  hotel: { from: 'Grand Meridian', icon: '🏨', tone: '#fbbf24' },
  bank: { from: 'Metro Bank', icon: '💳', tone: '#0ea5e9' },
  city: { from: 'City Hall', icon: '🏙', tone: '#22c55e' },
};

/**
 * Inbox threads derived from the save. `seen` is the set of thread ids the
 * player has already opened (the UI keeps it in memory).
 */
export function messagesFor(state, seen = new Set()) {
  const job = state?.activeJob ? OCCUPATIONS[state.activeJob] : null;
  const academic = state?.academic || {};
  const course = academic.activeCourseId ? COURSE_BY_ID[academic.activeCourseId] : null;
  const hotel = state?.leisure?.hotel || null;
  const cash = Number(state?.cash || 0);
  const earned = Number(state?.stats?.totalEarned || 0);

  const threads = [
    {
      id: 'dispatch',
      lines: job
        ? [
          { me: false, text: `You're clocked in as ${job.title}. Task details are on the banner — tap Jobs.` },
          { me: true, text: 'On my way.' },
          { me: false, text: `Base pay: ${money(job.basePay)} a shift, plus distance.` },
        ]
        : [
          { me: false, text: 'No shift clocked in. Open Jobs and pick up work when you are ready.' },
          { me: false, text: `Open roles: ${Object.values(OCCUPATIONS).filter((o) => o.kind === 'starter').map((o) => o.title).join(' · ')}.` },
        ],
    },
    {
      id: 'dean',
      lines: course
        ? [
          { me: false, text: `Enrolled: ${course.code} — ${course.title}.` },
          { me: false, text: `${course.creditsRequired} credits for your ${course.degreeAward}. Current GPA ${(academic.gpa || 0).toFixed(2)}.` },
        ]
        : [
          { me: false, text: 'Open enrolment is live. 1,105 courses, 12 faculties, free certificates to PhDs.' },
          { me: true, text: 'I will look at the catalog today.' },
        ],
    },
    {
      id: 'hotel',
      lines: hotel
        ? [
          { me: false, text: `Room ${hotel.room} is confirmed for ${hotel.nights} night${hotel.nights === 1 ? '' : 's'}.` },
          { me: false, text: 'Ride the lift up and use the bed to sleep. Check out from the lobby at the end of your stay.' },
        ]
        : [
          { me: false, text: 'Rooms from $120 a night — standard, deluxe and penthouse.' },
          { me: false, text: 'Book at the front desk in the South Waterfront lobby.' },
        ],
    },
    {
      id: 'bank',
      lines: [
        { me: false, text: `Cash on hand: ${money(cash)}.` },
        { me: false, text: `Lifetime earnings: ${money(earned)} across ${Number(state?.stats?.tasksCompleted || 0)} completed jobs.` },
      ],
    },
    {
      id: 'city',
      lines: [
        { me: false, text: 'Welcome to Metro City. Press O any time to open this phone.' },
        { me: false, text: 'Garage, University, Jobs and Wallet all live in here — the side buttons are just shortcuts.' },
      ],
    },
  ];

  const PING = { dispatch: !!job, dean: !!course, hotel: !!hotel, bank: false, city: false };
  return threads.map((t) => ({
    ...THREAD_META[t.id],
    ...t,
    unread: !!PING[t.id] && !seen.has(t.id),
    preview: t.lines[t.lines.length - 1].text,
  }));
}

export function unreadCount(state, seen = new Set()) {
  return messagesFor(state, seen).filter((t) => t.unread).length;
}

// ---------------------------------------------------------------------------
// App cards
// ---------------------------------------------------------------------------
function modelName(id) {
  return VEHICLE_MODELS[id]?.name || 'Vehicle';
}

function pct(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

/** Garage rows with condition, fuel and a ready-to-show roadside quote. */
export function garageRows(state, { hasGarage = false } = {}) {
  const vehicles = Array.isArray(state?.vehicles) ? state.vehicles : [];
  return vehicles.map((v) => {
    const cond = v.cond || { hp: 100, fuel: 100, tires: 100, engine: 100 };
    const quote = roadsideRepairQuote(cond, hasGarage);
    return {
      id: v.id,
      name: modelName(v.model),
      color: v.color || '#94a3b8',
      hp: pct(cond.hp),
      fuel: pct(cond.fuel),
      tires: pct(cond.tires),
      engine: pct(cond.engine),
      wrecked: cond.hp <= 0,
      repairCost: quote.total,
      canRefuel: canEmergencyRefuel(cond),
      health: cond.hp >= 85 ? 'Excellent' : cond.hp >= 60 ? 'Good' : cond.hp >= 30 ? 'Worn' : cond.hp > 0 ? 'Critical' : 'Wrecked',
    };
  });
}

/** Student card: enrolment, credits, GPA and the next degree. */
export function uniCard(state) {
  const a = state?.academic || {};
  const course = a.activeCourseId ? COURSE_BY_ID[a.activeCourseId] : null;
  const credits = Object.values(a.creditsByCourse || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const enrolled = Array.isArray(a.enrolledIds) ? a.enrolledIds.length : 0;
  const completed = Array.isArray(a.completedIds) ? a.completedIds.length : 0;
  return {
    enrolled: !!course,
    matricNo: a.matricNo || '—',
    code: course?.code || null,
    title: course?.title || null,
    faculty: course?.facultyName || null,
    icon: course?.facultyIcon || '🎓',
    degree: course?.degreeAward || null,
    required: course?.creditsRequired || 0,
    credits,
    progress: course ? Math.min(1, credits / Math.max(1, course.creditsRequired)) : 0,
    gpa: Number(a.gpa || 0),
    enrolledCount: enrolled,
    completedCount: completed,
    lectures: Number(a.lecturesAttended || 0),
    sessions: Number(a.studySessions || 0),
  };
}

/** Job card: current occupation, rank and pay multiplier. */
export function jobCard(state) {
  const job = state?.activeJob ? OCCUPATIONS[state.activeJob] : null;
  const xp = job ? Number(state?.jobXP?.[state.activeJob] || 0) : 0;
  const businesses = state?.businesses || {};
  const startups = Object.values(businesses).filter(Boolean).length;
  const iconByJob = { courier: '🚚', security: '🛡', cabbie: '🚕', mechanic: '🔧', chef: '👨‍🍳', dispatcher: '📦', engineer: '💻' };
  return {
    clockedIn: !!job,
    id: job?.id || null,
    name: job?.title || 'Unemployed',
    icon: job ? (iconByJob[job.id] || '💼') : '💼',
    pay: job ? job.basePay : 0,
    kind: job?.kind || null,
    xp,
    rank: job ? rankLabel(xp) : '—',
    startups,
    startupSlots: Object.keys(BUSINESSES).length,
  };
}

function rankLabel(xp) {
  const tiers = [0, 120, 320, 640, 1100, 1700, 2500];
  const names = ['Rookie', 'Trainee', 'Pro', 'Veteran', 'Elite', 'Legend', 'Icon'];
  let tier = 0;
  for (let i = 0; i < tiers.length; i++) if (xp >= tiers[i]) tier = i;
  const base = tiers[tier];
  const next = tiers[tier + 1];
  return {
    name: names[tier],
    into: xp - base,
    span: next ? next - base : 0,
    progress: next ? (xp - base) / (next - base) : 1,
  };
}

/** Wallet card: cash, lifetime earnings and asset counts. */
export function walletCard(state) {
  const businesses = state?.businesses || {};
  const startups = Object.values(businesses).filter(Boolean).length;
  return {
    cash: Number(state?.cash || 0),
    earned: Number(state?.stats?.totalEarned || 0),
    spent: Number(state?.stats?.cashSpent || 0),
    tasks: Number(state?.stats?.tasksCompleted || 0),
    vehicles: Array.isArray(state?.vehicles) ? state.vehicles.length : 0,
    startups,
    builds: Array.isArray(state?.builds?.pieces) ? state.builds.pieces.length : 0,
  };
}

/** Landmarks sorted by distance from the player, for the Map app. */
export function nearbyPlaces(x, z, limit = 6) {
  const points = [
    ...PUBLIC_PLACES.map((p) => ({ id: p.id, name: p.short || p.name, icon: p.icon, x: p.x, z: p.z, kind: 'Civic' })),
    ...Object.values(STATIONS).map((s) => ({ id: s.id, name: s.name, icon: '🏢', x: s.x, z: s.z, kind: 'Job HQ' })),
    ...Object.values(FUEL_STATIONS).map((s) => ({ id: `fuel-${s.id}`, name: `${s.name} Express`, icon: '⛽', x: s.x, z: s.z, kind: 'Fuel' })),
    { id: DEALERSHIP.id, name: DEALERSHIP.name, icon: '🚗', x: DEALERSHIP.x, z: DEALERSHIP.z, kind: 'Dealer' },
    { id: BOUTIQUE.id, name: BOUTIQUE.name, icon: '👗', x: BOUTIQUE.x, z: BOUTIQUE.z, kind: 'Shop' },
    { id: UNIVERSITY.id, name: UNIVERSITY.name, icon: '🎓', x: UNIVERSITY.x, z: UNIVERSITY.z, kind: 'Campus' },
  ];
  return points
    .map((p) => ({
      ...p,
      distance: Math.round(Math.hypot(p.x - x, p.z - z)),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, limit));
}

/** Build app summary: what you own and what the palette holds. */
export function buildCard(state) {
  const pieces = Array.isArray(state?.builds?.pieces) ? state.builds.pieces : [];
  const blocks = pieces.filter((p) => BUILD_ITEMS.find((i) => i.id === p.item)?.cat === 'block').length;
  return {
    pieces: pieces.length,
    blocks,
    structures: pieces.length - blocks,
    blockTypes: BUILD_ITEMS.filter((i) => i.cat === 'block').length,
  };
}

/** Small red badges on the home icons. */
export function appBadges(state, seen = new Set()) {
  return {
    messages: unreadCount(state, seen),
    university: state?.academic?.activeCourseId ? 1 : 0,
    jobs: state?.activeJob ? 1 : 0,
  };
}

export { dayOf };
