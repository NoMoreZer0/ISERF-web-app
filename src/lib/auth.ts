import { NextResponse } from "next/server";

// Shared device-ingest auth: the Raspberry Pi must send the configured secret in
// the `x-api-key` header. Returns a 401 response when the key is missing/invalid,
// or null when the request is authorized.
export function requireDeviceKey(request: Request): NextResponse | null {
  const apiKey = request.headers.get("x-api-key");
  const expected = process.env.DEVICE_API_KEY;
  if (!expected || apiKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
