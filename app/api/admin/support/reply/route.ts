import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

// POST — admin sends a reply to a user's conversation
export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { businessId, message } = await req.json();
  if (!businessId || !message?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get business info for the message record
  const { data: biz } = await supabase
    .from("businesses").select("name, owner_id").eq("id", businessId).single();

  // Get user email for the thread
  let userEmail = "—";
  if (biz?.owner_id) {
    const { data: authUser } = await supabase.auth.admin.getUserById(biz.owner_id);
    userEmail = authUser?.user?.email ?? "—";
  }

  // Mark unread user messages as read by admin
  await supabase
    .from("support_messages")
    .update({ read_by_admin: true })
    .eq("business_id", businessId)
    .eq("from_admin", false);

  const { data, error } = await supabase.from("support_messages").insert({
    business_id: businessId,
    user_email: userEmail,
    business_name: (biz as any)?.name ?? "",
    message: message.trim(),
    from_admin: true,
    read_by_admin: true,
    read_by_user: false,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}
