# 💊 Pill Buddy

A cute little web app to help your girlfriend remember her daily pill — with a
friendly **blonde, green-eyed mascot**, a **calendar** to mark her pill-free
break days, and **WhatsApp reminders** sent to *both* of you at pill time and
then **+1h, +6h, and +10h** until she ticks it off.

<p align="center">💚 Take it • 🌿 Track break days • 🔔 Get nudged on WhatsApp</p>

---

## What it does

- **Daily check-in** — one big "I took my pill 💊" button. Tick it and the
  reminders stop for the day.
- **Mascot** — a cheerful blonde character with green eyes who encourages her
  and celebrates when she takes it.
- **Calendar** — see her history at a glance (taken / missed) and **tap any day
  to mark it as a pill-free break day** 🌿 (no reminders on those days).
- **Streak counter** — a little motivation 🔥.
- **WhatsApp reminders** — sent to **her and you** at:
  - the pill time
  - +1 hour
  - +6 hours
  - +10 hours

  …and a confirmation to both of you when she ticks it. Nothing is sent on
  break days or once she's taken it.
- **Missed-pill alert (just to you)** — a separate private nudge sent **only to
  your number** if she still hasn't ticked her pill by a time you choose (e.g.
  22:30). Toggle it on/off and set the time in Settings.
- **Cycle / period tracking** — enter her pack start date and pattern (e.g. 21
  active + 7 break) and the app auto-marks her break days 🌿 and shows when her
  **period is expected** 🩸, plus a "day X of 28" status. No reminders go out on
  break days.
- **Installable (PWA)** — she can add it to her home screen so it opens like a
  real app (works offline for the shell, with an "Add to home screen" button on
  Android and via Share → Add to Home Screen on iOS).

---

## Quick start (local)

You need [Node.js 18+](https://nodejs.org).

```bash
cd pill-tracker
npm install
cp .env.example .env      # then edit .env (see below)
npm start
```

Open **http://localhost:3000**.

> Without Twilio credentials the app still works fully — it just prints the
> WhatsApp messages to the terminal instead of sending them (handy for testing).

---

## Setting up real WhatsApp messages (Twilio)

Twilio is the quickest way to send WhatsApp messages.

1. Create a free account at <https://www.twilio.com>.
2. In the console go to **Messaging → Try it out → Send a WhatsApp message**.
3. Activate the **WhatsApp Sandbox**: from each phone (hers and yours) send the
   join code (e.g. `join green-tiger`) to the sandbox number
   **+1 415 523 8886** on WhatsApp. This lets the sandbox message you both.
4. Copy your **Account SID** and **Auth Token** into `.env`:

   ```env
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxx
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   HER_WHATSAPP=+39XXXXXXXXXX
   PARTNER_WHATSAPP=+39XXXXXXXXXX
   ```

5. Restart the app. Done!

> ℹ️ The sandbox is perfect for personal use. For a permanent, branded sender
> (no 24-hour re-join), apply for a WhatsApp Business sender in Twilio — see
> their docs. The app code doesn't change, just `TWILIO_WHATSAPP_FROM`.

---

## Settings

You can set everything from the **⚙️ Settings** screen inside the app (saved on
the server), or pre-fill defaults in `.env`:

| Setting | What it is |
|---|---|
| Her name | Used in the mascot's messages |
| Pill time | When she takes it (e.g. `21:00`) — anchors the reminder schedule |
| Timezone | e.g. `Europe/Rome` (IANA name) |
| Her WhatsApp number | With country code, e.g. `+39…` |
| Your WhatsApp number | With country code |
| Missed-pill alert | On/off + time — private nudge sent only to your number |
| Cycle tracking | On/off + pack start date + active/break day counts |
| `APP_PASSCODE` (.env only) | Optional secret code to open the app |

---

## Deploying so you can share a link

The app is a tiny Node server, so any host that runs Node works.

**Easiest — Render Blueprint (one click-ish):** this repo ships a `render.yaml`
at the root. In [Render](https://render.com): **New + → Blueprint → pick this
repo**. It pre-fills the build/start commands, the persistent disk, and the
env-var slots — you just paste in the secret values (Twilio keys, the two phone
numbers, and `APP_PASSCODE`).

**Manual (any host):** New → Web Service → connect this repo → Root Directory
`pill-tracker`, Build `npm install`, Start `npm start`, then add the `.env`
values as Environment Variables. [Railway](https://railway.app) and
[Fly.io](https://fly.io) work the same way.

After it deploys you'll get a URL (e.g. `https://pill-buddy.onrender.com`) you
can text to your girlfriend. Set an `APP_PASSCODE` so it stays just for you two.

> **Note on data:** the app stores everything in a small `data/db.json` file. On
> hosts with ephemeral disks (like Render's free tier) attach a persistent disk
> and point `DATA_DIR` at it, otherwise data resets on redeploys.

> **Note on reminders:** reminders are sent by a scheduler running inside the
> server, so the server must stay running (use a host that doesn't sleep, or a
> paid "always-on" tier).

### Running it on Render's free tier (and keeping it awake)

The `render.yaml` defaults to the paid **starter** plan because it's always-on
(best for reliable reminders) and because persistent disks require a paid plan.
To run free instead:

1. In `render.yaml` set `plan: free` and delete the `disk:` block and the
   `DATA_DIR` env var (free instances have no persistent disk, so her history
   resets whenever the app redeploys — fine for trying it out).
2. Free instances **sleep after ~15 minutes of inactivity**, which pauses the
   reminder scheduler. Keep it awake with a free external pinger:
   - Create a monitor at [cron-job.org](https://cron-job.org) (or
     [UptimeRobot](https://uptimerobot.com)) that requests
     `https://your-app.onrender.com/api/state` every **10 minutes**.
   - That steady traffic keeps the instance up so reminders fire on time.

> This is a workaround. For something she relies on daily, the always-on starter
> plan (a few dollars/month) is more dependable and keeps her history.

---

## How it's built

- `server.js` — Express API + static file server + a `node-cron` job (runs every
  minute) that sends the WhatsApp reminders via Twilio.
- `public/` — the frontend (vanilla HTML/CSS/JS, mascot is an inline SVG) plus
  the PWA bits: `manifest.webmanifest`, `sw.js` (offline app shell), and `icons/`.
- `scripts/generate-icons.mjs` — regenerates the PNG app icons with zero deps
  (`node scripts/generate-icons.mjs`). Already committed, so you only need this
  if you want to tweak the icon.
- `data/db.json` — created at runtime; stores settings, taken days, and
  pill-free days.

No database or build step required. 💕
