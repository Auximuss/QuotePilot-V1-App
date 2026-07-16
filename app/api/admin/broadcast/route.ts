import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

// POST — send a support message to all businesses at once
export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const supabase = createServiceClient();

  // Get all business IDs
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, owner_id");

  if (!businesses?.length) return NextResponse.json({ sent: 0 });

  // Get user emails
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailMap: Record<string, string> = {};
  for (const u of authData?.users ?? []) emailMap[u.id] = u.email ?? "";

  // Insert a message for each business
  const rows = businesses.map((b: any) => ({
    business_id: b.id,
    user_email: emailMap[b.owner_id] ?? "",
    business_name: b.name ?? "",
    message: message.trim(),
    from_admin: true,
    read_by_admin: true,
    read_by_user: false,
  }));

  const { error } = await supabase.from("support_messages").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sent: rows.length });
}
