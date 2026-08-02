import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function getCallerBizId(userId: string): Promise<string | null> {
  const { data } = await createServiceClient()
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .single();
  return data?.id ?? null;
}

async function quoteOwnedBy(quoteId: string, bizId: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("quotes")
    .select("id")
    .eq("id", quoteId)
    .eq("business_id", bizId)
    .single();
  return !!data;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bizId = await getCallerBizId(user.id);
  if (!bizId) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (!await quoteOwnedBy(params.id, bizId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  const bizId = await getCallerBizId(user.id);
  if (!bizId) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (!await quoteOwnedBy(params.id, bizId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bizId = await getCallerBizId(user.id);
  if (!bizId) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (!await quoteOwnedBy(params.id, bizId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { tierId } = await req.json();
  // Scope delete to this quote as an extra guard
  await supabase.from("quote_tiers").delete().eq("id", tierId).eq("quote_id", params.id);
  return NextResponse.json({ deleted: true });
}
