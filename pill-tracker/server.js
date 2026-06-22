import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Storage (simple JSON file on disk)
// ---------------------------------------------------------------------------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  settings: {
    herName: process.env.HER_NAME || 'love',
    pillTime: process.env.PILL_TIME || '21:00',        // HH:mm, when she takes it
    timezone: process.env.TIMEZONE || 'Europe/Rome',
    herNumber: process.env.HER_WHATSAPP || '',          // e.g. +393331234567
    partnerNumber: process.env.PARTNER_WHATSAPP || '',  // your number
  },
  doses: {},          // { 'YYYY-MM-DD': { taken: true, takenAt: ISO } }
  pillFree: [],       // ['YYYY-MM-DD', ...] days she is NOT supposed to take it
  sentReminders: {},  // { 'YYYY-MM-DD': { '0': true, '60': true, ... } }
};

function loadDb() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DB, ...parsed, settings: { ...DEFAULT_DB.settings, ...parsed.settings } };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

let db = loadDb();

// ---------------------------------------------------------------------------
// Time helpers (timezone-aware without external deps, via Intl)
// ---------------------------------------------------------------------------
function nowParts(tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  let hour = parseInt(p.hour, 10) % 24; // some platforms emit '24' at midnight
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + parseInt(p.minute, 10) };
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12)); // noon avoids DST edge cases
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// WhatsApp (Twilio). Falls back to console logging if not configured.
// ---------------------------------------------------------------------------
let twilioClient = null;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'; // Twilio sandbox default
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  const twilio = (await import('twilio')).default;
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendWhatsApp(toNumber, body) {
  if (!toNumber) return;
  const to = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;
  if (!twilioClient) {
    console.log(`[whatsapp:dev] -> ${to}\n${body}\n`);
    return;
  }
  try {
    await twilioClient.messages.create({ from: TWILIO_FROM, to, body });
    console.log(`[whatsapp] sent to ${to}`);
  } catch (err) {
    console.error(`[whatsapp] failed to ${to}:`, err.message);
  }
}

function notifyBoth(body, { includePartner = true } = {}) {
  sendWhatsApp(db.settings.herNumber, body);
  if (includePartner) sendWhatsApp(db.settings.partnerNumber, body);
}

// ---------------------------------------------------------------------------
// Reminder scheduler
// ---------------------------------------------------------------------------
// Offsets in minutes after the configured pill time.
const OFFSETS = [
  { mins: 0,   her: name => `💊 Hey ${name}! It's pill o'clock. Time to take your pill — your little buddy is cheering for you! 🌼`,
               partner: name => `💊 Reminder sent: it's ${name}'s pill time now.` },
  { mins: 60,  her: name => `⏰ Gentle nudge, ${name} — it's been an hour. Have you taken your pill yet? Tap "I took it" when you do 💚`,
               partner: name => `⏰ ${name} hasn't ticked her pill yet (1h after pill time).` },
  { mins: 360, her: name => `🌙 ${name}, just checking in — your pill is still waiting for you. You've got this! 💛`,
               partner: name => `🌙 Heads up: ${name} still hasn't logged her pill (6h after).` },
  { mins: 600, her: name => `🚨 Last reminder of the day, ${name} — please don't forget your pill! 💊💚`,
               partner: name => `🚨 ${name} still hasn't taken her pill (10h after pill time).` },
];

function parsePillMinutes(pillTime) {
  const [h, m] = pillTime.split(':').map(Number);
  return h * 60 + m;
}

function tick() {
  const { timezone, pillTime, herName } = db.settings;
  const now = nowParts(timezone);
  const base = parsePillMinutes(pillTime);

  for (const offset of OFFSETS) {
    const total = base + offset.mins;
    const fireMinute = total % 1440;
    const doseDate = total >= 1440 ? shiftDate(now.date, -1) : now.date;

    if (now.minutes !== fireMinute) continue;

    // Skip pill-free days
    if (db.pillFree.includes(doseDate)) continue;
    // Skip if already taken
    if (db.doses[doseDate]?.taken) continue;
    // De-dupe: only send each offset once per dose date
    const sent = (db.sentReminders[doseDate] ||= {});
    if (sent[offset.mins]) continue;
    sent[offset.mins] = true;
    saveDb(db);

    sendWhatsApp(db.settings.herNumber, offset.her(herName));
    sendWhatsApp(db.settings.partnerNumber, offset.partner(herName));
    console.log(`[reminder] offset ${offset.mins}m for dose ${doseDate}`);
  }
}

// Run every minute.
cron.schedule('* * * * *', tick);

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
function publicState() {
  const { timezone } = db.settings;
  const today = nowParts(timezone).date;
  return {
    settings: {
      herName: db.settings.herName,
      pillTime: db.settings.pillTime,
      timezone: db.settings.timezone,
      herNumber: db.settings.herNumber,
      partnerNumber: db.settings.partnerNumber,
    },
    today,
    doses: db.doses,
    pillFree: db.pillFree,
  };
}

app.get('/api/state', (req, res) => res.json(publicState()));

app.post('/api/take', (req, res) => {
  const date = req.body?.date || nowParts(db.settings.timezone).date;
  db.doses[date] = { taken: true, takenAt: new Date().toISOString() };
  saveDb(db);
  if (!db.pillFree.includes(date)) {
    notifyBoth(`✅ ${db.settings.herName} just took her pill for ${date}. Nice one! 🎉`);
  }
  res.json(publicState());
});

app.post('/api/untake', (req, res) => {
  const date = req.body?.date || nowParts(db.settings.timezone).date;
  delete db.doses[date];
  if (db.sentReminders[date]) delete db.sentReminders[date]; // allow reminders again
  saveDb(db);
  res.json(publicState());
});

app.post('/api/pill-free', (req, res) => {
  const { date, value } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date required' });
  const has = db.pillFree.includes(date);
  if (value && !has) db.pillFree.push(date);
  if (!value && has) db.pillFree = db.pillFree.filter(d => d !== date);
  saveDb(db);
  res.json(publicState());
});

app.post('/api/settings', (req, res) => {
  const allowed = ['herName', 'pillTime', 'timezone', 'herNumber', 'partnerNumber'];
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) db.settings[key] = req.body[key];
  }
  saveDb(db);
  res.json(publicState());
});

// Optional passcode gate so the link stays private.
app.post('/api/login', (req, res) => {
  const required = process.env.APP_PASSCODE || '';
  if (!required) return res.json({ ok: true });
  res.json({ ok: req.body?.passcode === required });
});
app.get('/api/needs-passcode', (req, res) => {
  res.json({ needsPasscode: !!(process.env.APP_PASSCODE || '') });
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`💊 Pill tracker running on http://localhost:${PORT}`);
  console.log(`   Timezone: ${db.settings.timezone} | Pill time: ${db.settings.pillTime}`);
  console.log(`   WhatsApp: ${twilioClient ? 'Twilio enabled' : 'DEV mode (logging to console)'}`);
});
