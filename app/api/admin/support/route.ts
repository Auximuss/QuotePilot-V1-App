import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

// PATCH — rename a conversation (updates business_name on all messages for that business)
export async function PATCH(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { businessId, name } = await req.json();
  if (!businessId || !name?.trim()) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("support_messages")
    .update({ business_name: name.trim() })
    .eq("business_id", businessId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — delete all messages for a business (close/remove ticket)
export async function DELETE(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "Missing businessId" }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("support_messages")
    .delete()
    .eq("business_id", businessId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// GET — all support conversations grouped by business
export async function GET() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: messages } = await supabase
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (!messages) return NextResponse.json({ conversations: [] });

  // Group by business_id, latest message first
  const map = new Map<string, any>();
  for (const m of messages) {
    if (!map.has(m.business_id)) {
      map.set(m.business_id, {
        businessId: m.business_id,
        businessName: m.business_name ?? "Unknown",
        userEmail: m.user_email ?? "—",
        lastMessage: m.message,
        lastAt: m.created_at,
        unread: 0,
        messages: [],
      });
    }
    const conv = map.get(m.business_id);
    conv.messages.push(m);
    if (!m.from_admin && !m.read_by_admin) conv.unread++;
  }

  // Sort each conversation's messages ascending
  const conversations = Array.from(map.values()).map((c) => ({
    ...c,
    messages: c.messages.sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  }));

  // Sort conversations by most recent message
  conversations.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

  return NextResponse.json({ conversations });
}
