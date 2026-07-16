import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export async function DELETE(req: NextRequest) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set in Vercel env vars" }, { status: 500 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const supabase = createServiceClient();
  const errors: string[] = [];

  // 1. Find the business row for this user
  const { data: biz, error: bizErr } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (bizErr) errors.push(`find business: ${bizErr.message}`);

  if (biz) {
    // 2. Delete quote line items first (FK child of quotes)
    const { data: quotes } = await supabase
      .from("quotes")
      .select("id")
      .eq("business_id", biz.id);

    if (quotes?.length) {
      const quoteIds = quotes.map((q) => q.id);
      const { error: liErr } = await supabase.from("quote_line_items").delete().in("quote_id", quoteIds);
      if (liErr) errors.push(`delete line_items: ${liErr.message}`);

      const { error: qErr } = await supabase.from("quotes").delete().in("id", quoteIds);
      if (qErr) errors.push(`delete quotes: ${qErr.message}`);
    }

    // 3. Delete other business-linked data
    const tables = ["quote_requests", "support_messages", "price_book_items"] as const;
    for (const table of tables) {
      const { error: tErr } = await supabase.from(table).delete().eq("business_id", biz.id);
      if (tErr) errors.push(`delete ${table}: ${tErr.message}`);
    }

    // 4. Delete the business row itself (unblocks FK on auth.users)
    const { error: delBizErr } = await supabase.from("businesses").delete().eq("id", biz.id);
    if (delBizErr) errors.push(`delete business: ${delBizErr.message}`);
  }

  // 5. Bail if any cascade step failed — auth delete would fail anyway
  if (errors.length > 0) {
    return NextResponse.json({ error: "Cascade delete failed", details: errors }, { status: 500 });
  }

  // 6. Delete the auth user
  const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
