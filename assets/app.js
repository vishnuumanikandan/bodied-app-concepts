/* ============================================================
   BODIED SJ · app logic
   Real dates, local-first state (localStorage), full booking
   lifecycle: book → waitlist → check in → stamps.
   ============================================================ */

/* ============ HELPERS ============ */
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');

function fnv(str){
  let h = 0x811c9dc5;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const DAY_ABBR = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const DAY_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const dateKeyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function fromKey(k){ const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); }
const todayKey = () => dateKeyOf(new Date());

function time12(h, m){
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return { t: `${hh}:${pad(m)}`, ap };
}

/* ============ STATE ============ */
const LS_KEY = 'bodiedsj.app.v1';
let state = { profile: null, bookings: {}, faves: {}, friendSticker: false, theme: null };
try{
  const raw = localStorage.getItem(LS_KEY);
  if(raw) state = Object.assign(state, JSON.parse(raw));
}catch(e){}
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }

/* ============ SCHEDULE INSTANCES ============ */
/* An instance = one class occurrence on one date.
   key = "YYYY-MM-DD|classId|HH:MM" */
const instCache = {};

function instancesFor(date){
  const tpl = WEEK_TEMPLATE[date.getDay()];
  if(tpl === 'rest') return 'rest';
  const dk = dateKeyOf(date);
  return tpl.map(s => {
    const inst = { ...s, dateKey: dk, key: `${dk}|${s.id}|${pad(s.h)}:${pad(s.m)}` };
    instCache[inst.key] = inst;
    return inst;
  });
}
function startOf(inst){ const d = fromKey(inst.dateKey); d.setHours(inst.h, inst.m, 0, 0); return d; }
function endOf(inst){ return new Date(startOf(inst).getTime() + inst.dur * 60000); }
function instFromKey(key){
  if(instCache[key]) return instCache[key];
  const [dk, id, time] = key.split('|');
  const wd = fromKey(dk).getDay();
  const tpl = WEEK_TEMPLATE[wd];
  if(!Array.isArray(tpl)) return null;
  const s = tpl.find(x => x.id === id && pad(x.h) + ':' + pad(x.m) === time);
  if(!s) return null;
  const inst = { ...s, dateKey: dk, key };
  instCache[key] = inst;
  return inst;
}

/* Deterministic "spots left" per instance so the studio feels alive
   but numbers stay stable across reloads. 0 = full (waitlist). */
const seededLeft = key => fnv(key) % 9;            // 0..8
const waitlistPos = key => (fnv(key) % 3) + 1;     // #1..#3
const bookingOf = key => state.bookings[key] || null;

/* ============ BOOKING ACTIONS ============ */
function book(key){
  state.bookings[key] = { status: 'booked', spot: CAPACITY - seededLeft(key) + 1 };
  save();
}
function joinWaitlist(key){
  state.bookings[key] = { status: 'waitlist', pos: waitlistPos(key) };
  save();
}
function cancelBooking(key){ delete state.bookings[key]; save(); }
function checkIn(key){
  const b = state.bookings[key];
  if(b){ b.status = 'attended'; save(); }
}
function attendedList(){
  return Object.entries(state.bookings)
    .filter(([, b]) => b.status === 'attended')
    .map(([key]) => {
      const [dateKey, id, time] = key.split('|');
      return { key, dateKey, id, h: +time.slice(0, 2), m: +time.slice(3) };
    });
}

/* ============ SHARED SNIPPETS ============ */
function whenLabel(inst){
  const { t, ap } = time12(inst.h, inst.m);
  const dk = inst.dateKey, d = fromKey(dk);
  const days = Math.round((d - fromKey(todayKey())) / 86400000);
  if(days === 0) return `TODAY · ${t} ${ap}`;
  if(days === 1) return `MAÑANA · ${t} ${ap}`;
  return `${DAY_ABBR[d.getDay()]} ${MON_ABBR[d.getMonth()]} ${d.getDate()} · ${t} ${ap}`;
}

/* ============ TABS ============ */
/* Five tabs (concept-06): home · classes (labelled "Schedule") · pricing ·
   shop · more. */
function tabTo(name){
  const screen = $('#screen-' + name);
  if(!screen) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.screen === name));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
  screen.scrollTop = 0;
  closeDetail();
  closeMoreFs();
  closeSheet06();
}
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => tabTo(tab.dataset.screen));
});
/* delegated so freshly rendered markup (the home empty state) works too */
app.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if(go) tabTo(go.dataset.go);
});

/* ============ HOME (concept-06) ============ */
/* The next reservation is, among the bookings that still hold a place —
   status 'booked' or 'waitlist' — and whose class has not ended yet, the one
   that starts soonest. Attended and past bookings are excluded. */
function homeNext(){
  const now = new Date();
  return Object.entries(state.bookings)
    .filter(([, b]) => b.status === 'booked' || b.status === 'waitlist')
    .map(([key, b]) => ({ inst: instFromKey(key), b }))
    .filter(x => x.inst && endOf(x.inst) > now)
    .sort((a, z) => startOf(a.inst) - startOf(z.inst))[0] || null;
}

function renderHome(){
  const wrap = $('#home-next');
  const next = homeNext();

  if(!next){
    wrap.innerHTML = `<div class="card">
      <div class="empty">
        <h3>Nothing booked yet.</h3>
        <p>Let's fix that. Pick a class, claim a spot, show up.</p>
        <button class="btn" data-go="classes">Book a class</button>
      </div>
    </div>`;
  } else {
    const { inst, b } = next;
    const c = CLASSES[inst.id];
    const col = COACH_COLORS[inst.coach];
    const wait = b.status === 'waitlist';
    const now = new Date();
    const canCheckIn = !wait && now >= new Date(startOf(inst).getTime() - 60 * 60000) && now <= endOf(inst);
    wrap.innerHTML = `<div class="card hi rescard">
      <div class="stripe"${wait ? ' style="background:var(--royal)"' : ''}></div>
      <div class="row">
        <div class="av" style="background:${col.bg};color:${col.fg};width:44px;height:44px;font-size:16px">${esc(inst.coach[0])}</div>
        <div style="flex:1;min-width:0">
          <div class="when">${wait ? `Waitlist · no. ${b.pos}` : whenLabel(inst)}</div>
          <h3>${c.lines.join(' ')}</h3>
          <div class="meta">${esc(inst.coach)} · ${inst.dur} min</div>
        </div>
      </div>
      <div class="acts">
        <button id="home-details">Details</button>
        ${wait
          ? '<button class="p" disabled>In line</button>'
          : `<button class="p" id="home-checkin"${canCheckIn ? '' : ' disabled title="Check-in opens 1 hour before class"'}>Check in</button>`}
      </div>
    </div>`;
    $('#home-details').addEventListener('click', () => openDetail(inst));
    const ci = $('#home-checkin');
    if(ci && canCheckIn) ci.addEventListener('click', () => {
      checkIn(inst.key);
      renderAll();
      toast("Checked in. Bodied, mami.");
    });
  }

  renderHomeStamps();
}

