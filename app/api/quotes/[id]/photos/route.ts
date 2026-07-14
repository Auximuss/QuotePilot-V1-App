import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();
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
