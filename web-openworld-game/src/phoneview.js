// MetroVenture 3D — MetroPhone screen markup (pure string builders).
//
// Every screen of the in-game phone is a pure function of a view-model:
//   { state, now, seen, thread, player, cameraFirst, muted }
// so the whole UI can be rendered and asserted in Node tests without a browser.

import * as Phone from './phone.js';
import { money } from './economy.js';
import { dayOf } from './time.js';
import { OCCUPATIONS, STATIONS, ROADSIDE_FUEL_FEE } from './data.js';

export const PHONE_ACTIONS = [
  'repair', 'refuel', 'openGarage', 'openUni', 'clockOut',
  'openBuild', 'openLook', 'camera', 'mute', 'save', 'load', 'help', 'reset',
];

/** Status bar: phone clock, signal and battery. */
export function statusHtml(now) {
  const clock = Phone.clockParts(now);
  const batt = Phone.batteryLevel(now);
  return `<span>${clock.label}${clock.suffix}</span>`
    + '<span class="phone-net">▮▮▮ 4G</span>'
    + `<span class="phone-batt" style="--fill:${batt}%"><i></i>${batt}%</span>`;
}

export const PHONE_BARS = [
  ['hp', 'Body', '#22c55e'],
  ['fuel', 'Fuel', '#f59e0b'],
  ['tires', 'Tyres', '#38bdf8'],
  ['engine', 'Engine', '#a855f7'],
];

export function phoneTile(app, badge = 0) {
  if (!app) return '';
  return `<button class="phone-app" data-phone-app="${app.id}" title="${app.name} — ${app.hint}">
    <span class="app-icon" style="--tone:${app.tone}">${app.icon}${badge ? `<i class="app-badge">${badge}</i>` : ''}</span>
    <small>${app.name}</small>
  </button>`;
}

export function homeHtml(vm) {
  const { state: s, now } = vm;
  const clock = Phone.clockParts(now);
  const cal = Phone.calendarFor(dayOf(now));
  const phase = Phone.phaseInfo(now);
  const unread = Phone.unreadCount(s, vm.seen);
  const banner = Phone.homeBanner(s, unread);
  const badges = Phone.appBadges(s, vm.seen);
  const tiles = Phone.PHONE_APPS.map((a) => phoneTile(a, badges[a.id] || 0)).join('');
  const dock = Phone.PHONE_DOCK.map((id) => phoneTile(Phone.appById(id), badges[id] || 0, true)).join('');
  return `<div class="phone-home">
    <div class="phone-hero">
      <div class="phone-clock">${clock.label}<span>${clock.suffix}</span></div>
      <div class="phone-date">${cal.label} · Metro City</div>
      <div class="phone-pill" style="--tone:${phase.tone}">${phase.icon} ${phase.label}</div>
    </div>
    <button class="phone-banner" data-phone-app="${banner.app}" style="--tone:${banner.tone}">
      <span class="pb-icon">${banner.icon}</span>
      <span class="pb-text"><b>${banner.title}</b><small>${banner.body}</small></span>
      <span class="pb-action">${banner.action}</span>
    </button>
    <div class="phone-grid">${tiles}</div>
    <div class="phone-dock">${dock}</div>
    <div class="phone-homebar"><i></i></div>
  </div>`;
}

export function phoneHead(app, sub = '') {
  return `<div class="phone-appbar">
    <button class="phone-back" data-phone-app="home" aria-label="Back to home">‹</button>
    <b>${app.icon} ${app.name}</b>${sub ? `<span class="phone-sub">${sub}</span>` : ''}
  </div>`;
}

export function phoneBar(value, tone, label) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return `<div class="pc-row" style="margin:6px 0 3px"><span class="pc-muted">${label}</span><span class="pc-muted">${v}%</span></div>
    <div class="phone-bar" style="--tone:${tone}"><i style="width:${v}%"></i></div>`;
}

export function screenHtml(vm, appId) {
  const app = Phone.appById(appId) || { name: 'Phone', icon: '📱' };
  if (appId === 'garage') return phoneHead(app, 'Roadside assist') + phoneGarageHtml(vm);
  if (appId === 'university') return phoneHead(app, 'Metro Grand University') + phoneUniHtml(vm);
  if (appId === 'jobs') return phoneHead(app, 'Shifts & startups') + phoneJobsHtml(vm);
  if (appId === 'messages') return phoneMessagesHtml(vm);
  if (appId === 'wallet') return phoneHead(app, 'Cash & assets') + phoneWalletHtml(vm);
  if (appId === 'map') return phoneHead(app, 'Nearby places') + phoneMapHtml(vm);
  if (appId === 'build') return phoneHead(app, '3D Architect') + phoneBuildHtml(vm);
  if (appId === 'wardrobe') return phoneHead(app, 'Look & wardrobe') + phoneLookHtml(vm);
  if (appId === 'settings') return phoneHead(app, 'Game options') + phoneSettingsHtml(vm);
  if (appId === 'help') return phoneHead(app, 'Controls') + phoneHelpHtml(vm);
  return phoneHead(app) + '<div class="phone-scroll"><div class="pc"><p>Nothing here yet.</p></div></div>';
}

