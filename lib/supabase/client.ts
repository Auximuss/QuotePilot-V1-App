import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = "https://mppnrqtfcbapkohsogap.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wcG5ycXRmY2JhcGtvaHNvZ2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzkzMzYsImV4cCI6MjA5ODc1NTMzNn0.QG5fNZyOs03OOyQa03mb067Gg2lAg0EVPD4lDdYyKG0";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
