import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const ADMIN_EMAILS = ["aux6998@gmail.com", "pryeralex492@gmail.com"];

export async function GET() {
  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data } = await supabase
    .from("agent_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ logs: data ?? [] });
}

export async function DELETE() {
  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await supabase.from("agent_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  return NextResponse.json({ ok: true });
}
