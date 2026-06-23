'use strict';

const $ = (id) => document.getElementById(id);
let state = null;
let calMonth; // {year, month} 0-based month being viewed

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Passcode gate
// ---------------------------------------------------------------------------
async function initGate() {
  const { needsPasscode } = await api('/api/needs-passcode');
  if (!needsPasscode || sessionStorage.getItem('unlocked') === '1') {
    return startApp();
  }
  $('gate').classList.remove('hidden');
  const submit = async () => {
    const { ok } = await api('/api/login', 'POST', { passcode: $('gate-input').value });
    if (ok) {
      sessionStorage.setItem('unlocked', '1');
      $('gate').classList.add('hidden');
      startApp();
    } else {
      $('gate-error').classList.remove('hidden');
    }
  };
  $('gate-btn').onclick = submit;
  $('gate-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
async function startApp() {
  $('app').classList.remove('hidden');
  await refresh();
  wireUp();
}

async function refresh() {
  state = await api('/api/state');
  const [y, m] = state.today.split('-').map(Number);
  if (!calMonth) calMonth = { year: y, month: m - 1 };
  render();
}

function dose(date) { return state.doses[date]; }

// Cycle math (mirrors the server). Returns null if disabled/unset.
function cycleInfo(date) {
  const c = state.settings.cycle;
  if (!c?.enabled || !c.packStart) return null;
  const len = (Number(c.activeDays) || 0) + (Number(c.breakDays) || 0);
  if (len <= 0) return null;
  let idx = daysBetween(c.packStart, date) % len;
  if (idx < 0) idx += len;
  const isBreak = idx >= Number(c.activeDays);
  return { dayInCycle: idx + 1, cycleLength: len, isBreak, activeLeft: isBreak ? 0 : Number(c.activeDays) - idx };
}
function isCycleBreak(date) { return cycleInfo(date)?.isBreak === true; }
function isManualFree(date) { return state.pillFree.includes(date); }
function isPillFree(date) { return isManualFree(date) || isCycleBreak(date); }

function daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function render() {
  renderStatus();
  renderMascot();
  renderStreak();
  renderCycle();
  renderCalendar();
}

function renderCycle() {
  const card = $('cycle-card');
  const info = cycleInfo(state.today);
  if (!info) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  card.classList.toggle('period', info.isBreak);
  if (info.isBreak) {
    $('cycle-text').textContent = `🩸 Break day ${info.dayInCycle - (Number(state.settings.cycle.activeDays))} · period expected · day ${info.dayInCycle} of ${info.cycleLength}`;
  } else {
    $('cycle-text').textContent = `💊 Active pill day ${info.dayInCycle} of ${info.cycleLength} · ${info.activeLeft} day${info.activeLeft === 1 ? '' : 's'} until break`;
  }
}

function renderStatus() {
  const today = state.today;
  const taken = dose(today)?.taken;
  const free = isPillFree(today);
  const takeBtn = $('take-btn');
  const undoBtn = $('undo-btn');
  const note = $('pillfree-note');

  note.classList.toggle('hidden', !free);

  if (free) {
    $('status-line').textContent = "Today is a break day 🌿";
    takeBtn.classList.add('hidden');
    undoBtn.classList.add('hidden');
    return;
  }
  takeBtn.classList.remove('hidden');

  if (taken) {
    $('status-line').textContent = "All done for today! 🎉";
    takeBtn.textContent = "Taken ✓";
    takeBtn.classList.add('done');
    takeBtn.disabled = true;
    undoBtn.classList.remove('hidden');
  } else {
    $('status-line').textContent = `Did you take your pill today?`;
    takeBtn.textContent = "I took my pill 💊";
    takeBtn.classList.remove('done');
    takeBtn.disabled = false;
    undoBtn.classList.add('hidden');
  }
}

function renderMascot() {
  const today = state.today;
  const taken = dose(today)?.taken;
  const free = isPillFree(today);
  const name = state.settings.herName || 'cutie';
  let msg;
  if (free) msg = `No pill today — enjoy your break, ${name}! 🌸`;
  else if (taken) msg = `Yay! Proud of you, ${name} 💚 See you tomorrow!`;
  else msg = `Hi ${name}! Don't forget your pill today 💊`;
  $('speech').textContent = msg;
}

function renderStreak() {
  // Count consecutive days (ending today or yesterday) that were taken,
  // skipping over pill-free days.
  let streak = 0;
  let cursor = state.today;
  // If today not yet taken and not free, start from yesterday so the streak
  // isn't broken just because it's early in the day.
  if (!dose(cursor)?.taken && !isPillFree(cursor)) cursor = shift(cursor, -1);
  for (let i = 0; i < 400; i++) {
    if (isPillFree(cursor)) { cursor = shift(cursor, -1); continue; }
    if (dose(cursor)?.taken) { streak++; cursor = shift(cursor, -1); }
    else break;
  }
  $('streak-text').textContent = streak > 0 ? `🔥 ${streak} day streak` : `🌱 Start your streak today!`;
}

function shift(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function renderCalendar() {
  const { year, month } = calMonth;
  $('cal-title').textContent = `${MONTHS[month]} ${year}`;
  const grid = $('cal-grid');
  grid.innerHTML = '';

  const first = new Date(Date.UTC(year, month, 1));
  // Monday-first offset
  const startDow = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  for (let i = 0; i < startDow; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty';
    grid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(year, month, d);
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    cell.textContent = d;

    if (key === state.today) cell.classList.add('today');
    if (isCycleBreak(key)) {
      cell.classList.add('period');      // cycle break day = period expected 🩸
    } else if (isManualFree(key)) {
      cell.classList.add('free');        // manually marked pill-free 🌿
    } else if (dose(key)?.taken) {
      cell.classList.add('taken');
    } else if (key < state.today) {
      cell.classList.add('missed');
    }

    cell.onclick = () => togglePillFree(key);
    grid.appendChild(cell);
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function takePill() {
  state = await api('/api/take', 'POST', {});
  const mascot = $('mascot');
  mascot.classList.add('happy');
  setTimeout(() => mascot.classList.remove('happy'), 700);
  render();
}

async function undoPill() {
  state = await api('/api/untake', 'POST', {});
  render();
}

async function togglePillFree(date) {
  const value = !isPillFree(date);
  state = await api('/api/pill-free', 'POST', { date, value });
  render();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function openSettings() {
  $('set-name').value = state.settings.herName || '';
  $('set-time').value = state.settings.pillTime || '21:30';
  $('set-reminders').value = (state.settings.reminderTimes || []).join(', ');
  $('set-tz').value = state.settings.timezone || '';
  $('set-her').value = state.settings.herNumber || '';
  $('set-partner').value = state.settings.partnerNumber || '';

  const alert = state.settings.partnerAlert || {};
  $('set-alert-on').checked = !!alert.enabled;
  $('set-alert-time').value = alert.time || '22:30';

  const cycle = state.settings.cycle || {};
  $('set-cycle-on').checked = !!cycle.enabled;
  $('set-cycle-start').value = cycle.packStart || '';
  $('set-cycle-active').value = cycle.activeDays ?? 21;
  $('set-cycle-break').value = cycle.breakDays ?? 7;

  $('settings-modal').classList.remove('hidden');
}

async function saveSettings() {
  const payload = {
    herName: $('set-name').value.trim(),
    pillTime: $('set-time').value,
    reminderTimes: $('set-reminders').value,
    timezone: $('set-tz').value.trim(),
    herNumber: $('set-her').value.replace(/\s/g, ''),
    partnerNumber: $('set-partner').value.replace(/\s/g, ''),
    partnerAlert: {
      enabled: $('set-alert-on').checked,
      time: $('set-alert-time').value || '22:30',
    },
    cycle: {
      enabled: $('set-cycle-on').checked,
      packStart: $('set-cycle-start').value,
      activeDays: Number($('set-cycle-active').value) || 21,
      breakDays: Number($('set-cycle-break').value) || 7,
    },
  };
  state = await api('/api/settings', 'POST', payload);
  $('settings-modal').classList.add('hidden');
  render();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function wireUp() {
  $('take-btn').onclick = takePill;
  $('undo-btn').onclick = undoPill;
  $('settings-btn').onclick = openSettings;
  $('set-cancel').onclick = () => $('settings-modal').classList.add('hidden');
  $('set-save').onclick = saveSettings;
  $('cal-prev').onclick = () => { stepMonth(-1); };
  $('cal-next').onclick = () => { stepMonth(1); };
}

function stepMonth(delta) {
  let { year, month } = calMonth;
  month += delta;
  if (month < 0) { month = 11; year--; }
  if (month > 11) { month = 0; year++; }
  calMonth = { year, month };
  renderCalendar();
}

// ---------------------------------------------------------------------------
// PWA: service worker + install prompt
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
  });
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $('install-btn');
  if (!btn) return;
  btn.classList.remove('hidden');
  btn.onclick = async () => {
    btn.classList.add('hidden');
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  };
});
window.addEventListener('appinstalled', () => $('install-btn')?.classList.add('hidden'));

initGate();
