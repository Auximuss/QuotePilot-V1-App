import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = "https://mppnrqtfcbapkohsogap.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wcG5ycXRmY2JhcGtvaHNvZ2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzkzMzYsImV4cCI6MjA5ODc1NTMzNn0.QG5fNZyOs03OOyQa03mb067Gg2lAg0EVPD4lDdYyKG0";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component with no request context —
            // safe to ignore if middleware.ts is refreshing the session.
          }
        },
      },
    }
  );
}

const SUPABASE_SERVICE_ROLE_KEY = "sb_secret_5B11OY8W0KD1zzg-Z_W1ng_LZhGwAPm";

// Service-role client — SERVER-SIDE ONLY
export function createServiceClient() {
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
  return createSupabaseClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
