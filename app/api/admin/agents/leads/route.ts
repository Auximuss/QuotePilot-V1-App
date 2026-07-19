import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const ADMIN_EMAILS = ["aux6998@gmail.com", "pryeralex492@gmail.com"];

export async function GET() {
  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data } = await supabase
    .from("outreach_leads")
    .select("*")
    .order("created_at", { ascending: false });

  return NextResponse.json({ leads: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { business_name, trade, email, location, phone } = body;

  const { data, error } = await supabase
    .from("outreach_leads")
    .insert({ business_name, trade, email, location, phone, source: "manual", status: "new" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "No id" }, { status: 400 });

  await supabase.from("outreach_leads").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
