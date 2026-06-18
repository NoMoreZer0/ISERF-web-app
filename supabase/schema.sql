-- ISERF — Intelligent System for Evaluating Risk Factors
-- Database schema for driver risk alerts.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).

-- ---------------------------------------------------------------------------
-- alerts: one row per discrete risk event raised by a Raspberry Pi device.
-- ---------------------------------------------------------------------------
create table if not exists public.alerts (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,                       -- which Pi / vehicle, e.g. 'pi-bus-01'
  driver_id   text,                                -- optional driver identifier
  type        text not null
                constraint alerts_type_check
                check (type in ('drowsiness', 'bpm_abnormal', 'air_quality')),
  severity    text not null default 'warning'
                check (severity in ('warning', 'critical')),
  status      text not null default 'active'       -- 'active' when raised, 'cleared' when resolved
                check (status in ('active', 'cleared')),
  ear_value   real,                                -- Eye Aspect Ratio snapshot at alert time
  bpm_value   real,                                -- heart rate snapshot at alert time
  message     text,                                -- human-readable description
  created_at  timestamptz not null default now()
);

create index if not exists alerts_created_at_idx on public.alerts (created_at desc);
create index if not exists alerts_device_idx     on public.alerts (device_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes to subscribed dashboards.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.alerts;

-- ---------------------------------------------------------------------------
-- Row-Level Security
--   * Browser (anon key) may READ alerts for the dashboard.
--   * INSERTs come only from the server API route using the service-role key,
--     which bypasses RLS — so no insert policy is granted to anon.
-- ---------------------------------------------------------------------------
alter table public.alerts enable row level security;

drop policy if exists "anon can read alerts" on public.alerts;
create policy "anon can read alerts"
  on public.alerts for select
  to anon
  using (true);

-- ---------------------------------------------------------------------------
-- device_telemetry: latest continuous reading per device (upserted on device_id).
--   * BPM is pushed ~every 5s by the Pi via POST /api/bpm.
--   * air_ok is the MQ-135 *digital* reading via POST /api/oxygen (true=good/1).
--   * updated_at doubles as a device heartbeat for online/offline detection.
-- ---------------------------------------------------------------------------
create table if not exists public.device_telemetry (
  device_id   text primary key,
  driver_id   text,
  bpm_value   real,
  air_ok      boolean,
  updated_at  timestamptz not null default now()
);

-- Realtime: broadcast telemetry upserts to subscribed dashboards.
alter publication supabase_realtime add table public.device_telemetry;

-- Browser (anon key) may READ telemetry; upserts come from the server API route
-- using the service-role key, which bypasses RLS.
alter table public.device_telemetry enable row level security;

drop policy if exists "anon can read telemetry" on public.device_telemetry;
create policy "anon can read telemetry"
  on public.device_telemetry for select
  to anon
  using (true);

-- ---------------------------------------------------------------------------
-- Migration helper (for an existing database created before air_quality /
-- device_telemetry existed). Safe to run repeatedly.
-- ---------------------------------------------------------------------------
-- alter table public.alerts drop constraint if exists alerts_type_check;
-- alter table public.alerts add constraint alerts_type_check
--   check (type in ('drowsiness', 'bpm_abnormal', 'air_quality'));