/* Stamps come from real attendance, not the mockup's fixed twelve. The whole
   book lives in More → Stamps & milestones; home shows everything earned plus
   the next two still locked. */
function stampBook(){
  const attended = attendedList();
  const n = attended.length;
  const sixam = attended.some(a => a.h === 6);
  const pilates = attended.filter(a => a.id === 'pilates-sculpt').length;

  const got = [], locked = [];
  (n >= 1 ? got : locked).push('First class');
  (sixam ? got : locked).push('6AM club');
  MILESTONES.filter(m => m > 1).forEach(m => (n >= m ? got : locked).push(`${m} bodied`));
  (pilates >= 5 ? got : locked).push('Pilates era');
  (state.friendSticker ? got : locked).push('Brought a friend');
  return { n, got, locked };
}

function renderHomeStamps(){
  const { n, got, locked } = stampBook();

  const tile = (label, cls) => `<div class="stamp${cls}">${esc(label).replace(' ', '<br>')}</div>`;
  $('#home-stamps').innerHTML =
    got.map(g => tile(g, ' got')).join('') + locked.slice(0, 2).map(l => tile(l, '')).join('');

  $('#stamp-count').textContent = n;
  const since = state.profile ? fromKey(state.profile.since) : null;
  $('#stamp-caption').textContent = since
    ? `classes bodied since ${MON_FULL[since.getMonth()]}`
    : 'classes bodied';
}

/* paging dots for the two-promo carousel — 310px card + 12px gap */
$('#carousel').addEventListener('scroll', () => {
  const el = $('#carousel');
  const i = Math.round(el.scrollLeft / 322);
  document.querySelectorAll('#dots i').forEach((d, n) => d.classList.toggle('on', n === Math.min(1, i)));
});

/* ============ CONCEPT-06 CONTENT BRIDGES ============ */
/* Bright fills take dark text; everything else takes cream. */
const BRIGHT_HERO = ['#E3F223', '#16D5CC'];
/* data.js scores effort 1-4; concept-06 prints a word. */
const EFFORT_WORD = { 1: 'Low', 2: 'Low', 3: 'Moderate', 4: 'High' };

const className = id => CLASSES[id].lines.join(' ');

/* "6:00am" — concept-06 prints the meridiem lowercase and attached. */
function fmt06(h, m){
  const ap = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad(m)}${ap}`;
}
/* "Today · 6:00am" — sentence case, unlike whenLabel()'s tracked caps. */
function when06(inst){
  const d = fromKey(inst.dateKey);
  const days = Math.round((d - fromKey(todayKey())) / 86400000);
  const day = days === 0 ? 'Today'
    : days === 1 ? 'Tomorrow'
    : `${DAY_FULL[d.getDay()].slice(0, 3)} ${MON_SHORT[d.getMonth()]} ${d.getDate()}`;
  return `${day} · ${fmt06(inst.h, inst.m)}`;
}

function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ============ SCHEDULE (concept-06) ============ */
/* The strip is a rolling window — today plus the next six days — so the
   booking horizon is the same seven days whatever the weekday, and no listed
   day is ever in the past. `selDay` is an offset from today, 0..6, held
   against the date it was picked on. In-memory only — nothing persists.
   (Concept-06 draws a fixed Sun–Sat week; the rolling window is a recorded
   deviation — see DESIGN.md.) */
let seg = 'classes';
let filters = { coach: null, cls: null, time: null };
let selDay = 0;
let selAnchor = null;

function dayAt(i){
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + i);
  return d;
}

/* Keeps the selection honest across midnight: the window rolls forward, so
   the member keeps the day they picked for as long as it is still in it. */
function normalizeDay(){
  const tk = todayKey();
  if(selAnchor === tk) return;
  if(selAnchor){
    const elapsed = Math.round((fromKey(tk) - fromKey(selAnchor)) / 86400000);
    selDay = Math.min(6, Math.max(0, selDay - elapsed));
  }
  selAnchor = tk;
}

/* The row state machine. `ended` outranks everything — a finished class reads
   as past whatever you were holding. A class already running is not bookable,
   but it stays open to whoever already holds a place in it. */
function rowState(inst){
  const now = new Date();
  const b = bookingOf(inst.key);
  if(endOf(inst) < now) return 'ended';
  if(b) return b.status;                     /* booked | waitlist | attended */
  if(startOf(inst) <= now) return 'live';    /* in progress */
  return seededLeft(inst.key) === 0 ? 'full' : 'open';
}
/* The detail foot has its own precedence: a class you attended still
   says so after it ends, and an ended reservation loses its cancel button. */
function footState(inst){
  const b = bookingOf(inst.key);
  if(b && b.status === 'attended') return 'attended';
  return rowState(inst);
}

function passesFilter(inst){
  if(filters.coach && inst.coach !== filters.coach) return false;
  if(filters.cls && inst.id !== filters.cls) return false;
  if(filters.time === 'am' && inst.h >= 12) return false;
  if(filters.time === 'pm' && inst.h < 12) return false;
  return true;
}
const activeFilters = () => Object.values(filters).filter(Boolean).length;
function syncFilterDot(){ $('#filter-btn').classList.toggle('has-dot', activeFilters() > 0); }

/* Labels follow the rolling dates, so the rest-day dot travels with Sunday
   wherever it lands in the window. No `.past` day: the window starts today. */
function renderDayStrip(){
  $('#daystrip').innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = dayAt(i);
    const rest = WEEK_TEMPLATE[d.getDay()] === 'rest';
    return `<button class="day${i === selDay ? ' on' : ''}" data-day="${i}" role="tab" aria-selected="${i === selDay}">
      <span class="dow">${DAY_FULL[d.getDay()].slice(0, 3)}</span>
      <span class="num">${d.getDate()}</span>
      ${rest ? '<span class="rest-dot" aria-hidden="true"></span>' : ''}
    </button>`;
  }).join('');
}

function rowHTML(inst){
  const col = COACH_COLORS[inst.coach];
  const st = rowState(inst);
  const left = seededLeft(inst.key);

  let pill = '';
  if(st === 'booked' || st === 'attended') pill = '<button class="pill done">Reserved</button>';
  else if(st === 'waitlist') pill = '<button class="pill queued">Waitlisted</button>';
  else if(st === 'full') pill = '<button class="pill wait">Waitlist</button>';
  else if(st === 'open') pill = '<button class="pill">Reserve</button>';

  let mark = '';
  if(st === 'ended') mark = '<div class="spots full">Ended</div>';
  else if(st === 'live') mark = '<div class="spots full">In progress</div>';
  else if(left === 0) mark = '<div class="spots full">Class full</div>';
  else if(left <= 4) mark = `<div class="spots">${left} spot${left === 1 ? '' : 's'} left</div>`;

  const held = st === 'booked' || st === 'attended';
  return `<div class="crow${held ? ' booked' : ''}${st === 'ended' ? ' past' : ''}" data-key="${inst.key}" role="button" tabindex="0">
    <div class="left">
      <div class="time">${fmt06(inst.h, inst.m)}</div>
      <div class="av" style="background:${col.bg};color:${col.fg}">${esc(inst.coach[0])}</div>
    </div>
    <div class="mid">
      <div class="cname">${esc(className(inst.id))}</div>
      <div class="sub">${esc(inst.coach)}</div>
      <div class="sub">${inst.dur} min</div>
      ${mark}
    </div>
    ${pill}
  </div>`;
}

const RESTDAY_HTML = `<div class="restday">
  <div class="glyph"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg></div>
  <h3>Sunday is rest day</h3>
  <p>Nothing on the schedule. Stretch, eat, sleep in. We'll see you Monday, mami.</p>
