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
function coachDot(name, size){
  const c = COACH_COLORS[name];
  return `<span class="cdot" style="width:${size}px;height:${size}px;background:${c.bg};color:${c.fg}">${name[0]}</span>`;
}
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
function tabTo(name){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.screen === name));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name).classList.add('active');
  closeDetail();
  closeSheet();
}
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => tabTo(tab.dataset.screen));
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

/* ============ CLASSES / TIMETABLE ============ */
let currentDayKey = todayKey();

function renderDayChips(){
  const chips = [];
  for(let i = 0; i < 7; i++){
    const d = new Date(); d.setDate(d.getDate() + i);
    const dk = dateKeyOf(d);
    const label = i === 0 ? 'TODAY' : `${DAY_ABBR[d.getDay()]} ${d.getDate()}`;
    chips.push(`<button class="daychip ${dk === currentDayKey ? 'sel' : ''}" role="tab" aria-selected="${dk === currentDayKey}" data-day="${dk}">${label}</button>`);
  }
  $('#daychips').innerHTML = chips.join('');
  document.querySelectorAll('.daychip').forEach(ch => {
    ch.addEventListener('click', () => { currentDayKey = ch.dataset.day; renderDayChips(); renderTimetable(); });
  });
}

function renderTimetable(){
  const date = fromKey(currentDayKey);
  const day = instancesFor(date);
  const tt = $('#timetable');
  if(day === 'rest'){
    tt.innerHTML = `<div class="rest-state">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4l6 16 16-6-6 16 16 6-16 6 6 16-16-6-6 16-6-16-16 6 6-16-16-6 16-6-6-16 16 6z" fill="var(--chartreuse)" stroke="var(--ink)" stroke-width="2.5"/></svg>
      <div class="display">Rest day</div>
      <p class="aside">stretch, hydrate, text your gym bestie.</p>
    </div>`;
    return;
  }
  const now = new Date();
  const rows = day.map(inst => {
    const c = CLASSES[inst.id];
    const b = bookingOf(inst.key);
    const ended = endOf(inst) < now;
    const left = seededLeft(inst.key);
    const { t, ap } = time12(inst.h, inst.m);
    let act, spots = '';
    if(ended){
      act = `<span class="full-tag">Ended</span>`;
    } else if(b && b.status === 'attended'){
      act = `<span class="mini-stamp">Bodied ★</span>`;
    } else if(b && b.status === 'booked'){
      act = `<span class="mini-stamp">Booked</span>`;
    } else if(b && b.status === 'waitlist'){
      act = `<span class="mini-stamp wl">Waitlist</span>`;
    } else if(left === 0){
      act = `<span class="full-tag">Full ·<br>waitlist</span>`;
    } else {
      act = `<button class="btn sm book-inline" data-key="${inst.key}">Book</button>`;
      spots = `<span class="spots">${'<i></i>'.repeat(Math.min(left, 3))} ${left} left</span>`;
    }
    return `<div class="trow ${ended ? 'ended' : ''}" data-key="${inst.key}" role="button" tabindex="0">
      <div class="t-time"><div class="h">${t}</div><div class="ap">${ap}</div></div>
      <div class="t-main">
        <div class="t-name">${c.lines.join(' ')}</div>
        <div class="t-meta">${coachDot(inst.coach, 18)} ${inst.coach} · ${inst.dur} min ${spots}</div>
      </div>
      <div class="t-act">${act}</div>
    </div>`;
  }).join('');

  tt.innerHTML = rows;

  tt.querySelectorAll('.book-inline').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      book(btn.dataset.key);
      showStamp('Booked!');
      renderAll();
    });
  });
  tt.querySelectorAll('.trow').forEach(row => {
    row.addEventListener('click', () => openDetail(instCache[row.dataset.key]));
    row.addEventListener('keydown', e => { if(e.key === 'Enter') row.click(); });
  });
}

/* ============ DETAIL ============ */
const detail = $('#detail');
let currentInst = null;

function openDetail(inst){
  if(!inst) return;
  currentInst = inst;
  const c = CLASSES[inst.id];
  detail.className = 'detail ' + c.color;
  $('#d-title').innerHTML = `<div class="display">${c.lines[0]}</div><div class="display outline">${c.lines[1]}</div>`;
  $('#d-when').textContent = `${whenLabel(inst)} · ${inst.dur} MIN`;
  $('#d-coach').innerHTML = `${coachDot(inst.coach, 30)} with Coach ${inst.coach}`;
  $('#d-effort').textContent = '★'.repeat(c.effort) + '☆'.repeat(4 - c.effort);
  $('#d-vibe').innerHTML = `<span class="eyebrow" style="letter-spacing:0.14em">The vibe</span><p>${c.vibe}</p>`;
  $('#d-tags').innerHTML = c.tags.map(t => `<span class="chip">${t}</span>`).join('');
  renderDetailState();
  detail.classList.add('open');
  detail.setAttribute('aria-hidden', 'false');
  detail.scrollTop = 0;
  app.classList.toggle('detail-light', c.color !== 'c-chartreuse');
  app.classList.toggle('detail-bright', c.color === 'c-chartreuse');
}

