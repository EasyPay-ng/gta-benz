// MetroVenture 3D — public places & civic services (pure data + state logic).
//
// The South Waterfront district is a grand pedestrian civic quarter: a landmark
// hotel, a hospital, an art museum, a cinema & shopping mall, a fitness club and
// a public library. Every one of them is a walk-in 3D building with interactive
// service counters. This module owns the definitions and the pure economy
// functions behind each service (no Three.js, fully unit-tested).

import { applyWellbeing, MAX_HEALTH, MAX_ENERGY, createLeisureState } from './props.js';

// ---------------------------------------------------------------------------
// District geometry (consumed by src/world.js)
// ---------------------------------------------------------------------------
export const DISTRICT = {
  id: 'waterfront',
  name: 'South Waterfront',
  minX: -162,
  maxX: 162,
  minZ: 157,
  maxZ: 240,
  avenueZ: 190,      // new cross avenue dividing the north & south bands
  promenadeZ: 226,   // beachfront promenade
  beachZ: 231,       // sand strip
};

// ---------------------------------------------------------------------------
// Public place definitions
// ---------------------------------------------------------------------------
export const PUBLIC_PLACES = [
  {
    id: 'grand_hotel',
    name: 'The Grand Meridian Hotel',
    short: 'Grand Hotel',
    type: 'hotel',
    icon: '🏨',
    color: '#fbbf24',
    x: -112.5, z: 211, width: 26, depth: 22, height: 47,
    yaw: Math.PI, kind: 'tower', themeId: 'hotel', mapLabel: 'H',
    services: ['hotel'],
    blurb: 'A 14-storey landmark with marble lobby, sky restaurant, penthouses and a rooftop pool deck. Book a room and sleep it off in style.',
  },
  {
    id: 'metro_hospital',
    name: 'Metro General Hospital',
    short: 'Metro General',
    type: 'hospital',
    icon: '🏥',
    color: '#34d399',
    x: -37.5, z: 211, width: 30, depth: 22, height: 8.6,
    yaw: Math.PI, kind: 'hall', themeId: 'medical', mapLabel: '+',
    services: ['hospital'],
    blurb: '24/7 emergency and outpatient care. Get patched up, top up your health and rest in the ward.',
  },
  {
    id: 'metro_museum',
    name: 'Metro Museum of Art',
    short: 'Museum of Art',
    type: 'museum',
    icon: '🖼',
    color: '#a78bfa',
    x: 37.5, z: 211, width: 30, depth: 22, height: 8.6,
    yaw: Math.PI, kind: 'hall', themeId: 'corporate', mapLabel: 'A',
    services: ['museum'],
    blurb: 'Marble halls of sculpture, old masters and a rooftop gallery. Buy a ticket or wander the free collection.',
  },
  {
    id: 'metro_mall',
    name: 'Metro Central Mall & Cineplex',
    short: 'Central Mall',
    type: 'mall',
    icon: '🛍',
    color: '#38bdf8',
    x: 112.5, z: 211, width: 34, depth: 22, height: 9.2,
    yaw: Math.PI, kind: 'hall', themeId: 'tech', mapLabel: 'C',
    services: ['mall'],
    blurb: 'Two floors of boutiques, a food court and a six-screen cineplex. Shop couture, grab a meal or catch a movie.',
  },
  {
    id: 'metro_gym',
    name: 'Metro Iron Fitness Club',
    short: 'Iron Fitness',
    type: 'gym',
    icon: '🏋',
    color: '#f97316',
    x: -112.5, z: 170, width: 26, depth: 20, height: 7.8,
    yaw: 0, kind: 'hall', themeId: 'tech', mapLabel: 'G',
    services: ['gym'],
    blurb: 'Treadmills, free weights and a boxing ring. Training raises your fitness — and fitness makes you sprint faster.',
  },
  {
    id: 'metro_library',
    name: 'Metro Public Library',
    short: 'Public Library',
    type: 'library',
    icon: '📚',
    color: '#60a5fa',
    x: 112.5, z: 170, width: 26, depth: 20, height: 7.8,
    yaw: 0, kind: 'hall', themeId: 'corporate', mapLabel: 'L',
    services: ['library'],
    blurb: 'Free study desks, reading rooms and 40,000 volumes. Borrow a book or study for your university credits.',
  },
];

export const PLACE_BY_ID = Object.fromEntries(PUBLIC_PLACES.map((p) => [p.id, p]));

