import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export async function DELETE(req: NextRequest) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const supabase = createServiceClient();

  // Delete in order: quotes data → business → auth user
  // Get business id first
  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .single();

  if (biz) {
    // Delete quotes and related data
    const { data: quotes } = await supabase
      .from("quotes")
      .select("id")
      .eq("business_id", biz.id);

    if (quotes?.length) {
      const quoteIds = quotes.map((q) => q.id);
      await supabase.from("quote_line_items").delete().in("quote_id", quoteIds);
      await supabase.from("quotes").delete().in("id", quoteIds);
    }

    await supabase.from("quote_requests").delete().eq("business_id", biz.id);
    await supabase.from("support_messages").delete().eq("business_id", biz.id);
    await supabase.from("price_book_items").delete().eq("business_id", biz.id);
    await supabase.from("businesses").delete().eq("id", biz.id);
  }

  // Delete the auth user
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