function renderDetailState(){
  const inst = currentInst;
  const btn = $('#d-book'), note = $('#d-note'), actions = $('#d-actions');
  const b = bookingOf(inst.key);
  const ended = endOf(inst) < new Date();
  const left = seededLeft(inst.key);
  btn.classList.remove('stamped');
  btn.disabled = false;
  btn.dataset.action = '';
  actions.innerHTML = '';

  if(ended && (!b || b.status !== 'attended')){
    btn.textContent = 'Class ended';
    btn.disabled = true;
    note.textContent = 'Catch the next one — same energy.';
  } else if(b && b.status === 'attended'){
    btn.textContent = 'Bodied ★';
    btn.classList.add('stamped');
    btn.disabled = true;
    note.textContent = "This one's in your sticker book.";
  } else if(b && b.status === 'booked'){
    btn.textContent = `You're in · spot ${pad(b.spot)}`;
    btn.classList.add('stamped');
    btn.disabled = true;
    note.textContent = 'See you there. Cancel free up to 2 hours before.';
    actions.innerHTML = `
      <button class="d-linkbtn" id="d-cal">+ Add to calendar</button>
      <button class="d-linkbtn" id="d-cancel">Cancel booking</button>`;
    $('#d-cal').addEventListener('click', () => downloadICS(inst));
    $('#d-cancel').addEventListener('click', () => {
      cancelBooking(inst.key);
      renderDetailState();
      renderAll();
    });
  } else if(b && b.status === 'waitlist'){
    btn.textContent = `On the waitlist · #${b.pos}`;
    btn.disabled = true;
    note.textContent = 'If a spot opens, the front desk bumps you in.';
    actions.innerHTML = `<button class="d-linkbtn" id="d-leave">Leave waitlist</button>`;
    $('#d-leave').addEventListener('click', () => {
      cancelBooking(inst.key);
      renderDetailState();
      renderAll();
    });
  } else if(left === 0){
    btn.textContent = 'Join waitlist';
    btn.dataset.action = 'waitlist';
    note.textContent = 'Full class — the waitlist moves fast.';
  } else {
    btn.textContent = 'Book my spot';
    btn.dataset.action = 'book';
    note.textContent = 'Cancel free up to 2 hours before';
  }
}

$('#d-book').addEventListener('click', () => {
  if(!currentInst) return;
  const action = $('#d-book').dataset.action;
  if(action === 'book'){
    book(currentInst.key);
    showStamp('Booked!');
  } else if(action === 'waitlist'){
    joinWaitlist(currentInst.key);
    showStamp('On the list!');
  } else return;
  renderDetailState();
  renderAll();
});

function closeDetail(){
  detail.classList.remove('open');
  detail.setAttribute('aria-hidden', 'true');
  app.classList.remove('detail-light', 'detail-bright');
}
$('#d-back').addEventListener('click', closeDetail);

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
    $('#plan-sub').textContent = plan.id === 'pack-20' ? '20 classes · 3-month expiry' : 'Renews monthly · pause anytime by email';
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
    const testis = TESTIMONIALS.map(t => `
      <div class="testi">
        <div class="stars">★★★★★</div>
        <p>“${t.txt}”</p>
        <span class="who eyebrow">${t.who}</span>
      </div>`).join('');
    return `${sheetHead('Membership', 'Pick your plan')}
      ${rows}
      <p class="policy-line">${PRICING_POLICY}</p>
      <div class="section-label" style="margin-top:22px"><span class="eyebrow">Word on the street</span></div>
      <div class="testi-rail">${testis}</div>
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
  if(sheet.classList.contains('open')) closeSheet();
  else if(detail.classList.contains('open')) closeDetail();
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
function themeColorFor(t){ return t === 'dark' ? '#2a1c25' : '#FBF9EE'; }
let theme = state.theme || 'light';
if(location.hash.includes('dark')) theme = 'dark';
function applyTheme(t, persist){
  theme = t;
  if(t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const tg = $('#theme-toggle');
  if(tg) tg.textContent = t === 'dark' ? '☀ daylight' : '☾ after dark';
  $('#appearance-val').textContent = (t === 'dark' ? 'After dark' : 'Daylight') + ' ›';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', themeColorFor(t));
  if(persist){ state.theme = t; save(); }
}
const flipTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark', true);
$('#theme-toggle').addEventListener('click', flipTheme);
$('#appearance-row').addEventListener('click', flipTheme);

/* ============ STATUS BAR CLOCK (desktop stage) ============ */
function tickClock(){
  const now = new Date();
  const h = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
  $('#sb-time').textContent = `${h}:${pad(now.getMinutes())}`;
}

/* ============ RENDER ALL / MINUTE TICK ============ */
function renderAll(){
  renderTodayHead();
  renderUpNext();
  renderWeekStrip();
  renderPosterRail();
  renderDayChips();
  renderTimetable();
  renderYou();
  tickClock();
}

function minuteTick(){
  /* day rollover: selected day may fall behind */
  if(fromKey(currentDayKey) < fromKey(todayKey())) currentDayKey = todayKey();
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
renderAll();
initOnboarding();
fitPhone();

/* hash deep links: #today #classes #coaches #you #detail=<classId> */
(function(){
  const h = decodeURIComponent(location.hash.slice(1));
  if(!h) return;
  const [main] = h.split('&');
  const scr = main.split('=')[0];
  if(['today', 'classes', 'coaches', 'you'].includes(scr)) tabTo(scr);
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