export function placeById(id) {
  return PLACE_BY_ID[id] || null;
}

export function placesOfType(type) {
  return PUBLIC_PLACES.filter((p) => p.type === type);
}

// ---------------------------------------------------------------------------
// Hotel
// ---------------------------------------------------------------------------
export const HOTEL_ROOMS = [
  {
    id: 'standard', name: 'Standard King Room', icon: '🛏', price: 120,
    blurb: 'King bed, city view, breakfast included.',
  },
  {
    id: 'deluxe', name: 'Deluxe Skyline Suite', icon: '🌆', price: 260,
    blurb: 'Corner suite on a high floor with a panoramic skyline view.',
  },
  {
    id: 'penthouse', name: 'Meridian Penthouse', icon: '👑', price: 640,
    blurb: 'Top-floor penthouse: private pool deck, butler and champagne.',
  },
];

export const ROOM_BY_ID = Object.fromEntries(HOTEL_ROOMS.map((r) => [r.id, r]));

export const MAX_HOTEL_NIGHTS = 7;

function ensureLeisure(state) {
  if (!state.leisure) state.leisure = createLeisureState();
  return state.leisure;
}

function roomNumberFor(roomType, nights) {
  const base = roomType === 'penthouse' ? 1401 : roomType === 'deluxe' ? 901 : 201;
  return base + Math.max(1, nights) * 3 + Math.floor(Math.random() * 12);
}

/** Book a hotel room for `nights` (1–7). Returns { ok, msg, room, total }. */
export function bookHotelRoom(state, { roomType = 'standard', nights = 1, day = 1, now = Date.now() } = {}) {
  const room = ROOM_BY_ID[roomType] || HOTEL_ROOMS[0];
  const n = Math.max(1, Math.min(MAX_HOTEL_NIGHTS, Math.floor(nights) || 1));
  const total = room.price * n;
  if ((state.cash || 0) < total) {
    return { ok: false, msg: `The ${room.name} costs $${total} for ${n} night${n === 1 ? '' : 's'} — you can't cover it.` };
  }
  const leisure = ensureLeisure(state);
  if (leisure.hotel) {
    return { ok: false, msg: `You already have room ${leisure.hotel.room} booked — check out first.` };
  }
  state.cash -= total;
  const roomNo = roomNumberFor(room.id, n);
  leisure.hotel = {
    placeId: 'grand_hotel',
    room: roomNo,
    nights: n,
    night: 1,
    day: Math.max(1, Math.floor(day) || 1),
    roomType: room.id,
  };
  applyWellbeing(leisure, { comfort: 22, energy: 12, health: 6 });
  return {
    ok: true,
    room: roomNo,
    total,
    nights: n,
    msg: `🏨 Checked in to room ${roomNo} (${room.name}) for ${n} night${n === 1 ? '' : 's'} — $${total}. Sleep in any hotel bed upstairs.`,
  };
}

export function checkoutHotel(state) {
  const leisure = ensureLeisure(state);
  if (!leisure.hotel) return { ok: false, msg: 'You are not checked in anywhere.' };
  const { room } = leisure.hotel;
  leisure.hotel = null;
  return { ok: true, msg: `🧾 Checked out of room ${room}. Thanks for staying at The Grand Meridian!` };
}

/** Sleep a night in your booked room. */
export function sleepHotelNight(state, { now = Date.now() } = {}) {
  const leisure = ensureLeisure(state);
  const hotel = leisure.hotel;
  if (!hotel) return { ok: false, msg: 'Check in at the hotel front desk before sleeping here.' };
  const room = ROOM_BY_ID[hotel.roomType] || HOTEL_ROOMS[0];
  const full = room.id === 'penthouse' ? 100 : room.id === 'deluxe' ? 72 : 58;
  applyWellbeing(leisure, { energy: full, comfort: 34, health: 10 });
  hotel.night += 1;
  leisure.stats.sleeps = (leisure.stats.sleeps || 0) + 1;
  leisure.stats.naps = (leisure.stats.naps || 0) + 1;
  const done = hotel.night > hotel.nights;
  if (done) {
    const roomNo = hotel.room;
    leisure.hotel = null;
    return { ok: true, nightsLeft: 0, msg: `🛏 You slept like a rock in the ${room.name} (room ${roomNo}). That was your last booked night — checkout complete.` };
  }
  return {
    ok: true,
    nightsLeft: hotel.nights - hotel.night + 1,
    msg: `🛏 Room-service breakfast and a deep sleep in the ${room.name}. ${hotel.nights - hotel.night + 1} night(s) left.`,
  };
}

