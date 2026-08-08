import { NextRequest, NextResponse } from "next/server";

const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://mppnrqtfcbapkohsogap.supabase.co";
const SUPA_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wcG5ycXRmY2JhcGtvaHNvZ2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzkzMzYsImV4cCI6MjA5ODc1NTMzNn0.QG5fNZyOs03OOyQa03mb067Gg2lAg0EVPD4lDdYyKG0";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
    }

    // This runs server-side (Vercel → Supabase), never returns HTML
    const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({ email, password }),
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Auth service error. Please try again." },
        { status: 502 }
      );
    }

    if (!res.ok) {
      const msg: string = data?.error_description || data?.msg || data?.error || "";
      const friendly =
        msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("credentials") ||
        msg.toLowerCase().includes("password")
          ? "Incorrect email or password."
          : msg || "Login failed. Please try again.";
      return NextResponse.json({ error: friendly }, { status: res.status });
    }

    // Return the session to the browser so it can store it
    return NextResponse.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in ?? 3600,
      token_type: data.token_type ?? "bearer",
      user: data.user,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}