function phoneGarageHtml(vm) {
  const s = vm.state;
  const rows = Phone.garageRows(s, { hasGarage: !!s.businesses?.garage });
  if (!rows.length) return '<div class="phone-scroll"><div class="pc"><p>No vehicles yet — visit Metro Motors to buy your first car.</p></div></div>';
  const cards = rows.map((v) => `
    <div class="pc">
      <h4><span class="phone-tag" style="background:${v.color};min-width:10px;height:10px;padding:0;border-radius:3px"></span>
        ${v.name}<span class="phone-tag" style="margin-left:auto">${v.health}</span></h4>
      ${PHONE_BARS.map(([key, label, tone]) => phoneBar(v[key], tone, label)).join('')}
      <div class="phone-btns">
        <button class="phone-btn primary" data-phone-act="repair" data-veh="${v.id}" ${v.repairCost ? '' : 'disabled'}>
          🔧 Roadside repair ${v.repairCost ? money(v.repairCost) : '—'}
        </button>
        <button class="phone-btn" data-phone-act="refuel" data-veh="${v.id}" ${v.canRefuel ? '' : 'disabled'}>⛽ Fuel ${money(ROADSIDE_FUEL_FEE)}</button>
      </div>
    </div>`).join('');
  return `<div class="phone-scroll">
    ${cards}
    <div class="pc">
      <h4>🛠 Full garage</h4>
      <p>Full diagnostics, resprays, wheel &amp; livery work and valet are in the Garage app on the main screen — or press <b>T</b> in the city.</p>
      <div class="phone-btns"><button class="phone-btn" data-phone-act="openGarage">Open Garage</button></div>
    </div>
  </div>`;
}

function phoneUniHtml(vm) {
  const u = Phone.uniCard(vm.state);
  const card = u.enrolled
    ? `<div class="pc">
        <h4>${u.icon} ${u.code} · ${u.degree}</h4>
        <p>${u.title}</p>
        <div class="pc-row" style="margin:10px 0 4px"><span class="pc-muted">Credits</span><span class="pc-muted">${u.credits} / ${u.required}</span></div>
        <div class="phone-bar" style="--tone:#6366f1"><i style="width:${Math.round(u.progress * 100)}%"></i></div>
        <div class="pc-row" style="margin-top:10px"><span class="pc-muted">GPA</span><span>${u.gpa.toFixed(2)}</span></div>
        <div class="pc-row"><span class="pc-muted">Lectures</span><span>${u.lectures}</span></div>
        <div class="pc-row"><span class="pc-muted">Study sessions</span><span>${u.sessions}</span></div>
      </div>`
    : `<div class="pc">
        <h4>🎓 Not enrolled</h4>
        <p>1,105 real-world courses across 12 faculties — free certificates up to PhDs, with degree grants and career multipliers.</p>
      </div>`;
  return `<div class="phone-scroll">
    <div class="pc">
      <h4>🪪 Student card</h4>
      <div class="pc-row"><span class="pc-muted">Matric no.</span><span>${u.matricNo}</span></div>
      <div class="pc-row"><span class="pc-muted">Courses</span><span>${u.enrolledCount} enrolled · ${u.completedCount} completed</span></div>
    </div>
    ${card}
    <div class="phone-btns">
      <button class="phone-btn primary" data-phone-act="openUni">🎓 Browse the catalog</button>
    </div>
  </div>`;
}