export function hotelStatus(state) {
  const hotel = state?.leisure?.hotel;
  if (!hotel) return null;
  const room = ROOM_BY_ID[hotel.roomType] || HOTEL_ROOMS[0];
  return {
    ...hotel,
    roomName: room.name,
    nightsLeft: Math.max(0, hotel.nights - hotel.night + 1),
    label: `Room ${hotel.room} · ${room.name} · ${Math.max(0, hotel.nights - hotel.night + 1)} night(s) left`,
  };
}

// ---------------------------------------------------------------------------
// Hospital
// ---------------------------------------------------------------------------
export const TREATMENT_PRICES = {
  checkup: 45,
  emergency: 120,
  full: 260,
};

export function treatPatient(state, { tier = 'checkup', now = Date.now() } = {}) {
  const price = TREATMENT_PRICES[tier];
  if (!price) return { ok: false, msg: 'Unknown treatment.' };
  if ((state.cash || 0) < price) return { ok: false, msg: `That treatment costs $${price}.` };
  const leisure = ensureLeisure(state);
  if (leisure.health >= MAX_HEALTH && leisure.energy >= MAX_ENERGY && tier === 'checkup') {
    return { ok: false, msg: 'The doctor says you are fighting fit already.' };
  }
  state.cash -= price;
  if (tier === 'checkup') applyWellbeing(leisure, { health: 25, comfort: 8 });
  else if (tier === 'emergency') applyWellbeing(leisure, { health: 60, energy: 30, comfort: 10 });
  else applyWellbeing(leisure, { health: MAX_HEALTH, energy: MAX_ENERGY, comfort: 40 });
  leisure.stats.visits = (leisure.stats.visits || 0) + 1;
  const labels = {
    checkup: '🩺 A quick checkup — vitals look good.',
    emergency: '🚑 The ER team patches you up.',
    full: '🏥 Full-body treatment complete. You feel brand new.',
  };
  return { ok: true, msg: `${labels[tier]} (-$${price})` };
}

// ---------------------------------------------------------------------------
// Museum
// ---------------------------------------------------------------------------
export const MUSEUM_TICKETS = {
  general: 22,
  guided: 48,
  patron: 150,
};

export function visitMuseum(state, { tier = 'general', now = Date.now() } = {}) {
  const price = MUSEUM_TICKETS[tier];
  if (!price) return { ok: false, msg: 'Unknown ticket.' };
  if ((state.cash || 0) < price) return { ok: false, msg: `That ticket costs $${price}.` };
  state.cash -= price;
  const leisure = ensureLeisure(state);
  const comfort = tier === 'general' ? 10 : tier === 'guided' ? 20 : 34;
  const health = tier === 'patron' ? 6 : 0;
  applyWellbeing(leisure, { comfort, health });
  leisure.stats.visits = (leisure.stats.visits || 0) + 1;
  if (tier === 'patron') {
    state.stats = state.stats || {};
    state.stats.totalEarned = (state.stats.totalEarned || 0) + 25;
    state.cash += 25; // patron gift-shop voucher
  }
  const labels = {
    general: '🖼 You wander the galleries and lose track of time.',
    guided: '🗣 A curator walks you through the collection — fascinating.',
    patron: '👑 Private after-hours tour, champagne on the rooftop gallery, +$25 gift-shop voucher.',
  };
  return { ok: true, msg: `${labels[tier]} (-$${price})` };
}

// ---------------------------------------------------------------------------
// Gym
// ---------------------------------------------------------------------------
export const GYM_OFFERS = {
  daypass: { price: 30, fitness: 6, comfort: 6, name: 'Day pass' },
  pt: { price: 90, fitness: 15, comfort: 8, name: 'Personal training session' },
  membership: { price: 240, fitness: 26, comfort: 14, name: 'Monthly membership' },
};

export function buyGymOffer(state, { offer = 'daypass', now = Date.now() } = {}) {
  const def = GYM_OFFERS[offer];
  if (!def) return { ok: false, msg: 'Unknown gym package.' };
  if ((state.cash || 0) < def.price) return { ok: false, msg: `${def.name} costs $${def.price}.` };
  state.cash -= def.price;
  const leisure = ensureLeisure(state);
  applyWellbeing(leisure, { fitness: def.fitness, comfort: def.comfort, energy: -12 });
  leisure.stats.workouts = (leisure.stats.workouts || 0) + 1;
  return {
    ok: true,
    msg: `🏋 ${def.name} complete — +${def.fitness} fitness, comfort +${def.comfort}. (-$${def.price})`,
  };
}

