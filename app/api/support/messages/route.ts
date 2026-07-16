import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// GET — fetch messages for the current user's business
export async function GET() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("owner_id", user.id).single();
  if (!biz) return NextResponse.json({ messages: [] });

  const { data: messages } = await supabase
    .from("support_messages")
    .select("*")
    .eq("business_id", biz.id)
    .order("created_at", { ascending: true });

  // Mark admin messages as read by user
  await supabase
    .from("support_messages")
    .update({ read_by_user: true })
    .eq("business_id", biz.id)
    .eq("from_admin", true)
    .eq("read_by_user", false);

  return NextResponse.json({ messages: messages ?? [] });
}

// POST — send a message from the user
export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: biz } = await supabase
    .from("businesses").select("id, name").eq("owner_id", user.id).single();
  if (!biz) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { data, error } = await supabase.from("support_messages").insert({
    business_id: biz.id,
    user_email: user.email,
    business_name: (biz as any).name ?? "",
    message: message.trim(),
    from_admin: false,
    read_by_admin: false,
    read_by_user: true,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}
