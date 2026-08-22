# Organ Transport Monitor — Setup Guide

## What's in this folder

Three parts that work together, and you'll set them up in this order because each one depends on the one before it:

- **`supabase/`** — one SQL file that creates your database, tables, and access rules
- **`backend/`** — a FastAPI server that talks to Blynk, Supabase, and Gemini
- **`frontend/`** — the React dashboard people actually look at

## Before you start

You'll need:

- **Node.js 18 or newer** — check with `node -v` in a terminal. If that fails, install from nodejs.org.
- **Python 3.10 or newer** — check with `python3 --version` (Windows: `python --version`).
- A free **Supabase** account — supabase.com
- A **Gemini API key** from Google AI Studio (aistudio.google.com) — reuse the one from before, as long as you rotated it after it got pasted into a chat earlier. If you never rotated it, do that first.
- Your existing **Blynk auth token** — nothing about the ESP32 hardware or firmware changes for any of this.

---

## Step 1 — Extract the zip

Unzip `organ-transport-monitor.zip` wherever you keep projects.

- **Mac**: double-click it, or `unzip organ-transport-monitor.zip` in a terminal
- **Windows**: right-click → "Extract All"
- **Linux**: `unzip organ-transport-monitor.zip`

You should end up with:

```
organ-transport-monitor/
├── .gitignore
├── SETUP_GUIDE.md      <- this file
├── supabase/
│   └── schema.sql
├── backend/
│   └── (Python files)
└── frontend/
    └── (React files)
```

Open the extracted `organ-transport-monitor` folder in your code editor (VS Code or similar) — every command below is run from inside it.

---

## Step 2 — Set up Supabase

**Create the project**
1. Go to supabase.com → sign in → **New project**.
2. Pick a name, a database password (save it somewhere safe), and a region near you.
3. Wait a minute or two for it to finish setting up.

**Run the schema**
1. In the left sidebar, open **SQL Editor**.
2. Open `supabase/schema.sql` from the extracted folder, copy the whole file, paste it into the SQL editor.
3. Click **Run**. You should see "Success. No rows returned."

**Seed the first invite code**

The schema locks the "doctor" role behind an invite code, and nobody has one yet — you create the first by hand. Still in the SQL editor:

```sql
insert into doctor_invite_codes (code) values ('my-first-code');
```

(Use any string you like instead of `my-first-code` — you'll type it in when you sign up.)

**Grab your keys**

Go to **Settings → API**. You need three values for later steps:

| Value | Goes in |
|---|---|
| Project URL | both backend and frontend |
| `anon` / `public` key | **frontend only** |
| `service_role` key | **backend only** — never put this in frontend code, it bypasses every access rule |

**Optional, for easier testing:** Authentication → Providers → Email → turn off "Confirm email." With it on, Supabase emails a confirmation link before an account can log in. Turn it back on before this is anything but a personal test.

---

## Step 3 — Set up the backend

In a terminal, inside the `backend` folder:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Copy the environment template:

```bash
cp .env.example .env             # Windows: copy .env.example .env
```

Open `.env` and fill in the four values:

```
SUPABASE_URL=<your Project URL>
SUPABASE_SERVICE_ROLE_KEY=<your service_role key>
GEMINI_API_KEY=<your Gemini key>
ALLOWED_ORIGINS=http://localhost:5173
```

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

Check it's alive by opening `http://localhost:8000/health` in a browser — you should see `{"status":"healthy"}`. **Leave this terminal running.**

---

## Step 4 — Set up the frontend

Open a **second terminal** (keep the backend running in the first) inside the `frontend` folder:

```bash
cd frontend
npm install
cp .env.example .env             # Windows: copy .env.example .env
```

Open `.env` and fill in:

```
VITE_SUPABASE_URL=<your Project URL>
VITE_SUPABASE_ANON_KEY=<your anon key — NOT service_role>
VITE_API_BASE=http://localhost:8000
```

Start it:

```bash
npm run dev
```

It'll print a local address, normally `http://localhost:5173`. Open that in a browser.

---

## Step 5 — First run

1. Click **Sign up**. Fill in your name, email, password, and the invite code from Step 2 (`my-first-code`). You're now a doctor.
2. On the dashboard, click **Start a new transport**.
3. Paste your Blynk auth token into the field and save it.
4. If your ESP32 is powered on and reporting to that Blynk token, sensor cards should start filling in within a few seconds — the backend polls Blynk every 3 seconds in the background and writes into Supabase.
5. Try the chat box at the bottom of the dashboard — it answers using whatever the latest reading in the database actually is, not whatever the browser claims.

No hardware handy? The cards just stay at `--`, since there's nothing for the poller to fetch — that's expected, not a bug. Auth, roles, and the AI chat (replying "no sensor data yet") still work without it.

---

## Step 6 — If something doesn't work

**CORS error in the browser console / frontend can't reach the backend**
`ALLOWED_ORIGINS` in `backend/.env` has to exactly match the URL the frontend is actually running on. If Vite printed a different port than 5173, update it there and restart the backend.

**Backend crashes on startup with a message about a missing key**
It wasn't started from inside the `backend` folder, or `.env` wasn't saved. `python-dotenv` only looks in the current directory.

**401 Unauthorized on every request**
The two Supabase keys are probably swapped — `anon` goes in the frontend, `service_role` goes in the backend. Swapped, the frontend can't hold a session and the backend can't verify one.

**Invite code fails**
Codes are single-use. Seed another one the same way as Step 2 if you need a second doctor account.

**No sensor data ever appears, even with hardware running**
Check the backend terminal for `[poller]` log lines — errors there usually mean the Blynk token was mistyped, or the ESP32 isn't currently connected to Blynk.

---

## What's built, and what isn't yet

**Working end to end:** sign-up/login with real roles, row-level security instead of hidden buttons, the Blynk token living server-side instead of in the browser, live sensor cards, alerts, doctor controls (mode / system / Blynk token), and the AI chat reading real data from the database.

**Not built yet:** the temperature/humidity chart, the GPS map, CSV export, a family-member "join with a share code" screen, and the visual polish (light theme, gauges, responsive layout) carried over from the original dashboard. All of them slot into the existing structure — just ask.
