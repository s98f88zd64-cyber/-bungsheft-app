'use strict';

const STORAGE_KEY = 'uebungsheft.sessions.v1';
const TIMER_KEY = 'uebungsheft.timer.v1';

const $ = (sel) => document.querySelector(sel);

// ---------- Speicher ----------

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    alert('Speichern fehlgeschlagen – ist der Browser-Speicher voll oder blockiert?');
  }
}

let sessions = load(STORAGE_KEY, []);
const persist = () => save(STORAGE_KEY, sessions);

// ---------- Datumshilfen (immer lokale Zeit) ----------

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function startOfWeek(d) {
  // Woche beginnt am Montag
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(c, -((c.getDay() + 6) % 7));
}

const weekdayShort = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const dayLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function formatMinutes(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---------- Statistik ----------

function minutesByDate() {
  const map = new Map();
  for (const s of sessions) map.set(s.date, (map.get(s.date) || 0) + s.duration);
  return map;
}

function renderStats() {
  const byDate = minutesByDate();
  const today = new Date();
  const todayISO = toISODate(today);

  $('#stat-today').textContent = formatMinutes(byDate.get(todayISO) || 0);

  const weekStart = toISODate(startOfWeek(today));
  let week = 0;
  for (const [date, min] of byDate) if (date >= weekStart && date <= todayISO) week += min;
  $('#stat-week').textContent = formatMinutes(week);

  // Serie: aufeinanderfolgende Tage bis heute (oder bis gestern, falls heute noch nichts)
  let streak = 0;
  let cursor = byDate.has(todayISO) ? today : addDays(today, -1);
  while (byDate.has(toISODate(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  $('#stat-streak').textContent = `${streak} ${streak === 1 ? 'Tag' : 'Tage'}`;

  const total = sessions.reduce((sum, s) => sum + s.duration, 0);
  $('#stat-total').textContent = total < 60 ? `${total} min` : `${(total / 60).toFixed(1).replace('.', ',')} h`;
}

function renderChart() {
  const byDate = minutesByDate();
  const today = new Date();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    days.push({ d, iso: toISODate(d), min: byDate.get(toISODate(d)) || 0 });
  }
  const max = Math.max(30, ...days.map((x) => x.min));

  const chart = $('#chart');
  chart.replaceChildren(...days.map(({ d, iso, min }, i) => {
    const col = document.createElement('div');
    col.className = 'bar-col' + (i === days.length - 1 ? ' today' : '');
    col.title = `${dayLong.format(d)}: ${formatMinutes(min)}`;
    const bar = document.createElement('div');
    bar.className = 'bar' + (min ? '' : ' zero');
    bar.style.height = `calc(${(min / max) * 100}% - 20px)`;
    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = weekdayShort.format(d).replace('.', '');
    col.append(bar, label);
    col.dataset.date = iso;
    return col;
  }));
}

function renderBreakdown() {
  const totals = new Map();
  for (const s of sessions) totals.set(s.category, (totals.get(s.category) || 0) + s.duration);
  const sorted = [...totals].sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;

  $('#breakdown').replaceChildren(...sorted.map(([name, min]) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="name"></span><span class="track"><span class="fill"></span></span><span class="mins"></span>';
    li.querySelector('.name').textContent = name;
    li.querySelector('.name').title = name;
    li.querySelector('.fill').style.width = `${(min / max) * 100}%`;
    li.querySelector('.mins').textContent = formatMinutes(min);
    return li;
  }));

  $('#categories').replaceChildren(...sorted.map(([name]) => {
    const opt = document.createElement('option');
    opt.value = name;
    return opt;
  }));
}

// ---------- Verlauf ----------

function renderList() {
  const q = $('#filter').value.trim().toLowerCase();
  const filtered = sessions
    .filter((s) => !q || s.category.toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  const groups = new Map();
  for (const s of filtered) {
    if (!groups.has(s.date)) groups.set(s.date, []);
    groups.get(s.date).push(s);
  }

  const list = $('#session-list');
  list.replaceChildren(...[...groups].map(([date, items]) => {
    const group = document.createElement('div');
    group.className = 'day-group';
    const h = document.createElement('h3');
    const sum = items.reduce((a, s) => a + s.duration, 0);
    h.textContent = `${dayLong.format(parseISODate(date))} · ${formatMinutes(sum)}`;
    group.append(h, ...items.map(renderSession));
    return group;
  }));

  const empty = $('#empty');
  empty.hidden = filtered.length > 0;
  empty.textContent = sessions.length ? 'Keine Treffer.' : 'Noch keine Sessions – leg los! 🎯';
}

function renderSession(s) {
  const el = document.createElement('article');
  el.className = 'session';
  el.innerHTML = `
    <div class="meta">
      <span class="cat"></span>
      <span class="dur"></span>
      <span class="stars"></span>
    </div>
    <div class="actions">
      <button type="button" class="edit" aria-label="Bearbeiten">Bearbeiten</button>
      <button type="button" class="del" aria-label="Löschen">Löschen</button>
    </div>`;
  el.querySelector('.cat').textContent = s.category;
  el.querySelector('.dur').textContent = formatMinutes(s.duration);
  el.querySelector('.stars').textContent = s.rating ? '★'.repeat(s.rating) + '☆'.repeat(5 - s.rating) : '';
  if (s.notes) {
    const p = document.createElement('p');
    p.className = 'notes';
    p.textContent = s.notes;
    el.append(p);
  }
  el.querySelector('.edit').addEventListener('click', () => startEdit(s.id));
  el.querySelector('.del').addEventListener('click', () => {
    if (!confirm(`Session „${s.category}" (${formatMinutes(s.duration)}) löschen?`)) return;
    sessions = sessions.filter((x) => x.id !== s.id);
    persist();
    renderAll();
  });
  return el;
}

function renderAll() {
  renderStats();
  renderChart();
  renderBreakdown();
  renderList();
}

// ---------- Formular ----------

const form = $('#session-form');
let rating = 0;

function renderRating() {
  const wrap = $('#f-rating');
  wrap.replaceChildren(...[1, 2, 3, 4, 5].map((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(n === rating));
    b.setAttribute('aria-label', `${n} von 5`);
    b.textContent = n <= rating ? '★' : '☆';
    b.addEventListener('click', () => {
      rating = rating === n ? 0 : n; // erneuter Klick hebt die Bewertung auf
      renderRating();
    });
    return b;
  }));
}

function resetForm() {
  form.reset();
  $('#f-id').value = '';
  $('#f-date').value = toISODate(new Date());
  rating = 0;
  renderRating();
  $('#f-submit').textContent = 'Speichern';
  $('#f-cancel').hidden = true;
}

function startEdit(id) {
  const s = sessions.find((x) => x.id === id);
  if (!s) return;
  $('#f-id').value = s.id;
  $('#f-date').value = s.date;
  $('#f-duration').value = s.duration;
  $('#f-category').value = s.category;
  $('#f-notes').value = s.notes || '';
  rating = s.rating || 0;
  renderRating();
  $('#f-submit').textContent = 'Änderungen speichern';
  $('#f-cancel').hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#f-duration').focus({ preventScroll: true });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    date: $('#f-date').value,
    duration: Math.round(Number($('#f-duration').value)),
    category: $('#f-category').value.trim(),
    notes: $('#f-notes').value.trim(),
    rating,
  };
  if (!data.date || !data.category || !(data.duration > 0)) return;

  const id = $('#f-id').value;
  if (id) {
    sessions = sessions.map((s) => (s.id === id ? { ...s, ...data } : s));
  } else {
    sessions.push({ id: crypto.randomUUID(), createdAt: Date.now(), ...data });
  }
  persist();
  resetForm();
  renderAll();
});

