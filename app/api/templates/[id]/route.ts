import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ownership check: scope delete to caller's business
  const { data: biz } = await createServiceClient()
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!biz) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { error } = await supabase
    .from("quote_templates")
    .delete()
    .eq("id", params.id)
    .eq("business_id", biz.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
