# ISERF Web App

Real-time dashboard for the **Intelligent System for Evaluating Risk Factors
Affecting Public Transport Drivers**. A Raspberry Pi running the detection code
(`../ISERF`) reports drowsiness and abnormal-heart-rate events; this app ingests
them and displays alerts live.

## Architecture

```
Raspberry Pi  --HTTPS POST-->  /api/alerts (Vercel)  --insert-->  Supabase (Postgres)
                                                                       |
Browser dashboard  <------ Supabase Realtime (WebSocket) --------------/
```

Vercel is serverless and cannot host a long-lived WebSocket, so the realtime
connection is **browser ↔ Supabase**. The Pi only makes simple HTTP POSTs, and
every alert is persisted in Postgres for later analysis.

- **Frontend + API:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Database + realtime:** Supabase
- **Device → cloud:** `../ISERF/reporter.py` (Python `requests`)

## Setup

### 1. Supabase
1. Create a project at <https://supabase.com>.
2. Open **SQL Editor → New query**, paste `supabase/schema.sql`, run it.
3. From **Project Settings → API**, copy the Project URL, the `anon` key, and
   the `service_role` key.

### 2. Environment variables
Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # server only
DEVICE_API_KEY=<long random string>  # shared secret with the Pi
```

### 3. Run locally
```bash
npm install
npm run dev      # http://localhost:3000
```

### 4. Deploy to Vercel
1. Push this folder to a Git repo and import it at <https://vercel.com/new>.
2. Add the same four env vars in **Project → Settings → Environment Variables**.
3. Deploy. Your ingest endpoint is `https://<your-app>.vercel.app/api/alerts`.

### 5. Configure the Raspberry Pi
On the Pi, set environment variables (e.g. in `~/.bashrc` or a systemd unit):

```bash
export ISERF_API_URL="https://<your-app>.vercel.app/api/alerts"
export ISERF_API_KEY="<same DEVICE_API_KEY value>"
export ISERF_DEVICE_ID="pi-bus-01"
export ISERF_DRIVER_ID="driver-123"   # optional
```

Then run the detection script as usual — alerts now flow to the dashboard:

```bash
python3 integrated_test.py
```

## Testing the pipeline without the Pi

```bash
curl -X POST http://localhost:3000/api/alerts \
  -H "content-type: application/json" \
  -H "x-api-key: $DEVICE_API_KEY" \
  -d '{"device_id":"pi-bus-01","type":"drowsiness","severity":"critical",
       "ear_value":0.15,"message":"Eyes closed 2.1s"}'
```

The alert should appear on the dashboard instantly.

## API

`POST /api/alerts` — header `x-api-key: <DEVICE_API_KEY>`; JSON body:

| field       | type   | required | notes                                  |
|-------------|--------|----------|----------------------------------------|
| `device_id` | string | yes      | identifies the Pi/vehicle              |
| `type`      | string | yes      | `drowsiness` \| `bpm_abnormal` \| `air_quality` |
| `severity`  | string | no       | `warning` \| `critical` (def. warning) |
| `status`    | string | no       | `active` \| `cleared` (def. active)    |
| `ear_value` | number | no       | Eye Aspect Ratio snapshot              |
| `bpm_value` | number | no       | heart-rate snapshot                    |
| `driver_id` | string | no       | optional driver identifier             |
| `message`   | string | no       | human-readable description             |

### Continuous telemetry

Unlike `/api/alerts` (one row per discrete event), these endpoints **upsert the
latest reading per `device_id`** into the `device_telemetry` table. The Pi can call
them on a fixed cadence (~every 5s) and `updated_at` doubles as a heartbeat for
online/offline detection. All POSTs require `x-api-key: <DEVICE_API_KEY>`. `GET` on
either endpoint is an unauthenticated health check.

`POST /api/bpm` — current heart rate:

| field       | type   | required | notes                          |
|-------------|--------|----------|--------------------------------|
| `device_id` | string | yes      | identifies the Pi/vehicle      |
| `bpm_value` | number | yes      | beats per minute (finite)      |
| `driver_id` | string | no       | optional driver identifier     |

`POST /api/oxygen` — MQ-135 **digital** air quality. The sensor only crosses a
threshold, so the reading is a boolean (`1` = good air, `0` = bad air). Provide
**either** `value` or `air_ok`. A good→bad transition raises an `air_quality` alert
in the feed; bad→good clears it; repeated identical readings don't duplicate alerts.

| field       | type        | required        | notes                              |
|-------------|-------------|-----------------|------------------------------------|
| `device_id` | string      | yes             | identifies the Pi/vehicle          |
| `value`     | `0` \| `1`  | one of these    | raw digital pin: 1 = good, 0 = bad |
| `air_ok`    | boolean     | one of these    | pre-parsed: true = good            |
| `driver_id` | string      | no              | optional driver identifier         |

> **MQ-135 wiring:** the digital output is often **active-low** (reads `0` when gas
> exceeds the trimmer threshold). Confirm your wiring maps to **1 = good, 0 = bad**.

```bash
# heart rate (~every 5s)
curl -X POST http://localhost:3000/api/bpm \
  -H "content-type: application/json" -H "x-api-key: $DEVICE_API_KEY" \
  -d '{"device_id":"pi-bus-01","bpm_value":78}'

# air quality (bad air)
curl -X POST http://localhost:3000/api/oxygen \
  -H "content-type: application/json" -H "x-api-key: $DEVICE_API_KEY" \
  -d '{"device_id":"pi-bus-01","value":0}'
```

Raspberry Pi loop (Python `requests`):

```python
import requests, time

BASE = "https://<your-app>.vercel.app"
HEADERS = {"x-api-key": "<DEVICE_API_KEY>", "Content-Type": "application/json"}
DEVICE_ID = "pi-bus-01"

while True:
    bpm = read_heart_rate()          # your sensor read
    air_good = bool(read_mq135())    # GPIO 1/0 — adjust polarity to your wiring
    try:
        requests.post(f"{BASE}/api/bpm",
                      json={"device_id": DEVICE_ID, "bpm_value": bpm},
                      headers=HEADERS, timeout=5)
        requests.post(f"{BASE}/api/oxygen",
                      json={"device_id": DEVICE_ID, "value": 1 if air_good else 0},
                      headers=HEADERS, timeout=5)
    except requests.RequestException as e:
        print("upload failed:", e)   # keep looping; next tick retries
    time.sleep(5)
```

## Possible next steps

- Live BPM/EAR history charts (Recharts) on top of the `device_telemetry` table.
- Auth (Supabase Auth) so only logged-in supervisors see the dashboard.
- Four-level risk scoring and per-driver baselines (Chapter 4 pipeline).
