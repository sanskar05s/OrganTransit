# 🏥 OrganTransit

Real-time Smart IoT monitoring for organ transport — temperature, motion, tilt, GPS, and container tampering — with role-based dashboards for doctors and patient families, and an AI assistant that reasons over the live sensor data instead of a static readout.
2da4885 ( OrganTransit v2.5 - Added Map,Csv download ,Theme selection and chart)

This is the current, running architecture. It replaces an earlier vanilla HTML/CSS/JS + Flask version; see [Notes on this repo's docs](#notes-on-this-repos-docs) at the bottom if you're comparing against older documentation.

---

## Overview

An ESP32 fitted with a DHT22, MPU6050, NEO-6M GPS, and an LDR reports transport conditions to Blynk every few seconds, unchanged from the original build. From there, a FastAPI backend polls Blynk server-side, evaluates alert thresholds, and writes everything into Supabase. A React dashboard reads that data in real time, gated by Supabase Auth and Postgres row-level security — so "doctor" and "patient family" are enforced by the database, not by which buttons the UI happens to hide.

## Architecture

```
ESP32 + Sensors (DHT22, MPU6050, NEO-6M GPS, LDR)
        |  WiFi
        v
   Blynk Cloud                    <- unchanged from the original build
        |  polled server-side; the auth token never reaches a browser
        v
+------------------------+
|    FastAPI Backend      |----> Gemini API   (called server-side only)
|  poller · AI proxy      |
|  auth check · control   |
+------------+-------------+
             | writes sensor_readings + alerts
             v
+------------------------+
|        Supabase          |   Postgres · Auth · Realtime · Row-Level Security
+------------+-------------+
             | realtime reads, gated by auth + RLS
             v
+------------------------+
|     React Frontend       |   Doctor view · Patient-family view
+------------------------+
```

**Hardware → Blynk** is unchanged. **Blynk → FastAPI** is new: the backend polls instead of the browser, so the Blynk token stays server-side. **FastAPI → Supabase** is new: every reading and alert gets a permanent row instead of living in a capped in-memory array. **Supabase → React** uses Supabase Realtime, so the dashboard updates without polling anything itself.

---

## Features

**Live now**

- Email/password auth via Supabase; the doctor role is gated behind an invite code, not a radio button
- Row-level security — a patient-family account cannot write to a control endpoint no matter what the frontend renders
- Real-time sensor cards (temperature, humidity, 3-axis acceleration, tilt, GPS) via Supabase Realtime
- Server-side Blynk polling — no device token ever reaches a browser
- Alert detection (temperature, acceleration, tilt, box tamper) evaluated server-side, persisted, and auto-resolved when conditions clear
- Doctor controls: temperature mode, system on/off, Blynk token entry — all enforced server-side, not just hidden in the UI
- AI chat grounded in the latest database reading, not whatever text the browser happens to send
- Full sensor and alert history, permanently stored
  <<<<<<< HEAD

**Not yet built**

- Temperature/humidity chart and the GPS map with route/ETA/distance tracking
- CSV export
- Frontend for the AI status panel and per-alert "Explain" button (the backend routes exist; nothing calls them yet)
- Map indicator switching (blue dot / ambulance)
- A "join with a share code" screen for family members (the `join_transport` function exists; no form calls it)
- # Light theme and the rest of the original visual polish
- Temperature/humidity chart (last 20 readings, same rolling window as the original)
- Live GPS map with blue-dot / ambulance indicator switching and fullscreen
- CSV export, sourced from Supabase instead of an in-memory array, with a per-row alert flag recomputed from that row's own values
- Light / dark theme toggle

**Not yet built**

- Route planning and ETA/distance tracking (search a start/destination, click-to-set on the map, live progress along the route) — the biggest remaining piece, deliberately not rushed into this pass
- Frontend for the AI status panel and per-alert "Explain" button (the backend routes exist; nothing calls them yet)
- A "join with a share code" screen for family members (the `join_transport` function exists; no form calls it)
  > > > > > > > 2da4885 ( OrganTransit v2.5 - Added Map,Csv download ,Theme selection and chart)
- Multi-doctor or hospital-level accounts

---

## Tech stack

| Layer           | Technology                                                       |
| --------------- | ---------------------------------------------------------------- |
| Hardware        | ESP32 DevKit V1, DHT22, MPU6050, NEO-6M GPS, LDR                 |
| Device cloud    | Blynk IoT                                                        |
| Backend         | FastAPI (Python), httpx, supabase-py                             |
| Database & auth | Supabase — Postgres, Auth, Realtime, Row-Level Security          |
| Frontend        | React 18 (Vite), react-router-dom                                |
| AI              | Google Gemini (`gemini-2.5-flash`), called only from the backend |

---

## Security model

The rewrite exists mainly for this section:

- **Secrets never reach the browser.** The Blynk token and any other per-transport secret live in `transport_secrets`, a table with zero policies granted to any browser-facing role — only the backend's service-role key can read it.
- **Roles are enforced by the database, not the UI.** Supabase Auth issues a JWT; the backend verifies it on every request; Postgres row-level security decides what each role can see or write. Hiding a button client-side stopped being the security boundary.
- **The doctor role is gated.** New accounts always start as `patient_family`; becoming a doctor requires a one-time invite code redeemed through a database function, not a self-selected radio button at signup.
- **The AI can't be fed fake data.** Prompts are built from the actual latest row in `sensor_readings` and open rows in `alerts`, looked up server-side — not from a string the client supplies.
- **AI output is rendered as text, not HTML.** React interpolates model replies as plain text; nothing uses `dangerouslySetInnerHTML`, which is what made the old dashboard's "Explain" feature XSS-able.

## Hardware

| Component     | Purpose                         | ESP32 Pin                    |
| ------------- | ------------------------------- | ---------------------------- |
| DHT22         | Temperature & humidity          | GPIO 4                       |
| MPU6050       | Acceleration & tilt (I2C)       | GPIO 21 (SDA), GPIO 22 (SCL) |
| NEO-6M        | GPS location (UART2)            | GPIO 16 (RX), GPIO 17 (TX)   |
| LDR           | Box tamper / lid-open detection | GPIO 34 (ADC1)               |
| Active buzzer | Local audio alert               | GPIO 25                      |
| LED           | Local visual alert              | GPIO 2 (onboard)             |

Wiring, the LDR voltage-divider circuit, and full setup are unchanged from before — see the header comments in `organ_transport_esp32.ino` and your existing Blynk console configuration. The Blynk datastreams (V0–V10) are unchanged too:

| Pin   | Data        | Pin | Data                                  |
| ----- | ----------- | --- | ------------------------------------- |
| V0    | Temperature | V6  | Longitude                             |
| V1    | Humidity    | V7  | LDR value                             |
| V2–V4 | Accel X/Y/Z | V8  | System on/off (dashboard → device)    |
| V5    | Latitude    | V9  | Temperature mode (dashboard → device) |
|       |             | V10 | Tilt angle                            |

## Temperature modes

| Mode         | Range       | Used for                                       |
| ------------ | ----------- | ---------------------------------------------- |
| Cold Storage | 2°C – 8°C   | Kidneys, liver — standard cold-chain transport |
| Perfusion    | 20°C – 37°C | Heart, lungs — machine perfusion               |
| Demo         | 25°C – 30°C | Testing and presentations                      |

## Alert thresholds

| Alert        | Condition                                      |
| ------------ | ---------------------------------------------- |
| Temperature  | Outside the active mode's range                |
| Acceleration | Magnitude > 1.5g                               |
| Tilt angle   | > 45°                                          |
| Box tamper   | LDR reading < 2000 (light detected → lid open) |

---

## Getting started

Full walkthrough — Supabase project setup, seeding the first invite code, both `.env` files, troubleshooting — is in **`SETUP_GUIDE.md`**. Short version once Supabase is set up:

```bash
# backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in Supabase + Gemini values
uvicorn main:app --reload --port 8000

# frontend, in a second terminal
cd frontend
npm install
cp .env.example .env   # fill in Supabase URL + anon key
npm run dev
```

## Project structure

```
<<<<<<< HEAD
organ-transport-monitor/
=======
OrganTransit/
>>>>>>> 2da4885 ( OrganTransit v2.5 - Added Map,Csv download ,Theme selection and chart)
├── README.md
├── SETUP_GUIDE.md
├── supabase/
│   └── schema.sql              # tables, RLS policies, auth functions
├── backend/
│   ├── main.py                 # FastAPI app, CORS, router wiring
│   ├── config.py                # env var settings
│   ├── supabase_client.py       # service-role Supabase client
│   ├── deps.py                  # JWT verification, doctor-ownership check
│   ├── blynk.py                 # async Blynk REST helpers
│   ├── poller.py                # background poll → write → alert loop
│   ├── ai.py                    # /chat /status /explain-alert (Gemini proxy)
│   ├── control.py               # mode / system / secrets endpoints
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── pages/                # Login, Signup, Dashboard
<<<<<<< HEAD
    │   ├── components/           # SensorCards, AlertBanner, AIChatWidget, ...
=======
    │   ├── components/           # SensorCards, SensorChart, TransportMap,
    │   │                         # AlertBanner, AIChatWidget, ProtectedRoute
>>>>>>> 2da4885 ( OrganTransit v2.5 - Added Map,Csv download ,Theme selection and chart)
    │   ├── context/               # AuthContext
    │   ├── supabaseClient.js
    │   └── api.js                 # calls to the FastAPI backend
    └── package.json
```

## Roadmap

<<<<<<< HEAD
Near-term, building on what already exists: the chart and map (both backend routes are ready, it's frontend work), CSV export, and the family share-code screen.
=======
Near-term: route planning and ETA (search, click-to-set, live progress), wiring the frontend up to the already-live `/status` and `/explain-alert` routes, and the family share-code screen.

> > > > > > > 2da4885 ( OrganTransit v2.5 - Added Map,Csv download ,Theme selection and chart)

Further out: trend-based alerts instead of pure thresholds, SMS/email notifications off the same server-side alert events, multi-doctor and hospital-level accounts, and eventually dropping Blynk in favor of the ESP32 talking to FastAPI directly.

---

## Notes on this repo's docs

If `PROJECT_EXPLANATION.md` is still around from the earlier version, it describes the _old_ architecture in detail — Blynk polled straight from the browser, `localStorage` for auth and secrets, Flask instead of FastAPI. It hasn't been updated to match what's actually running now and shouldn't be relied on for anything beyond the hardware sections, which are still accurate.