function phoneJobsHtml(vm) {
  const s = vm.state;
  const j = Phone.jobCard(s);
  const rank = typeof j.rank === 'object' ? j.rank : { name: j.rank, progress: 0, into: 0, span: 0 };
  const starters = Object.values(OCCUPATIONS).filter((o) => o.kind === 'starter');
  const px = vm.player?.x ?? 0;
  const pz = vm.player?.z ?? 0;
  const rows = starters.map((o) => {
    const hq = Object.values(STATIONS).find((st) => st.occupation === o.id);
    const dist = hq ? Math.round(Math.hypot(hq.x - px, hq.z - pz)) : null;
    return `<div class="phone-row">
      <span class="pr-icon" style="--tone:#10b981">${o.id === 'courier' ? '🚚' : o.id === 'security' ? '🛡' : '🚕'}</span>
      <span class="pr-text"><b>${o.title}</b><small>${money(o.basePay)} a shift${dist != null ? ` · HQ ${dist} m` : ''}</small></span>
      <span class="pr-side">${s.activeJob === o.id ? 'Active' : 'Apply at HQ'}</span>
    </div>`;
  }).join('');
  return `<div class="phone-scroll">
    <div class="pc">
      <h4>${j.icon} ${j.name}</h4>
      <p>${j.clockedIn ? 'Clocked in — finish the task on your banner to get paid.' : 'Not clocked in. Walk into a job HQ to start a shift.'}</p>
      <div class="pc-row" style="margin:10px 0 4px"><span class="pc-muted">${rank.name} · ${j.xp} XP</span><span class="pc-muted">${rank.span ? `${rank.into} / ${rank.span}` : 'MAX'}</span></div>
      <div class="phone-bar" style="--tone:#10b981"><i style="width:${Math.round((rank.progress || 0) * 100)}%"></i></div>
      <div class="pc-row" style="margin-top:10px"><span class="pc-muted">Startups</span><span>${j.startups} / ${j.startupSlots}</span></div>
      ${j.clockedIn ? '<div class="phone-btns"><button class="phone-btn danger" data-phone-act="clockOut">⏹ Clock out</button></div>' : ''}
    </div>
    <div class="pc"><h4>💼 Open roles</h4><p>Visit the HQ pad to clock in — the phone just keeps track.</p></div>
    ${rows}
  </div>`;
}

function phoneMessagesHtml(vm) {
  const threads = Phone.messagesFor(vm.state, vm.seen);
  const active = vm.thread ? threads.find((t) => t.id === vm.thread) : null;
  if (active) {
    const app = { icon: active.icon, name: active.from };
    const bubbles = active.lines.map((l) => `<div class="phone-bubble ${l.me ? 'me' : ''}">${l.text}</div>`).join('');
    return phoneHead(app, 'Messages')
      + `<div class="phone-scroll"><div class="phone-thread">${bubbles}</div>
         <div class="pc" style="margin-top:auto"><p>They can't type back yet — this line is one-way for now.</p></div></div>`;
  }
  const unread = threads.filter((t) => t.unread).length;
  const rows = threads.map((t) => `<button class="phone-row ${t.unread ? 'unread' : ''}" data-phone-thread="${t.id}">
      <span class="pr-icon" style="--tone:${t.tone}">${t.icon}</span>
      <span class="pr-text"><b>${t.from}</b><small>${t.preview}</small></span>
      <span class="pr-side">${t.unread ? 'NEW' : ''}</span>
    </button>`).join('');
  return phoneHead({ icon: '💬', name: 'Messages' }, unread ? `${unread} new` : 'All read')
    + `<div class="phone-scroll">${rows}</div>`;
}

function phoneWalletHtml(vm) {
  const w = Phone.walletCard(vm.state);
  return `<div class="phone-scroll">
    <div class="pc" style="--tone:#f59e0b">
      <h4>💳 Cash on hand</h4>
      <div class="pc-big">${money(w.cash)}</div>
      <div class="pc-row" style="margin-top:8px"><span class="pc-muted">Lifetime earnings</span><span>${money(w.earned)}</span></div>
      <div class="pc-row"><span class="pc-muted">Jobs completed</span><span>${w.tasks}</span></div>
      <div class="pc-row"><span class="pc-muted">Vehicles</span><span>${w.vehicles}</span></div>
      <div class="pc-row"><span class="pc-muted">Startups</span><span>${w.startups}</span></div>
      <div class="pc-row"><span class="pc-muted">Build pieces</span><span>${w.builds}</span></div>
    </div>
    <div class="pc"><h4>🏦 Metro Bank</h4><p>Cash is carried, not banked — get paid by finishing shifts, serving customers and collecting startup profits.</p></div>
  </div>`;
}

function phoneMapHtml(vm) {
  const p = vm.player || { x: 0, z: 0 };
  const places = Phone.nearbyPlaces(p.x, p.z, 8);
  const compass = (dx, dz) => {
    const ns = dz < -8 ? 'N' : dz > 8 ? 'S' : '';
    const ew = dx > 8 ? 'E' : dx < -8 ? 'W' : '';
    return (ns + ew) || 'here';
  };
  const rows = places.map((pl) => `<div class="phone-row">
      <span class="pr-icon" style="--tone:#22c55e">${pl.icon}</span>
      <span class="pr-text"><b>${pl.name}</b><small>${pl.kind}</small></span>
      <span class="pr-side">${pl.distance} m<br><small>${compass(pl.x - p.x, pl.z - p.z)}</small></span>
    </div>`).join('');
  return `<div class="phone-scroll">
    <div class="pc"><h4>📍 You are here</h4>
      <div class="pc-row"><span class="pc-muted">Position</span><span>${Math.round(p.x)}, ${Math.round(p.z)}</span></div>
      <div class="pc-row"><span class="pc-muted">Nearest</span><span>${places[0] ? places[0].name : '—'}</span></div>
    </div>
    ${rows}
  </div>`;
}

