import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireDeviceKey } from "@/lib/auth";
import type { BpmIngestPayload } from "@/lib/types";

// Node.js runtime (service-role key + server-only). Never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// POST /api/bpm — called by the Raspberry Pi ~every 5s to report current heart rate.
// Upserts the latest reading into device_telemetry (which also acts as a heartbeat).
export async function POST(request: Request) {
  const unauthorized = requireDeviceKey(request);
  if (unauthorized) return unauthorized;

  let body: BpmIngestPayload;
  try {
    body = (await request.json()) as BpmIngestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.device_id || typeof body.device_id !== "string") {
    return NextResponse.json({ error: "device_id is required" }, { status: 400 });
  }
  if (!isFiniteNumber(body.bpm_value)) {
    return NextResponse.json(
      { error: "bpm_value must be a finite number" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("device_telemetry")
    .upsert(
      {
        device_id: body.device_id,
        driver_id: body.driver_id ?? null,
        bpm_value: body.bpm_value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, telemetry: data }, { status: 200 });
}

// Simple health check.
export async function GET() {
  return NextResponse.json({ ok: true, service: "iserf-bpm-ingest" });
}
