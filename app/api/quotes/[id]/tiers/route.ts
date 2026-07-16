import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("quote_tiers")
    .select("*")
    .eq("quote_id", params.id)
    .order("total", { ascending: true });

  return NextResponse.json({ tiers: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, lineItems } = await req.json();
  const total = (lineItems ?? []).reduce((s: number, l: any) => s + (l.price ?? 0), 0);

  const { data, error } = await supabase
    .from("quote_tiers")
    .insert({ quote_id: params.id, name, line_items: lineItems ?? [], total })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tier: data });
}

export async function DELETE(req: NextRequest, { params: _params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tierId } = await req.json();
  await supabase.from("quote_tiers").delete().eq("id", tierId);
  return NextResponse.json({ deleted: true });
}
