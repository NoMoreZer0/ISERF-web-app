import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AlertIngestPayload, AlertType, AlertSeverity } from "@/lib/types";

// This route runs on the Node.js runtime (service-role key + server-only).
export const runtime = "nodejs";
// Never cache ingest responses.
export const dynamic = "force-dynamic";

const VALID_TYPES: AlertType[] = ["drowsiness", "bpm_abnormal"];
const VALID_SEVERITIES: AlertSeverity[] = ["warning", "critical"];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// POST /api/alerts — called by the Raspberry Pi to report a risk event.
export async function POST(request: Request) {
  // --- Auth: shared secret in the x-api-key header ---
  const apiKey = request.headers.get("x-api-key");
  const expected = process.env.DEVICE_API_KEY;
  if (!expected || apiKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse + validate body ---
  let body: AlertIngestPayload;
  try {
    body = (await request.json()) as AlertIngestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.device_id || typeof body.device_id !== "string") {
    return NextResponse.json({ error: "device_id is required" }, { status: 400 });
  }
  if (!VALID_TYPES.includes(body.type)) {
    return NextResponse.json(
      { error: `type must be one of ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const severity: AlertSeverity = VALID_SEVERITIES.includes(
    body.severity as AlertSeverity
  )
    ? (body.severity as AlertSeverity)
    : "warning";

  const row = {
    device_id: body.device_id,
    driver_id: body.driver_id ?? null,
    type: body.type,
    severity,
    status: body.status === "cleared" ? "cleared" : "active",
    ear_value: isFiniteNumber(body.ear_value) ? body.ear_value : null,
    bpm_value: isFiniteNumber(body.bpm_value) ? body.bpm_value : null,
    message: typeof body.message === "string" ? body.message : null,
  };

  // --- Insert (triggers Supabase realtime broadcast to dashboards) ---
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("alerts")
    .insert(row)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alert: data }, { status: 201 });
}

// Simple health check.
export async function GET() {
  return NextResponse.json({ ok: true, service: "iserf-alerts-ingest" });
}
