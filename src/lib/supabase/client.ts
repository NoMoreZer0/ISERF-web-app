"use client";

import { createClient } from "@supabase/supabase-js";

// Browser Supabase client (anon key). Used by the dashboard to read alerts
// and subscribe to realtime changes.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