function phoneBuildHtml(vm) {
  const b = Phone.buildCard(vm.state);
  return `<div class="phone-scroll">
    <div class="pc">
      <h4>🏗 Your builds</h4>
      <div class="pc-row"><span class="pc-muted">Pieces placed</span><span>${b.pieces}</span></div>
      <div class="pc-row"><span class="pc-muted">Voxel blocks</span><span>${b.blocks}</span></div>
      <div class="pc-row"><span class="pc-muted">Structures</span><span>${b.structures}</span></div>
      <p style="margin-top:8px">${b.blockTypes} hand-pixelled Minecraft blocks, walls, floors, stairs, roofs and furniture snap into place with the ghost preview.</p>
      <div class="phone-btns"><button class="phone-btn primary" data-phone-act="openBuild">🏗 Enter Build Mode</button></div>
    </div>
    <div class="pc"><h4>🎮 Controls</h4><p><b>E</b> place · <b>X</b> demolish · <b>Q</b>/<b>R</b> rotate · <b>C</b> colour · <b>Tab</b> item · <b>PgUp</b>/<b>PgDn</b> storey</p></div>
  </div>`;
}

function phoneLookHtml(vm) {
  const a = vm.state?.appearance || {};
  return `<div class="phone-scroll">
    <div class="pc">
      <h4>👕 Current look</h4>
      <div class="pc-row"><span class="pc-muted">Name</span><span>${a.name || 'Citizen'}</span></div>
      <div class="pc-row"><span class="pc-muted">Build</span><span>${a.build || 'Balanced'}</span></div>
      <div class="pc-row"><span class="pc-muted">Shirt</span><span><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${a.shirt || '#2563eb'};vertical-align:-2px"></i> ${a.shirt || '#2563eb'}</span></div>
      <div class="pc-row"><span class="pc-muted">Wardrobe items</span><span>${Array.isArray(vm.state?.wardrobe?.owned) ? vm.state.wardrobe.owned.length : 0}</span></div>
      <div class="phone-btns"><button class="phone-btn primary" data-phone-act="openLook">👤 Open Look &amp; Wardrobe</button></div>
    </div>
  </div>`;
}

function phoneSettingsHtml(vm) {
  const camFirst = !!vm.cameraFirst;
  const muted = !!vm.muted;
  return `<div class="phone-scroll">
    <div class="pc">
      <h4>🎥 Camera</h4>
      <div class="pc-row"><span class="pc-muted">View</span><span>${camFirst ? 'First person' : 'Third person'}</span></div>
      <div class="phone-btns"><button class="phone-btn" data-phone-act="camera">Toggle view</button></div>
    </div>
    <div class="pc">
      <h4>🔊 Sound</h4>
      <div class="pc-row"><span class="pc-muted">Audio</span><span>${muted ? 'Muted' : 'On'}</span></div>
      <div class="phone-btns"><button class="phone-btn" data-phone-act="mute">${muted ? 'Unmute' : 'Mute'}</button></div>
    </div>
    <div class="pc">
      <h4>💾 Save</h4>
      <div class="phone-btns">
        <button class="phone-btn primary" data-phone-act="save">Save now</button>
        <button class="phone-btn" data-phone-act="load">Load save</button>
      </div>
    </div>
    <div class="pc">
      <h4>❔ Help</h4>
      <div class="phone-btns"><button class="phone-btn" data-phone-act="help">Open controls</button></div>
    </div>
    <div class="pc">
      <h4>↺ Reset</h4>
      <p>Deletes this save and starts a brand new citizen.</p>
      <div class="phone-btns"><button class="phone-btn danger" data-phone-act="reset">Reset game</button></div>
    </div>
  </div>`;
}

function phoneHelpHtml(vm) {
  const rows = [
    ['🚶', 'Move', 'WASD · Shift sprint · Space jump'],
    ['🚗', 'Drive', 'F enter/exit · Space handbrake · G horn'],
    ['🖐', 'Interact', 'E use furniture, doors, lifts & counters'],
    ['🏗', 'Build', 'Y build mode · Tab item · PgUp/PgDn storey'],
    ['🎓', 'University', 'U catalog · study at desks in campus'],
    ['🛠', 'Garage', 'T diagnostics, repairs & roadside'],
    ['📱', 'Phone', 'O opens this phone anywhere'],
  ].map(([icon, title, body]) => `<div class="phone-row" style="cursor:default">
      <span class="pr-icon" style="--tone:#64748b">${icon}</span>
      <span class="pr-text"><b>${title}</b><small>${body}</small></span>
    </div>`).join('');
  return `<div class="phone-scroll">${rows}
    <div class="phone-btns"><button class="phone-btn primary" data-phone-act="help">Open full controls</button></div>
  </div>`;
}
