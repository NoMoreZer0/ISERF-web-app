"use client";

import { createClient } from "@supabase/supabase-js";

// Browser Supabase client (anon key). Used by the dashboard to read alerts
// and subscribe to realtime changes.
//
// NEXT_PUBLIC_* vars are inlined at build time. If they are missing we fall back
// to harmless placeholders so the production build does not crash during
// prerendering; the dashboard will simply show "Disconnected" and log a clear
// warning telling you to set the env vars in Vercel.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
) {
  // Runs in the browser; surfaces the misconfiguration without breaking build.
  console.error(
    "[ISERF] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not " +
      "set. Add them in Vercel → Settings → Environment Variables and redeploy."
  );
}

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