// ---------------------------------------------------------------------------
// Mall & cinema
// ---------------------------------------------------------------------------
export const FOOD_COURT_MEALS = [
  { id: 'jollof', name: 'Jollof rice & grilled chicken', price: 18, energy: 34, comfort: 12 },
  { id: 'suya', name: 'Suya platter', price: 14, energy: 22, comfort: 10 },
  { id: 'burger', name: 'Metro double burger', price: 16, energy: 28, comfort: 8 },
  { id: 'smoothie', name: 'Fresh mango smoothie', price: 9, energy: 14, comfort: 6 },
];

export const MOVIES = [
  { id: 'heist', title: 'Metro Heist', icon: '🎬', price: 22, comfort: 30, runtime: '1h 54m', rating: 'PG-13' },
  { id: 'hearts', title: 'Lagos Nights', icon: '💛', price: 20, comfort: 26, runtime: '1h 41m', rating: 'PG' },
  { id: 'chase', title: 'Broad Avenue Chase', icon: '🚓', price: 24, comfort: 34, runtime: '2h 06m', rating: 'R' },
];

export function buyMeal(state, { meal = 'jollof', now = Date.now() } = {}) {
  const def = FOOD_COURT_MEALS.find((m) => m.id === meal);
  if (!def) return { ok: false, msg: 'That meal is off the menu.' };
  if ((state.cash || 0) < def.price) return { ok: false, msg: `${def.name} costs $${def.price}.` };
  state.cash -= def.price;
  const leisure = ensureLeisure(state);
  applyWellbeing(leisure, { energy: def.energy, comfort: def.comfort });
  leisure.stats.meals = (leisure.stats.meals || 0) + 1;
  return { ok: true, msg: `🍽 ${def.name} — delicious. (+${def.energy} energy) (-$${def.price})` };
}

export function watchMovie(state, { movie = 'heist', now = Date.now() } = {}) {
  const def = MOVIES.find((m) => m.id === movie);
  if (!def) return { ok: false, msg: 'That screening is sold out.' };
  if ((state.cash || 0) < def.price) return { ok: false, msg: `A ticket for ${def.title} costs $${def.price}.` };
  state.cash -= def.price;
  const leisure = ensureLeisure(state);
  applyWellbeing(leisure, { comfort: def.comfort, energy: 8 });
  leisure.stats.movies = (leisure.stats.movies || 0) + 1;
  return { ok: true, msg: `🍿 ${def.icon} ${def.title} (${def.runtime}) — great popcorn, better ending. (-$${def.price})` };
}

// ---------------------------------------------------------------------------
// Public library
// ---------------------------------------------------------------------------
export function borrowBook(state) {
  const leisure = ensureLeisure(state);
  applyWellbeing(leisure, { comfort: 12, energy: 4 });
  leisure.stats.reads = (leisure.stats.reads || 0) + 1;
  return { ok: true, msg: '📚 You borrow a novel from the Metro Public Library — it is due back in three weeks.' };
}

export function libraryDeskLabel(place) {
  return place?.type === 'library' ? 'Metro Public Library — front desk' : 'Front desk';
}

// ---------------------------------------------------------------------------
// Service catalogue used by the UI
// ---------------------------------------------------------------------------
export const SERVICE_DEFS = {
  hotel: { icon: '🏨', title: 'Hotel check-in', placeId: 'grand_hotel' },
  hospital: { icon: '🏥', title: 'Hospital reception', placeId: 'metro_hospital' },
  museum: { icon: '🖼', title: 'Museum ticketing', placeId: 'metro_museum' },
  mall: { icon: '🛍', title: 'Mall concierge', placeId: 'metro_mall' },
  gym: { icon: '🏋', title: 'Gym front desk', placeId: 'metro_gym' },
  library: { icon: '📚', title: 'Library desk', placeId: 'metro_library' },
};

export function servicesForPlace(placeId) {
  const place = placeById(placeId);
  return place ? place.services.map((s) => ({ id: s, ...(SERVICE_DEFS[s] || {}) })) : [];
}
