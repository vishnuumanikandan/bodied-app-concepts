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
const starSVG = `<svg class="stamp-star" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 1l2.4 6.1L20 8.4l-5 4.2 1.6 6.4L11 15.4 5.4 19l1.6-6.4-5-4.2 6.6-1.3z" fill="var(--chartreuse)" stroke="var(--ink)" stroke-width="1.6"/></svg>`;
const burstSVG = `<svg class="pburst" viewBox="0 0 34 34" aria-hidden="true"><path d="M17 1l2 6 6-2-2 6 6 2-6 2 2 6-6-2-2 6-2-6-6 2 2-6-6-2 6-2-2-6 6 2z" fill="currentColor" opacity="0.85"/></svg>`;

function showStamp(text){
  $('#stamp-text').textContent = text;
  const so = $('#stamp-overlay');
  so.classList.remove('show');
  void so.offsetWidth;
  so.classList.add('show');
  setTimeout(() => so.classList.remove('show'), 1600);
}

/* Countdown phrasing for the "Up next" aside */
function countdownText(inst){
  const now = new Date(), start = startOf(inst), end = endOf(inst);
  if(now >= start && now <= end) return 'happening now';
  const mins = Math.round((start - now) / 60000);
  if(mins < 60) return `in ${Math.max(mins, 1)} min`;
  if(inst.dateKey === todayKey()){
    const hrs = Math.round(mins / 60);
    return `in ${hrs} hour${hrs === 1 ? '' : 's'}`;
  }
  const days = Math.round((fromKey(inst.dateKey) - fromKey(todayKey())) / 86400000);
  if(days <= 1) return 'mañana';
  return `in ${days} days`;
}

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
   shop · more. The legacy screens that outlive the port have no tab of their
   own, so they light up the tab they will eventually fold into. */
const TAB_FOR = { today: 'home', coaches: 'more', you: 'more' };

function tabTo(name){
  const screen = $('#screen-' + name);
  if(!screen) return;
  const lit = TAB_FOR[name] || name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.screen === lit));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
  screen.scrollTop = 0;
  closeDetail();
  closeSheet();
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
      showStamp('Bodied!');
      renderAll();
    });
  }

  renderHomeStamps();
}

/* Stamps on home come from real attendance, not the mockup's fixed twelve.
   Everything earned, then the next two still locked — "Show all" is the
   full book, and it lands in More when More is ported. */