$('#f-cancel').addEventListener('click', resetForm);
$('#filter').addEventListener('input', renderList);

// ---------- Timer (übersteht Neuladen der Seite) ----------

let timer = load(TIMER_KEY, { startedAt: null, elapsed: 0 });
let tick = null;

const timerElapsed = () => timer.elapsed + (timer.startedAt ? Date.now() - timer.startedAt : 0);

function renderTimer() {
  const total = Math.floor(timerElapsed() / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  $('#timer-display').textContent = `${h}:${m}:${s}`;

  const running = Boolean(timer.startedAt);
  const hasTime = timerElapsed() > 0;
  $('.timer').classList.toggle('running', running);
  $('#timer-toggle').textContent = running ? 'Pause' : hasTime ? 'Weiter' : 'Start';
  $('#timer-finish').disabled = !hasTime;
  $('#timer-reset').disabled = !hasTime;
}

function syncTick() {
  clearInterval(tick);
  tick = timer.startedAt ? setInterval(renderTimer, 500) : null;
  renderTimer();
}

$('#timer-toggle').addEventListener('click', () => {
  if (timer.startedAt) {
    timer = { startedAt: null, elapsed: timerElapsed() };
  } else {
    timer = { ...timer, startedAt: Date.now() };
  }
  save(TIMER_KEY, timer);
  syncTick();
});

$('#timer-reset').addEventListener('click', () => {
  if (!confirm('Timer zurücksetzen?')) return;
  timer = { startedAt: null, elapsed: 0 };
  save(TIMER_KEY, timer);
  syncTick();
});

$('#timer-finish').addEventListener('click', () => {
  const minutes = Math.max(1, Math.round(timerElapsed() / 60000));
  timer = { startedAt: null, elapsed: 0 };
  save(TIMER_KEY, timer);
  syncTick();
  $('#f-duration').value = minutes;
  if (!$('#f-id').value) $('#f-date').value = toISODate(new Date());
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#f-category').focus({ preventScroll: true });
});

// ---------- Export / Import ----------

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, sessions }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `uebungsheft-${toISODate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

function isValidSession(s) {
  return s && typeof s === 'object'
    && typeof s.id === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(s.date)
    && Number.isFinite(s.duration) && s.duration > 0
    && typeof s.category === 'string' && s.category.trim();
}

$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = (Array.isArray(parsed) ? parsed : parsed.sessions || []).filter(isValidSession);
    if (!incoming.length) throw new Error('Keine gültigen Sessions gefunden.');
    const known = new Set(sessions.map((s) => s.id));
    const added = incoming
      .filter((s) => !known.has(s.id))
      .map((s) => ({
        id: s.id,
        createdAt: Number(s.createdAt) || Date.now(),
        date: s.date,
        duration: Math.round(s.duration),
        category: s.category.trim(),
        notes: typeof s.notes === 'string' ? s.notes : '',
        rating: Number.isInteger(s.rating) && s.rating >= 0 && s.rating <= 5 ? s.rating : 0,
      }));
    sessions.push(...added);
    persist();
    renderAll();
    alert(`${added.length} Session(s) importiert, ${incoming.length - added.length} bereits vorhanden.`);
  } catch (err) {
    alert(`Import fehlgeschlagen: ${err.message}`);
  }
});

// ---------- Start ----------

// Andere Tabs synchron halten
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { sessions = load(STORAGE_KEY, []); renderAll(); }
  if (e.key === TIMER_KEY) { timer = load(TIMER_KEY, { startedAt: null, elapsed: 0 }); syncTick(); }
});

resetForm();
syncTick();
renderAll();