</div>`;

const EVENTS_HTML = `<div class="restday">
  <div class="glyph"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1"/><circle cx="12" cy="15" r="5"/></svg></div>
  <h3>No events on the books</h3>
  <p>Pop-ups, challenges and member socials land here. Follow along for the next one.</p>
</div>`;

function renderSchedule(){
  const wrap = $('#sched-list');
  if(seg === 'events'){ wrap.innerHTML = EVENTS_HTML; return; }

  const tk = todayKey();
  let html = '', shown = 0;
  for(let i = selDay; i < 7; i++){
    const d = dayAt(i);
    const isToday = dateKeyOf(d) === tk;
    const label = `${isToday ? 'TODAY, ' : ''}${DAY_FULL[d.getDay()].toUpperCase()}, ${MON_ABBR[d.getMonth()]} ${d.getDate()}`;
    html += `<div class="datehead${isToday ? '' : ' plain'}">${label}</div>`;

    const list = instancesFor(d);
    if(list === 'rest'){ html += RESTDAY_HTML; continue; }
    const rows = list.filter(passesFilter);
    if(!rows.length){
      html += `<div class="restday" style="padding:24px"><p>Nothing matches your filters this day.</p></div>`;
      continue;
    }
    shown += rows.length;
    html += rows.map(rowHTML).join('');
  }
  if(!shown && activeFilters()){
    html += `<div class="pad" style="padding-top:18px"><button class="btn ghost" id="clear-filters">Clear filters</button></div>`;
  }
  wrap.innerHTML = html;
}

/* One delegated listener each, on containers that never get replaced —
   re-rendering the list can never stack duplicates. */
$('#sched-list').addEventListener('click', e => {
  if(e.target.closest('#clear-filters')){
    filters = { coach: null, cls: null, time: null };
    syncFilterDot();
    renderSchedule();
    return;
  }
  const row = e.target.closest('.crow');
  if(row) openDetail(instFromKey(row.dataset.key));
});
$('#sched-list').addEventListener('keydown', e => {
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest('.crow');
  if(row){ e.preventDefault(); row.click(); }
});
$('#daystrip').addEventListener('click', e => {
  const b = e.target.closest('.day');
  if(!b) return;
  selDay = +b.dataset.day;
  renderDayStrip();
  renderSchedule();
  $('#screen-classes').scrollTop = 0;
});
document.querySelectorAll('#seg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#seg button').forEach(x => {
    x.classList.toggle('on', x === b);
    x.setAttribute('aria-selected', String(x === b));
  });
  seg = b.dataset.seg;
  renderSchedule();
}));

/* ============ BOTTOM SHEET ============ */
/* One surface for every sheet in the app: filters, booking confirmation,
   plan details, name & plan. None of them push a history entry. */
const c6sheet = $('#confirm-sheet'), c6scrim = $('#scrim');

function openSheet06(html){
  $('#confirm-body').innerHTML = html;
  c6sheet.classList.add('on');
  c6sheet.setAttribute('aria-hidden', 'false');
  c6sheet.scrollTop = 0;
  c6scrim.classList.add('on');
}
function closeSheet06(){
  c6sheet.classList.remove('on');
  c6sheet.setAttribute('aria-hidden', 'true');
  c6scrim.classList.remove('on');
}
/* Dismissing the confirm sheet returns you to the detail, still open. */
c6scrim.addEventListener('click', closeSheet06);

const FKEY = 'padding:0 0 8px;font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--pink)';

function openFilterSheet(){
  openSheet06(`
    <h2>Filter the schedule</h2>
    <p class="meta" style="margin-bottom:18px">Narrow it down to what you actually want.</p>
    <h3 style="${FKEY}">Coach</h3>
    <div class="chips" style="margin-bottom:20px">
      ${COACHES.map(c => `<button class="chip${filters.coach === c.name ? ' on' : ''}" data-f="coach:${esc(c.name)}">${esc(c.name)}</button>`).join('')}
    </div>
    <h3 style="${FKEY}">Class</h3>
    <div class="chips" style="margin-bottom:20px">
      ${Object.keys(CLASSES).map(k => `<button class="chip${filters.cls === k ? ' on' : ''}" data-f="cls:${k}">${esc(className(k))}</button>`).join('')}
    </div>
    <h3 style="${FKEY}">Time of day</h3>
    <div class="chips" style="margin-bottom:22px">
      <button class="chip${filters.time === 'am' ? ' on' : ''}" data-f="time:am">Morning</button>
      <button class="chip${filters.time === 'pm' ? ' on' : ''}" data-f="time:pm">Afternoon &amp; evening</button>
    </div>
    <button class="btn" id="filter-apply">Show classes</button>
    <button class="btn ghost" style="margin-top:10px" id="filter-clear">Clear all</button>`);

  $('#confirm-body').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
    const i = b.dataset.f.indexOf(':');
    const k = b.dataset.f.slice(0, i), v = b.dataset.f.slice(i + 1);
    filters[k] = filters[k] === v ? null : v;
    openFilterSheet();
  }));
  $('#filter-apply').addEventListener('click', () => {
    syncFilterDot();
    renderSchedule();
    closeSheet06();
  });
  $('#filter-clear').addEventListener('click', () => {
    filters = { coach: null, cls: null, time: null };
    syncFilterDot();
    renderSchedule();
    openFilterSheet();
  });
}
$('#filter-btn').addEventListener('click', openFilterSheet);

/* ============ CLASS DETAIL (concept-06 full screen) ============ */
const detail = $('#detail');
let detailInst = null;
/* Opening the detail pushes exactly one history entry. Back at any stage of
   the flow — detail, confirm, confirmed — pops it and dismisses everything. */
let detailPushed = false;

const FOOT = {
  attended: { cls: 'btn', label: 'Checked in', off: true, note: "This one's in your stamp book." },
  ended:    { cls: 'btn', label: 'Class ended', off: true, note: 'Catch the next one — same energy.' },
  live:     { cls: 'btn', label: 'Class in progress', off: true, note: 'This one is already running. Catch the next one.' },
  booked:   { cls: 'btn ghost', label: 'Cancel this reservation' },
  waitlist: { cls: 'btn ghost', label: 'Leave the waitlist' },
  full:     { cls: 'btn ink', label: 'Join the waitlist' },
  open:     { cls: 'btn', label: 'Reserve my spot' },
};

function detailBodyHTML(inst){
  const c = CLASSES[inst.id];
  const col = COACH_COLORS[inst.coach];
  const coach = COACHES.find(x => x.name === inst.coach);
  const hero = c.hero;
  const left = seededLeft(inst.key);
  const full = left === 0;
  return `
    <div class="hero" style="background:${hero};color:${BRIGHT_HERO.includes(hero) ? 'var(--on-bright)' : 'var(--cream)'}">
      <div class="blob" style="width:170px;height:170px;right:-58px;top:-72px;background:#FBF9EE"></div>
      <div class="blob" style="width:120px;height:120px;left:-62px;bottom:-64px;background:#FD47AC;opacity:.3"></div>
      <div class="kick">${when06(inst)}</div>
      <h1>${esc(className(inst.id))}</h1>
    </div>

    <div class="factrow">
      <div class="fact"><div class="k">Length</div><div class="v">${inst.dur} min</div></div>
      <div class="fact"><div class="k">Effort</div><div class="v">${EFFORT_WORD[c.effort]}</div></div>
      <div class="fact"><div class="k">Spots</div><div class="v${full ? '' : ' pink'}">${full ? 'Full' : left + ' left'}</div></div>
    </div>

    <div class="blk">
      <h3>What it is</h3>
      <p>${esc(c.vibe)}</p>
    </div>

    <div class="blk">
      <h3>Your coach</h3>
      <div class="coachline">
        <div class="av" style="background:${col.bg};color:${col.fg}">${esc(inst.coach[0])}</div>
        <div>
          <h4>${esc(coach.name)}</h4>
          <div class="meta-sm">${esc(coach.role)}</div>
        </div>
      </div>
    </div>

    <div class="blk">
      <h3>Bring</h3>
      <div class="chips">${c.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    </div>

    <div class="blk">
      <h3>Where</h3>
      <p>${esc(STUDIO.addr)}<br><span class="meta-sm">Free lot behind the building. Doors open 15 min early.</span></p>
    </div>

    <div class="blk">
      <h3>Cancellation</h3>
      <p class="meta-sm">Cancel free up to 12 hours before class. ${esc(PRICING_POLICY)}</p>
    </div>`;
}

function renderDetail(){
  const inst = detailInst;
  if(!inst) return;
  $('#detail-body').innerHTML = detailBodyHTML(inst);

  const st = footState(inst);
  const f = FOOT[st];
  const foot = $('#detail-foot');
  foot.hidden = false;
  foot.innerHTML = `<button class="${f.cls}" id="detail-cta"${f.off ? ' disabled' : ''}>${f.label}</button>`
    + (f.note ? `<p class="policy" style="text-align:center;padding-top:10px">${f.note}</p>` : '');

  const cta = $('#detail-cta');
  if(st === 'booked'){
    cta.addEventListener('click', () => {
      cancelBooking(inst.key);
      closeDetail();
      renderAll();
      toast('Reservation cancelled. Spot released.');
    });
  } else if(st === 'waitlist'){
    cta.addEventListener('click', () => {
      cancelBooking(inst.key);
      closeDetail();
      renderAll();
      toast("You're off the waitlist.");
    });
  } else if(st === 'full'){
    cta.addEventListener('click', () => openConfirm(inst, true));
  } else if(st === 'open'){
    cta.addEventListener('click', () => openConfirm(inst, false));
  }
}

function openDetail(inst){
  if(!inst) return;
  detailInst = inst;
  renderDetail();
  if(!detailPushed){
    detailPushed = true;
    history.pushState({ bodiedDetail: inst.id }, '', '#detail=' + inst.id);
  }
  detail.classList.add('on');
  detail.setAttribute('aria-hidden', 'false');
  $('#detail-body').scrollTop = 0;
}

function hideDetail(){
  detail.classList.remove('on');
  detail.setAttribute('aria-hidden', 'true');
  $('#detail-foot').hidden = true;
  detailInst = null;
}
/* DOM only, idempotent: confirmed → confirm sheet → detail. */
function dismissBooking(){
  const done = $('#done');
  done.classList.remove('on');
  done.setAttribute('aria-hidden', 'true');
  closeSheet06();
  hideDetail();
}
function closeDetail(){
  const pushed = detailPushed;
  detailPushed = false;
  dismissBooking();
  if(pushed) history.back();
}
window.addEventListener('popstate', () => { detailPushed = false; dismissBooking(); });
$('#detail-back').addEventListener('click', closeDetail);

/* ============ CONFIRM + CONFIRMED ============ */
function openConfirm(inst, waitlist){
  const plan = state.profile ? planById(state.profile.plan) : null;
  openSheet06(`
    <h2>${waitlist ? 'Join the waitlist' : 'Confirm your spot'}</h2>
    <p class="meta" style="margin-bottom:16px">${waitlist
      ? 'If a spot opens, the front desk bumps you in. No charge either way.'
      : 'One tap and the spot is yours, mami.'}</p>

    <div class="confrow"><span class="k">Class</span><span class="v">${esc(className(inst.id))}</span></div>
    <div class="confrow"><span class="k">When</span><span class="v">${when06(inst)}</span></div>
    <div class="confrow"><span class="k">Coach</span><span class="v">${esc(inst.coach)}</span></div>
    <div class="confrow"><span class="k">Where</span><span class="v">${esc(STUDIO.name)}<br><span style="font-weight:400;color:var(--text-50);font-size:12px">${esc(STUDIO.addr)}</span></span></div>
    <div class="confrow"><span class="k">Length</span><span class="v">${inst.dur} min</span></div>

    <div class="paysel">
      <span class="rad" aria-hidden="true"><i></i></span>
      <span>
        <div style="font-weight:700;font-size:14px">${esc(plan ? plan.name : 'Your plan')}</div>
        <div class="meta-sm">${waitlist ? 'Nothing deducted for a waitlist spot' : 'This class is included — no charge'}</div>
      </span>
    </div>

    <button class="btn${waitlist ? ' ink' : ''}" id="confirm-cta">${waitlist ? 'Put me on the list' : 'Confirm reservation'}</button>
    <p class="policy" style="text-align:center;padding-top:12px">Cancel free up to 12 hours before class.</p>`);

  $('#confirm-cta').addEventListener('click', () => {
    if(waitlist) joinWaitlist(inst.key);
    else book(inst.key);
    closeSheet06();
    /* the detail goes away visually, but its history entry stays on the
       stack so Back works from the confirmed screen too */
    hideDetail();
    renderAll();
    showDone(inst, waitlist);
  });
}

const STAMP_CHECK = '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const STAMP_CLOCK = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';

function showDone(inst, waitlist){
  const b = bookingOf(inst.key);
  const done = $('#done');
  done.innerHTML = `
    <div class="bigstamp${waitlist ? ' ink' : ''}">${waitlist ? STAMP_CLOCK : STAMP_CHECK}</div>
    <h1>${waitlist ? "You're on the list." : "You're in, mami."}</h1>
    <p class="sub">${waitlist
      ? `Number ${b.pos} in line for ${esc(className(inst.id))}. If a spot opens, the front desk bumps you in.`
      : `Spot ${b.spot} of ${CAPACITY} is yours. Doors open 15 minutes early.`}</p>

    <div class="ticket">
      <div class="rescard">
        <div class="when">${when06(inst)}</div>
        <h3>${esc(className(inst.id))}</h3>
        <div class="meta">${esc(inst.coach)} · ${inst.dur} min</div>
      </div>
    </div>

    <div class="done-acts">
      ${waitlist ? '' : '<button class="btn ghost" id="done-cal">Add to calendar</button>'}
      <button class="btn" id="done-ok">Done</button>
    </div>`;
  done.classList.add('on');
  done.setAttribute('aria-hidden', 'false');
  /* tabTo closes the detail, which pops the history entry we still hold */
  $('#done-ok').addEventListener('click', () => tabTo('classes'));
  const cal = $('#done-cal');
  if(cal) cal.addEventListener('click', () => {
    downloadICS(inst);
    toast('Calendar reminder saved (.ics).');
  });
}

/* ============ ADD TO CALENDAR (.ics) ============ */
function downloadICS(inst){
  const c = CLASSES[inst.id];
  const s = startOf(inst), e = endOf(inst);
  const f = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BODIED SJ//App//EN',
    'BEGIN:VEVENT',
    `UID:${inst.key.replace(/[^A-Za-z0-9]/g, '')}@bodiedsj`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(s)}`,
    `DTEND:${f(e)}`,
    `SUMMARY:${c.lines.join(' ')} · BODIED SJ`,
    `LOCATION:${STUDIO.addr}`,
    `DESCRIPTION:With Coach ${inst.coach}. ${c.vibe}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Class in 2 hours', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bodied-${inst.id}-${inst.dateKey}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/* ============ MEMBERSHIP HELPERS ============ */
function planById(id){ return PLANS.find(p => p.id === id) || PLANS[0]; }

function trialDay(){
  if(!state.profile) return 1;
  const since = fromKey(state.profile.since);
  return Math.floor((fromKey(todayKey()) - since) / 86400000) + 1;
}

/* What the profile card calls the member's plan. The trial is the one plan
   that reads as a countdown rather than a name. */
function planLabel(){
  if(!state.profile) return '';
  const plan = planById(state.profile.plan);
  if(plan.id !== 'trial') return plan.short;
  const d = trialDay();
  return d > 7 ? 'Trial · ended' : `Trial · day ${d} of 7`;
}

/* ============ PRICING (concept-06) ============ */
/* Nine plans, four groups. PLANS is one flat array — the tabs filter it. */
let ptab = PLAN_GROUPS[0].key;

const PLAN_ICON = '<svg class="picon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 4.5-9 4.5-9-4.5Z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/></svg>';
const CHECK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function renderPricing(){
  $('#ptabs').innerHTML = PLAN_GROUPS.map(g =>
    `<button class="${g.key === ptab ? 'on' : ''}" data-ptab="${g.key}" role="tab" aria-selected="${g.key === ptab}">${esc(g.label)}</button>`
  ).join('');

  $('#plan-list').innerHTML = PLANS.filter(p => p.group === ptab).map(p => `
    <button class="plan${p.badge ? ' feature' : ''}" data-plan="${p.id}">
      ${p.badge ? `<span class="tag">${esc(p.badge)}</span>` : ''}
      ${PLAN_ICON}
      <h3>${esc(p.name)}</h3>
      <div class="priceline">
        <span class="circ" aria-hidden="true">$</span>
        <b>${esc(p.price)}</b>
        <span>${esc(p.per)}</span>
      </div>
      <span class="details">Details</span>
    </button>`).join('');

  $('#policy').textContent = PRICING_POLICY;

  /* No payments in-app, ever: joining links out to the studio. */
  $('#pricing-join').innerHTML = `
    <a class="btn" href="${STUDIO.site}" target="_blank" rel="noopener">Join at bodiedsj.com</a>
    <a class="btn ghost" style="margin-top:10px" href="${STUDIO.tel}">Call the studio</a>
    <p class="policy" style="text-align:center">Plans are set up at the front desk or on bodiedsj.com — nothing is ever charged through this app.</p>`;
}

$('#ptabs').addEventListener('click', e => {
  const b = e.target.closest('[data-ptab]');
  if(!b) return;
  ptab = b.dataset.ptab;
  renderPricing();
  $('#screen-pricing').scrollTop = 0;
});
$('#plan-list').addEventListener('click', e => {
  const el = e.target.closest('[data-plan]');
  if(el) openPlanSheet(planById(el.dataset.plan));
});

function openPlanSheet(p){
  openSheet06(`
    <h2>${esc(p.name)}</h2>
    <div class="priceline" style="margin-top:12px">
      <span class="circ" aria-hidden="true">$</span><b>${esc(p.price)}</b><span>${esc(p.per)}</span>
    </div>
    <div class="incl">
      ${p.incl.map(x => `<div>${CHECK_ICON}<span>${esc(x)}</span></div>`).join('')}
    </div>
    <a class="btn" href="${STUDIO.site}" target="_blank" rel="noopener">Get this plan</a>
    <p class="policy" style="padding-top:14px">${esc(PRICING_POLICY)}</p>`);
}

/* ============ MORE (concept-06) ============ */
/* Carries the profile card, the coaches and the stamp book. */

/* Every place still held — booked or waitlisted, class not over yet. */
function myBookings(){
  const now = new Date();
  return Object.entries(state.bookings)
    .filter(([, b]) => b.status === 'booked' || b.status === 'waitlist')
    .map(([key, b]) => ({ inst: instFromKey(key), b }))
    .filter(x => x.inst && endOf(x.inst) > now)
    .sort((a, z) => startOf(a.inst) - startOf(z.inst));
}

function renderMore(){
  const p = state.profile;
  const first = (p ? p.name : 'mami').split(/\s+/)[0];
  $('#pc-av').textContent = (first[0] || 'B').toUpperCase();
  $('#pc-name').textContent = `Hey, ${first}`;
  if(p){
    const since = fromKey(p.since);
    $('#pc-plan').textContent = `${planLabel()} · since ${MON_SHORT[since.getMonth()]} ${since.getFullYear()}`;
  } else {
    $('#pc-plan').textContent = '';
  }

  $('#res-count').textContent = myBookings().length;
  $('#stamp-total').textContent = stampBook().got.length;

  $('#more-info').innerHTML = `
    <a class="infoblock" href="${STUDIO.maps}" target="_blank" rel="noopener">
      <div class="k">Address</div><div class="v">${esc(STUDIO.addr)}</div></a>
    <a class="infoblock" href="${STUDIO.tel}">
      <div class="k">Call</div><div class="v">${esc(STUDIO.phone)}</div></a>
    <a class="infoblock" href="${STUDIO.sms}">
      <div class="k">Text</div><div class="v">${esc(STUDIO.text)}</div></a>
    <a class="infoblock" href="mailto:${STUDIO.email}">
      <div class="k">Email</div><div class="v">${esc(STUDIO.email)}</div></a>`;

  $('#more-foot').innerHTML =
    `${esc(STUDIO.name)} · ${esc(STUDIO.addr)}<br>Booking lives on this phone. Payments &amp; sign-up happen at bodiedsj.com or in studio.`;
}

/* ---- More's sub-screens: reservations · stamps · coaches ---- */
const moreFs = $('#more-fs');
let moreFsName = null;

const HEART = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path class="heart" d="M12 20.5C6.5 16.2 3.5 13.1 3.5 9.6 3.5 7 5.6 4.9 8.2 4.9c1.6 0 3 .8 3.8 2 .8-1.2 2.2-2 3.8-2 2.6 0 4.7 2.1 4.7 4.7 0 3.5-3 6.6-8.5 10.9Z" stroke-width="1.8" stroke-linejoin="round"/></svg>';

const MORE_FS = {
  reservations(){
    const mine = myBookings();
    if(!mine.length){
      return { title: 'My reservations', html: `<div class="restday" style="padding-top:60px">
        <div class="glyph"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg></div>
        <h3>Nothing booked</h3>
        <p>Your reserved classes show up here. Claim one and it's yours.</p>
      </div>` };
    }
    return { title: 'My reservations', html: `<div class="pad">${mine.map(({ inst, b }) => {
      const c = CLASSES[inst.id];
      const col = COACH_COLORS[inst.coach];
      const wait = b.status === 'waitlist';
      return `<div class="card hi rescard" style="margin-bottom:12px">
        <div class="stripe"${wait ? ' style="background:var(--royal)"' : ''}></div>
        <div class="row">
          <div class="av" style="background:${col.bg};color:${col.fg};width:44px;height:44px;font-size:16px">${esc(inst.coach[0])}</div>
          <div style="flex:1;min-width:0">
            <div class="when">${wait ? `Waitlist · no. ${b.pos}` : whenLabel(inst)}</div>
            <h3>${esc(className(inst.id))}</h3>
            <div class="meta">${esc(inst.coach)} · ${inst.dur} min</div>
          </div>
        </div>
        <div class="acts"><button data-open="${inst.key}">Details</button></div>
      </div>`;
    }).join('')}</div>` };
  },

  stamps(){
    const { n, got, locked } = stampBook();
    const since = state.profile ? fromKey(state.profile.since) : null;
    const nextM = MILESTONES.find(m => m > n && m > 1);
    const line = n === 0
      ? 'Your first stamp is one booking away, mami.'
      : nextM
        ? `${nextM - n} more and you hit the ${nextM} club. Consistency is the whole thing, mami.`
        : "Every stamp in the book. Valeria says you're not allowed to stop now.";
    const tile = label => `<div class="stamp got">${esc(label).replace(' ', '<br>')}</div>`;
    const lockedTile = label => label === 'Brought a friend'
      ? `<button class="stamp" id="claim-friend" title="Tap to claim when you bring a friend">Brought<br>a friend</button>`
      : `<div class="stamp">${esc(label).replace(' ', '<br>')}</div>`;
    return { title: 'Stamps & milestones', html: `
      <div class="pad">
        <div class="card" style="margin-bottom:16px">
          <div class="progline"><b>${n}</b><span>${since ? `classes bodied since ${MON_FULL[since.getMonth()]}` : 'classes bodied'}</span></div>
          <p class="meta">${line}</p>
        </div>
        ${got.length ? `<div class="sechead"><h2 class="title-lg">Earned</h2></div>
        <div class="stamps" style="margin-bottom:22px">${got.map(tile).join('')}</div>` : ''}
        ${locked.length ? `<div class="sechead"><h2 class="title-lg">Still locked</h2></div>
        <div class="stamps">${locked.map(lockedTile).join('')}</div>` : ''}
      </div>` };
  },

  coaches(){
    return { title: 'Meet the coaches', html: `<div class="pad">${COACHES.map(c => {
      const col = COACH_COLORS[c.name];
      const on = !!state.faves[c.name];
      return `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;gap:13px;align-items:center;margin-bottom:12px">
          <div class="av" style="background:${col.bg};color:${col.fg};width:46px;height:46px;font-size:17px">${esc(c.name[0])}</div>
          <div style="flex:1;min-width:0">
            <h3 style="font-family:var(--head);font-size:18px;font-weight:800;letter-spacing:-0.022em">${esc(c.name)}</h3>
            <div class="meta-sm">${esc(c.role)}</div>
          </div>
          <button class="fave${on ? ' on' : ''}" data-fave="${esc(c.name)}" aria-label="Favourite ${esc(c.name)}" aria-pressed="${on}">${HEART}</button>
        </div>
        <p class="meta" style="margin-bottom:12px">${esc(c.bio)}</p>
        <div class="chips">${c.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      </div>`;
    }).join('')}</div>` };
  },
};

function openMoreFs(name, keepScroll){
  const body = $('#more-fs-body');
  const top = body.scrollTop;
  const { title, html } = MORE_FS[name]();
  moreFsName = name;
  $('#more-fs-title').textContent = title;
  body.innerHTML = html;
  moreFs.classList.add('on');
  moreFs.setAttribute('aria-hidden', 'false');
  body.scrollTop = keepScroll ? top : 0;
}
function closeMoreFs(){
  moreFs.classList.remove('on');
  moreFs.setAttribute('aria-hidden', 'true');
  moreFsName = null;
}
$('#more-fs-back').addEventListener('click', closeMoreFs);

/* One delegated listener on a container that never gets replaced. */
$('#more-fs-body').addEventListener('click', e => {
  const open = e.target.closest('[data-open]');
  if(open){ openDetail(instFromKey(open.dataset.open)); return; }
  const fav = e.target.closest('[data-fave]');
  if(fav){
    const name = fav.dataset.fave;
    state.faves[name] = !state.faves[name];
    save();
    fav.classList.toggle('on', !!state.faves[name]);
    fav.setAttribute('aria-pressed', String(!!state.faves[name]));
    return;
  }
  if(e.target.closest('#claim-friend')){
    state.friendSticker = true;
    save();
    renderAll();   /* re-renders this sub-screen too */
    toast('Stamp claimed. Bring her again, mami.');
  }
});

$('#screen-more').addEventListener('click', e => {
  const row = e.target.closest('[data-fs]');
  if(row) openMoreFs(row.dataset.fs);
});
/* Home's "Show all" is the full stamp book, which lives in More. */
$('#home-showall').addEventListener('click', () => {
  tabTo('more');
  openMoreFs('stamps');
});

/* ---- name & plan ---- */
$('#profile-edit').addEventListener('click', openProfileSheet);

function openProfileSheet(){
  const p = state.profile || { name: '', plan: 'trial' };
  openSheet06(`
    <h2>Name &amp; plan</h2>
    <p class="meta" style="margin-bottom:18px">What the app calls you, and the plan it shows on your card.</p>
    <div class="ob-field" style="margin-top:0">
      <label class="eyebrow" for="pf-name">Your name</label>
      <input class="ob-input" id="pf-name" type="text" maxlength="30" value="${esc(p.name)}">
    </div>
    <div class="ob-field">
      <label class="eyebrow" id="pf-chips-label">Your plan</label>
      <div class="chips" id="pf-chips" role="radiogroup" aria-labelledby="pf-chips-label">${planChipsHTML(p.plan)}</div>
    </div>
    <button class="btn" style="margin-top:24px" id="pf-save">Save</button>`);

  wirePlanChips($('#pf-chips'));
  $('#pf-save').addEventListener('click', () => {
    const name = $('#pf-name').value.trim();
    if(!state.profile) return closeSheet06();
    if(name) state.profile.name = name;
    state.profile.plan = $('#pf-chips .chip.on').dataset.plan;
    save();
    closeSheet06();
    renderAll();
  });
}

/* ============ SHOP (concept-06) ============ */
/* A permanent empty state — the studio sells nothing online. */
$('#shop-cta').addEventListener('click', () => toast("We'll shout the second it drops."));

/* ============ ESCAPE ============ */
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  /* topmost first: confirmed → bottom sheet → class detail → More sub-screen */
  if($('#done').classList.contains('on')) tabTo('classes');
  else if(c6sheet.classList.contains('on')) closeSheet06();
  else if(detail.classList.contains('on')) closeDetail();
  else if(moreFs.classList.contains('on')) closeMoreFs();
});

/* ============ ONBOARDING ============ */
/* Two steps, one profile write, and a first-run trigger that is simply the
   absence of the state doc. */
function planChipsHTML(sel){
  return PLANS.map(p => `<button class="chip${p.id === sel ? ' on' : ''}" data-plan="${p.id}" role="radio" aria-checked="${p.id === sel}">${esc(p.short)}</button>`).join('');
}
function wirePlanChips(container){
  container.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    container.querySelectorAll('.chip').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
    ch.classList.add('on');
    ch.setAttribute('aria-checked', 'true');
  }));
}

function initOnboarding(){
  const ob = $('#onboard');
  if(state.profile){ ob.hidden = true; return; }
  ob.hidden = false;
  $('#plan-chips').innerHTML = planChipsHTML('trial');
  wirePlanChips($('#plan-chips'));
  $('#ob-start').addEventListener('click', () => {
    const name = $('#ob-name').value.trim() || 'Mami';
    const plan = $('#plan-chips .chip.on').dataset.plan;
    state.profile = {
      name,
      plan,
      since: todayKey(),
      no: pad(fnv(name + todayKey()) % 10000).padStart(4, '0'),
    };
    save();
    renderAll();
    ob.classList.add('closing');
    setTimeout(() => { ob.hidden = true; }, 400);
    toast("Let's go, mami.");
  });
  $('#ob-name').addEventListener('keydown', e => { if(e.key === 'Enter') $('#ob-start').click(); });
}

/* ============ THEME ============ */
const SUN = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.7 4.7l1.7 1.7M17.6 17.6l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.7 19.3l1.7-1.7M17.6 6.4l1.7-1.7"/></svg>';
const MOON = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>';

function themeColorFor(t){ return t === 'dark' ? '#0B0B0D' : '#FBF9EE'; }
let theme = state.theme || 'light';
if(location.hash.includes('dark')) theme = 'dark';
function applyTheme(t, persist){
  theme = t;
  if(t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const ti = $('#stage-toggle-icon'), tl = $('#stage-toggle-label');
  if(ti) ti.innerHTML = t === 'dark' ? SUN : MOON;
  if(tl) tl.textContent = t === 'dark' ? 'daylight' : 'after dark';
  /* More → Appearance: the row shows the theme you are in, the icon the
     one you came from — same as the mockup. */
  $('#theme-icon').innerHTML = t === 'dark' ? MOON : SUN;
  $('#theme-value').textContent = t === 'dark' ? 'After dark' : 'Daylight';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', themeColorFor(t));
  if(persist){ state.theme = t; save(); }
}
const flipTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark', true);
$('#theme-toggle').addEventListener('click', flipTheme);
$('#theme-row').addEventListener('click', () => {
  flipTheme();
  toast(theme === 'dark' ? 'After dark. Club lighting, mami.' : 'Back to daylight.');
});

/* ============ STATUS BAR CLOCK (desktop stage) ============ */
function tickClock(){
  const now = new Date();
  const h = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
  $('#sb-time').textContent = `${h}:${pad(now.getMinutes())}`;
}

/* ============ RENDER ALL / MINUTE TICK ============ */
function renderAll(){
  renderHome();
  renderDayStrip();
  renderSchedule();
  syncFilterDot();
  renderPricing();
  renderMore();
  /* keeps an open detail honest about spots, ended and in-progress */
  if(detailInst) renderDetail();
  /* and an open More sub-screen honest about bookings and stamps */
  if(moreFsName) openMoreFs(moreFsName, true);
  tickClock();
}

function minuteTick(){
  normalizeDay();   /* day and week rollover */
  renderAll();
}
setInterval(minuteTick, 60000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) minuteTick(); });

/* ============ FIT PHONE TO VIEWPORT (desktop stage) ============ */
function fitPhone(){
  if(window.innerWidth <= 560){ $('#phone').style.transform = ''; return; }
  const scale = Math.min(1, (window.innerHeight - 120) / 844, (window.innerWidth - 80) / 390);
  $('#phone').style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitPhone);

/* ============ BOOT ============ */
applyTheme(theme, false);
normalizeDay();
renderAll();
initOnboarding();
fitPhone();

/* Hash deep links: #home #schedule #pricing #shop #more #detail=<classId>.
   Append &dark for the dark theme.
   The older hashes still resolve, but they are aliases: the URL is rewritten
   to the canonical hash with replaceState, so no history entry is added and
   Back still leaves the app the way it came in. */
const HASH_SCREEN = { home: 'home', schedule: 'classes', pricing: 'pricing', shop: 'shop', more: 'more' };
const HASH_ALIAS = { today: 'home', classes: 'schedule', coaches: 'more', you: 'more' };

(function(){
  const h = decodeURIComponent(location.hash.slice(1));
  if(!h) return;
  const parts = h.split('&');
  const main = parts[0];
  const scr = main.split('=')[0];

  if(HASH_ALIAS[scr]){
    parts[0] = HASH_ALIAS[scr];
    history.replaceState(history.state, '', '#' + parts.join('&'));
  }
  const canonical = HASH_ALIAS[scr] || scr;
  if(HASH_SCREEN[canonical]) tabTo(HASH_SCREEN[canonical]);

  if(main.startsWith('detail=')){
    const id = main.split('=')[1];
    if(CLASSES[id]){
      const now = new Date();
      for(let i = 0; i < 7; i++){
        const d = new Date(); d.setDate(d.getDate() + i);
        const day = instancesFor(d);
        if(day === 'rest') continue;
        const inst = day.find(x => x.id === id && startOf(x) >= now);
        if(inst){ openDetail(inst); break; }
      }
    }
  }
})();

/* ============ SERVICE WORKER ============ */
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
