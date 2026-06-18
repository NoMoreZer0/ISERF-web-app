import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireDeviceKey } from "@/lib/auth";
import type { OxygenIngestPayload } from "@/lib/types";

// Node.js runtime (service-role key + server-only). Never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/oxygen — called by the Raspberry Pi to report air quality from the
// MQ-135 *digital* pin. The sensor only crosses a threshold, so the reading is a
// boolean: good (1) or bad (0). We upsert the latest state and, on a transition,
// raise/clear an alert in the feed (without spamming one every ~5s).
export async function POST(request: Request) {
  const unauthorized = requireDeviceKey(request);
  if (unauthorized) return unauthorized;

  let body: OxygenIngestPayload;
  try {
    body = (await request.json()) as OxygenIngestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.device_id || typeof body.device_id !== "string") {
    return NextResponse.json({ error: "device_id is required" }, { status: 400 });
  }

  // Normalize the reading to a boolean: prefer explicit `air_ok`, else the raw
  // digital `value` (1 = good air, 0 = bad air).
  let airOk: boolean;
  if (typeof body.air_ok === "boolean") {
    airOk = body.air_ok;
  } else if (body.value === 0 || body.value === 1) {
    airOk = body.value === 1;
  } else {
    return NextResponse.json(
      { error: "provide air_ok (boolean) or value (0|1)" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabase();

  // Read previous state to detect transitions (edge-triggered alerting).
  const { data: prev } = await supabase
    .from("device_telemetry")
    .select("air_ok")
    .eq("device_id", body.device_id)
    .maybeSingle();
  const prevAirOk = prev?.air_ok ?? null;

  const { data, error } = await supabase
    .from("device_telemetry")
    .upsert(
      {
        device_id: body.device_id,
        driver_id: body.driver_id ?? null,
        air_ok: airOk,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Edge detection: only act on a change of state.
  if (prevAirOk !== airOk) {
    if (!airOk) {
      // good/unknown -> bad: raise an active alert.
      await supabase.from("alerts").insert({
        device_id: body.device_id,
        driver_id: body.driver_id ?? null,
        type: "air_quality",
        severity: "warning",
        status: "active",
        message: "Poor air quality detected",
      });
    } else if (prevAirOk === false) {
      // bad -> good: clear it.
      await supabase.from("alerts").insert({
        device_id: body.device_id,
        driver_id: body.driver_id ?? null,
        type: "air_quality",
        severity: "warning",
        status: "cleared",
        message: "Air quality recovered",
      });
    }
  }

  return NextResponse.json({ ok: true, telemetry: data }, { status: 200 });
}

// Simple health check.
export async function GET() {
  return NextResponse.json({ ok: true, service: "iserf-oxygen-ingest" });
}
