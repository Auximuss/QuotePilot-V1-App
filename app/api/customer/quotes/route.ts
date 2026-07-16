import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from("customer_sessions")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session) return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });

  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, job_title, address, status, total, sent_at, created_at, businesses(name)")
    .eq("customer_email", session.customer_email)
    .order("created_at", { ascending: false });

  return NextResponse.json({ email: session.customer_email, quotes: quotes ?? [] });
}