function renderHomeStamps(){
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

/* ============ TODAY ============ */
function renderTodayHead(){
  const now = new Date();
  $('#today-date').textContent = `${DAY_FULL[now.getDay()]}, ${MON_FULL[now.getMonth()]} ${now.getDate()}`;
  const h = now.getHours();
  const salute = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  const name = state.profile ? state.profile.name : 'mami';
  const first = name.split(/\s+/)[0];
  $('#greeting').innerHTML = `${salute},<br><em>${esc(first)}</em>`;
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'B';
  $('#avatar').textContent = initials;
}

function nextBookings(){
  const now = new Date();
  return Object.entries(state.bookings)
    .map(([key, b]) => ({ inst: instFromKey(key), b }))
    .filter(x => x.inst && endOf(x.inst) >= now)
    .sort((a, z) => startOf(a.inst) - startOf(z.inst));
}

function renderUpNext(){
  const wrap = $('#upnext-wrap');
  const next = nextBookings()[0];
  if(!next){
    wrap.innerHTML = `
      <div class="section-label"><span class="eyebrow">Up next</span></div>
      <div class="ticket empty">
        <div class="ticket-main">
          <div class="display" style="font-size:28px">Nothing<br>booked</div>
          <div class="ticket-meta"><span class="aside" style="font-size:15px">your next class is waiting, mami</span></div>
        </div>
        <div class="ticket-perf" aria-hidden="true"></div>
        <div class="ticket-stub"><button class="btn sm" id="goto-classes">Book</button></div>
      </div>`;
    $('#goto-classes').addEventListener('click', () => tabTo('classes'));
    return;
  }
  const { inst, b } = next;
  const c = CLASSES[inst.id];
  const { t, ap } = time12(inst.h, inst.m);
  const now = new Date();
  const canCheckIn = b.status === 'booked' && now >= new Date(startOf(inst).getTime() - 60 * 60000) && now <= endOf(inst);

  let stub;
  if(b.status === 'attended'){
    stub = `<div><div class="eyebrow">Spot</div><div class="spot">${pad(b.spot || 1)}</div></div>
            <button class="btn sm stamped" disabled>In ★</button>`;
  } else if(b.status === 'waitlist'){
    stub = `<div><div class="eyebrow">Waitlist</div><div class="spot">#${b.pos}</div></div>
            <button class="btn sm ghost" disabled>In line</button>`;
  } else {
    stub = `<div><div class="eyebrow">Spot</div><div class="spot">${pad(b.spot)}</div></div>
            <button class="btn sm" id="checkin-btn" ${canCheckIn ? '' : 'disabled title="Check-in opens 1 hour before class"'}>Check in</button>`;
  }
  wrap.innerHTML = `
    <div class="section-label">
      <span class="eyebrow">Up next</span>
      <span class="aside" style="font-size:15px">${countdownText(inst)}</span>
    </div>
    <div class="ticket">
      <button class="ticket-main" data-key="${inst.key}">
        <div class="display">${c.lines.join('<br>')}</div>
        <div class="ticket-meta">
          <span class="chip">${whenLabel(inst)} · ${inst.dur} min</span>
          <span class="chip">${coachDotSmall(inst.coach)}${inst.coach}</span>
        </div>
      </button>
      <div class="ticket-perf" aria-hidden="true"></div>
      <div class="ticket-stub">${stub}</div>
    </div>`;
  wrap.querySelector('.ticket-main').addEventListener('click', () => openDetail(inst));
  const ci = $('#checkin-btn');
  if(ci) ci.addEventListener('click', e => {
    e.stopPropagation();
    checkIn(inst.key);
    showStamp('Bodied!');
    renderAll();
  });
}
function coachDotSmall(name){
  const c = COACH_COLORS[name];
  return `<span class="coach-dot" style="background:${c.bg};color:${c.fg}">${name[0]}</span>`;
}

function renderWeekStrip(){
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const attendedDays = new Set(attendedList().map(a => a.dateKey));
  const cells = [];
  for(let i = 0; i < 7; i++){
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dk = dateKeyOf(d);
    const done = attendedDays.has(dk);
    const isToday = dk === todayKey();
    cells.push(`<div class="day-cell ${done ? 'done' : ''} ${isToday ? 'today' : ''}">
      ${done ? starSVG : ''}
      <div class="d">${DAY_ABBR[d.getDay()][0]}</div><div class="n">${d.getDate()}</div>
    </div>`);
  }
  $('#week-strip').innerHTML = cells.join('');
}

function renderPosterRail(){
  const now = new Date();
  const upcoming = [];
  for(const id of Object.keys(CLASSES)){
    let found = null;
    for(let i = 0; i < 7 && !found; i++){
      const d = new Date(); d.setDate(d.getDate() + i);
      const day = instancesFor(d);
      if(day === 'rest') continue;
      found = day.find(inst => inst.id === id && startOf(inst) >= now) || null;
    }
    if(found) upcoming.push(found);
  }
  upcoming.sort((a, z) => startOf(a) - startOf(z));
  $('#poster-rail').innerHTML = upcoming.map(inst => {
    const c = CLASSES[inst.id];
    const { t, ap } = time12(inst.h, inst.m);
    const d = fromKey(inst.dateKey);
    const days = Math.round((d - fromKey(todayKey())) / 86400000);
    const dayTag = days === 0 ? 'TODAY' : days === 1 ? 'MAÑANA' : DAY_ABBR[d.getDay()];
    return `<button class="poster ${c.color}" data-key="${inst.key}">
      ${burstSVG}
      <span class="ptime">${dayTag} ${t} ${ap}</span>
      <span>
        <span class="display">${c.lines.join('<br>')}</span>
        <span class="pcoach" style="display:block;margin-top:6px">with ${inst.coach}</span>
      </span>
    </button>`;
  }).join('');
  document.querySelectorAll('#poster-rail .poster').forEach(p => {
    p.addEventListener('click', () => openDetail(instCache[p.dataset.key]));
  });
}

/* ============ CONCEPT-06 CONTENT BRIDGES ============ */
/* data.js is content-only and fenced. These maps carry the presentation
   facts concept-06 needs that have no field in data.js. */

/* DESIGN.md §3 "Imagery": each class is a flat colour field. */
const CLASS_HERO = {
  'full-body-hiit': '#15358E',
  'booty-abs': '#FD47AC',
  'arms-abs': '#DB998B',
  'pilates-sculpt': '#16D5CC',
  'mommy-me': '#16D5CC',
  'muscle-mami': '#FD47AC',
};
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
/* "Today · 6:00am" — sentence case, unlike the LEGACY-01 whenLabel(). */
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
   (Concept-06 draws a fixed Sun–Sat week; this is a reviewed deviation, to
   be recorded in DESIGN.md during PORT-3.) */
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
/* The detail foot keeps the LEGACY-01 precedence: a class you attended still
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

/* ============ CONCEPT-06 BOTTOM SHEET ============ */
/* Its own surface: the LEGACY-01 #sheet still carries pricing / contact /
   payment / profile until PORT-3. */
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
  attended: { cls: 'btn', label: 'Checked in', off: true, note: "This one's in your sticker book." },
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
  const hero = CLASS_HERO[inst.id];
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

/* ============ COACHES ============ */
function renderCoaches(){
  $('#coach-list').innerHTML = COACHES.map((c, i) => {
    const col = COACH_COLORS[c.name];
    const on = !!state.faves[c.name];
    return `<div class="coach-row ${i % 2 ? 'flip' : ''}">
      <div class="coach-block" style="background:${col.bg};color:${col.fg}">${c.name[0]}</div>
      <div class="coach-info">
        <div class="coach-name-row">
          <span class="display">${c.name}</span>
          <button class="fave ${on ? 'on' : ''}" data-name="${c.name}" aria-label="Favorite ${c.name}" aria-pressed="${on}">
            <svg width="20" height="20" viewBox="0 0 20 20"><path class="heart-fill" d="M10 17.5C5 13.5 2 10.6 2 7.3 2 4.9 3.9 3 6.3 3c1.5 0 2.9 0.8 3.7 2 0.8-1.2 2.2-2 3.7-2C16.1 3 18 4.9 18 7.3c0 3.3-3 6.2-8 10.2z" stroke="var(--ink)" stroke-width="1.8"/></svg>
          </button>
        </div>
        <div class="coach-role">${c.role}</div>
        <div class="coach-bio">${c.bio}</div>
        <div class="coach-tags">${c.tags.map(t => `<span class="chip">${t}</span>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
  document.querySelectorAll('.fave').forEach(f => f.addEventListener('click', () => {
    state.faves[f.dataset.name] = !state.faves[f.dataset.name];
    save();
    f.classList.toggle('on', state.faves[f.dataset.name]);
    f.setAttribute('aria-pressed', String(!!state.faves[f.dataset.name]));
  }));
}

/* ============ YOU ============ */
function planById(id){ return PLANS.find(p => p.id === id) || PLANS[0]; }

function trialDay(){
  if(!state.profile) return 1;
  const since = fromKey(state.profile.since);
  return Math.floor((fromKey(todayKey()) - since) / 86400000) + 1;
}

function renderYou(){
  if(!state.profile) return;
  const p = state.profile;
  const plan = planById(p.plan);
  $('#you-name').textContent = p.name;
  const since = fromKey(p.since);
  $('#mc-since').textContent = `Member since ${MON_SHORT[since.getMonth()]} ${since.getFullYear()}`;
  let planVal = plan.short;
  if(plan.id === 'trial'){
    const d = trialDay();
    planVal = d > 7 ? 'Trial · ended' : `Trial · day ${d} of 7`;
  }
  $('#mc-plan').textContent = planVal;
  $('#mc-no').textContent = p.no;

  const attended = attendedList();
  const n = attended.length;
  const line = $('#bodied-line');
  if(n === 0){
    line.innerHTML = `<strong>Zero classes bodied — for now.</strong> Your first stamp is one booking away, mami.`;
  } else {
    line.innerHTML = `<strong>${n} class${n === 1 ? '' : 'es'} bodied</strong> since ${MON_FULL[since.getMonth()]}. Valeria says you're not allowed to stop now.`;
  }

  renderStickers(attended);

  /* membership row */
  if(plan.id === 'trial'){
    const d = trialDay();
    $('#plan-main').textContent = '7 days for $7';
    $('#plan-sub').textContent = d > 7 ? 'Trial over · pick a plan, mami' : `Day ${d} of 7 · then from $102/mo`;
  } else {
    $('#plan-main').textContent = `${plan.short} · ${plan.price}${plan.per}`;
    $('#plan-sub').textContent = plan.id === 'pack-20' ? '20 classes · 6-month expiry' : 'Renews monthly · pause anytime by email';
  }
}

function stickerSVG(s){
  if(s.shape === 'dashed') return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="6 6"/></svg>`;
  if(s.shape === 'burst') return `<svg viewBox="0 0 100 100" style="transform:rotate(${s.rot}deg)"><path d="M50 4l7 15 15-7-3 16 17 2-10 13 14 9-15 6 6 15-16-3-2 17-13-11-9 14-6-15-15 6 3-16-17-2 11-13-14-9 16-6-6-15 16 3 2-17 13 11z" fill="${s.color}" stroke="var(--ink)" stroke-width="2.5"/></svg>`;
  if(s.shape === 'star') return `<svg viewBox="0 0 100 100" style="transform:rotate(${s.rot}deg)"><path d="M50 5l11 28 30 2-23 19 8 29-26-17-26 17 8-29L9 35l30-2z" fill="${s.color}" stroke="var(--ink)" stroke-width="2.5"/></svg>`;
  return `<svg viewBox="0 0 100 100" style="transform:rotate(${s.rot}deg)"><circle cx="50" cy="50" r="44" fill="${s.color}" stroke="var(--ink)" stroke-width="2.5"/></svg>`;
}

function renderStickers(attended){
  const n = attended.length;
  const sixam = attended.some(a => a.h === 6);
  const pilates = attended.filter(a => a.id === 'pilates-sculpt').length;
  const palette = [
    { color: 'var(--pink)', text: 'var(--paper)' },
    { color: 'var(--chartreuse)', text: 'var(--on-bright)' },
    { color: 'var(--ink)', text: 'var(--paper)' },
    { color: 'var(--teal)', text: 'var(--on-bright)' },
  ];
  const shapes = ['burst', 'circle', 'star'];
  const earned = [];
  if(n >= 1) earned.push({ label: 'First class', shape: 'burst', ...palette[0], rot: -5 });
  if(sixam) earned.push({ label: '6AM club', shape: 'circle', ...palette[1], rot: 4 });
  MILESTONES.filter(m => m > 1 && n >= m).forEach((m, i) => {
    earned.push({ label: `${m} bodied`, shape: shapes[(i + 2) % 3], ...palette[(i + 2) % 4], rot: i % 2 ? 5 : -4 });
  });
  if(pilates >= 5) earned.push({ label: 'Pilates era', shape: 'circle', ...palette[3], rot: 6 });
  if(state.friendSticker) earned.push({ label: 'Brought a friend', shape: 'burst', ...palette[1], rot: -7 });

  const locked = [];
  if(n < 1) locked.push({ label: 'First class', hint: 'book one' });
  if(!sixam) locked.push({ label: '6AM club', hint: 'attend a 6AM' });
  if(pilates < 5) locked.push({ label: 'Pilates era', hint: `${5 - pilates} pilates to go` });
  const nextM = MILESTONES.find(m => m > n && m > 1);
  if(nextM) locked.push({ label: `${nextM} bodied`, hint: `${nextM - n} to go` });

  let html = earned.map(s => `
    <div class="sticker">
      ${stickerSVG(s)}
      <span class="s-label" style="color:${s.text};transform:rotate(${s.rot}deg)">${s.label}</span>
    </div>`).join('');
  if(!state.friendSticker){
    html += `<button class="sticker locked claimable" id="claim-friend" title="Tap to claim when you bring a friend">
      ${stickerSVG({ shape: 'dashed' })}
      <span class="s-label">Brought a friend? tap it</span>
    </button>`;
  }
  html += locked.map(s => `
    <div class="sticker locked">
      ${stickerSVG({ shape: 'dashed' })}
      <span class="s-label">${s.label} · ${s.hint}</span>
    </div>`).join('');
  $('#sticker-book').innerHTML = html;
  const claim = $('#claim-friend');
  if(claim) claim.addEventListener('click', () => {
    state.friendSticker = true;
    save();
    showStamp('Claimed!');
    renderYou();
  });
}

/* ============ BOTTOM SHEETS ============ */
const sheet = $('#sheet'), sheetBody = $('#sheet-body'), sheetScrim = $('#sheet-scrim');

function sheetHead(eyebrow, title){
  return `<div class="sheet-head">
    <div><div class="eyebrow">${eyebrow}</div><div class="display">${title}</div></div>
    <button class="sheet-close" aria-label="Close">✕</button>
  </div>`;
}

const SHEETS = {
  pricing(){
    const rows = PLANS.map(p => `
      <div class="price-row">
        <span><div class="nm">${p.name}${p.badge ? `<span class="price-badge">${p.badge}</span>` : ''}</div><div class="sb">${p.sub}</div></span>
        <span class="pr">${p.price}<span class="per">${p.per}</span></span>
      </div>`).join('');
    return `${sheetHead('Membership', 'Pick your plan')}
      ${rows}
      <p class="policy-line">${PRICING_POLICY}</p>
      <div class="sheet-actions">
        <a class="btn" href="${STUDIO.site}" target="_blank" rel="noopener">Join at bodiedsj.com</a>
        <a class="btn ghost" href="${STUDIO.tel}">Call the studio</a>
      </div>
      <p class="policy-line" style="text-align:center">Purchases happen on the site or in studio — this app keeps your spot.</p>`;
  },
  contact(){
    return `${sheetHead('Help & contact', 'Say hi')}
      <p class="sheet-copy">The front desk answers fast — for anything about your plan, bookings, or bringing your little one along.</p>
      <p class="sheet-copy"><strong>${STUDIO.addr}</strong><br>${STUDIO.phone}<br>${STUDIO.email}</p>
      <div class="sheet-actions">
        <a class="btn" href="${STUDIO.tel}">Call ${STUDIO.phone}</a>
        <a class="btn ghost" href="${STUDIO.maps}" target="_blank" rel="noopener">Directions to Lincoln Ave</a>
        <a class="btn ghost" href="mailto:${STUDIO.email}">Email us</a>
      </div>
      <p class="policy-line" style="text-align:center"><span class="aside" style="font-size:15px">see you on the floor, mami.</span></p>`;
  },
  payment(){
    return `${sheetHead('Membership', 'Payments')}
      <p class="sheet-copy">Your plan and payments are handled by BODIED SJ directly — nothing is ever charged through this app.</p>
      <p class="sheet-copy">To start, change, pause, or cancel a plan: grab it on the site, call, or email <strong>${STUDIO.email}</strong>.</p>
      <div class="sheet-actions">
        <a class="btn" href="${STUDIO.site}" target="_blank" rel="noopener">Manage at bodiedsj.com</a>
        <a class="btn ghost" href="${STUDIO.tel}">Call the studio</a>
      </div>`;
  },
  notifications(){
    return `${sheetHead('Reminders', 'Never miss it')}
      <p class="sheet-copy">The reminder that always works: put the class on your calendar.</p>
      <p class="sheet-copy">Open any <strong>booked ticket</strong> and tap <strong>+ Add to calendar</strong> — your phone pings you 2 hours before class. No permissions, no spam.</p>
      <div class="sheet-actions">
        <button class="btn" id="nf-go">See my next ticket</button>
      </div>`;
  },
  profile(){
    const p = state.profile || { name: '', plan: 'trial' };
    return `${sheetHead('Your card', 'Name & plan')}
      <div class="ob-field" style="margin-top:16px">
        <label class="eyebrow" for="pf-name">Your name</label>
        <input class="ob-input" id="pf-name" type="text" maxlength="30" value="${esc(p.name)}">
      </div>
      <div class="ob-field">
        <label class="eyebrow" id="pf-chips-label">Your plan</label>
        <div class="plan-chips" id="pf-chips" role="radiogroup" aria-labelledby="pf-chips-label">${planChipsHTML(p.plan)}</div>
      </div>
      <div class="sheet-actions">
        <button class="btn" id="pf-save">Save</button>
      </div>`;
  },
};

function openSheet(name){
  sheetBody.innerHTML = SHEETS[name]();
  sheetBody.scrollTop = 0;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  sheetScrim.classList.add('open');
  sheetBody.querySelector('.sheet-close').addEventListener('click', closeSheet);
  if(name === 'notifications'){
    $('#nf-go').addEventListener('click', () => {
      closeSheet();
      const next = nextBookings()[0];
      if(next) openDetail(next.inst);
      else tabTo('classes');
    });
  }
  if(name === 'profile'){
    wirePlanChips($('#pf-chips'));
    $('#pf-save').addEventListener('click', () => {
      const name2 = $('#pf-name').value.trim();
      if(name2) state.profile.name = name2;
      state.profile.plan = $('#pf-chips .plan-chip.sel').dataset.plan;
      save();
      closeSheet();
      renderAll();
    });
  }
}
function closeSheet(){
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  sheetScrim.classList.remove('open');
}
sheetScrim.addEventListener('click', closeSheet);

document.querySelectorAll('[data-sheet]').forEach(el => {
  el.addEventListener('click', () => openSheet(el.dataset.sheet));
});
$('#promo').addEventListener('click', () => openSheet('pricing'));
$('#plan-manage').addEventListener('click', () => openSheet('pricing'));

document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  /* topmost first: confirmed → confirm sheet → detail → legacy sheet */
  if($('#done').classList.contains('on')) tabTo('classes');
  else if(c6sheet.classList.contains('on')) closeSheet06();
  else if(detail.classList.contains('on')) closeDetail();
  else if(sheet.classList.contains('open')) closeSheet();
});

/* ============ ONBOARDING ============ */
function planChipsHTML(sel){
  return PLANS.map(p => `<button class="plan-chip ${p.id === sel ? 'sel' : ''}" data-plan="${p.id}" role="radio" aria-checked="${p.id === sel}">${p.short}</button>`).join('');
}
function wirePlanChips(container){
  container.querySelectorAll('.plan-chip').forEach(ch => ch.addEventListener('click', () => {
    container.querySelectorAll('.plan-chip').forEach(x => { x.classList.remove('sel'); x.setAttribute('aria-checked', 'false'); });
    ch.classList.add('sel');
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
    const plan = $('#plan-chips .plan-chip.sel').dataset.plan;
    state.profile = {
      name,
      plan,
      since: todayKey(),
      no: pad(fnv(name + todayKey()) % 10000).padStart(4, '0'),
    };
    save();
    renderAll();
    showStamp("Let's go!");
    ob.classList.add('closing');
    setTimeout(() => { ob.hidden = true; }, 400);
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
  $('#appearance-val').textContent = (t === 'dark' ? 'After dark' : 'Daylight') + ' ›';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', themeColorFor(t));
  if(persist){ state.theme = t; save(); }
}
const flipTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark', true);
$('#theme-toggle').addEventListener('click', flipTheme);
$('#appearance-row').addEventListener('click', flipTheme);
/* More is a placeholder this stage, so it hands appearance back to the
   legacy settings screen until the real More lands in PORT-3. */
$('#more-appearance').addEventListener('click', () => tabTo('you'));

/* ============ STATUS BAR CLOCK (desktop stage) ============ */
function tickClock(){
  const now = new Date();
  const h = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
  $('#sb-time').textContent = `${h}:${pad(now.getMinutes())}`;
}

/* ============ RENDER ALL / MINUTE TICK ============ */
function renderAll(){
  renderHome();
  renderTodayHead();
  renderUpNext();
  renderWeekStrip();
  renderPosterRail();
  renderDayStrip();
  renderSchedule();
  syncFilterDot();
  /* keeps an open detail honest about spots, ended and in-progress */
  if(detailInst) renderDetail();
  renderYou();
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
renderCoaches();
normalizeDay();
renderAll();
initOnboarding();
fitPhone();

/* hash deep links: #home #schedule #pricing #shop #more #detail=<classId>,
   plus the concept-01 hashes, which keep resolving through the tab mapping.
   Append &dark for the dark theme. */
const HASH_SCREEN = {
  home: 'home', today: 'home',
  schedule: 'classes', classes: 'classes',
  pricing: 'pricing', shop: 'shop',
  more: 'more', coaches: 'more', you: 'more',
};
(function(){
  const h = decodeURIComponent(location.hash.slice(1));
  if(!h) return;
  const [main] = h.split('&');
  const scr = main.split('=')[0];
  if(HASH_SCREEN[scr]) tabTo(HASH_SCREEN[scr]);
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
