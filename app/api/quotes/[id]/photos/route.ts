import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth check
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // Verify the quote belongs to the caller's business
  const { data: callerBiz } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!callerBiz) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { data: quote } = await supabase
    .from("quotes")
    .select("id")
    .eq("id", params.id)
    .eq("business_id", callerBiz.id)
    .single();
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase.storage
    .from("quote-photos")
    .list(params.id, { sortBy: { column: "created_at", order: "asc" } });

  if (error || !data?.length) return NextResponse.json({ photos: [] });

  const photos = data.map((file) => {
    const { data: { publicUrl } } = supabase.storage
      .from("quote-photos")
      .getPublicUrl(`${params.id}/${file.name}`);
    return publicUrl;
  });

  return NextResponse.json({ photos });
}
