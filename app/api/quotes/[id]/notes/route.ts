import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** Returns the caller's business ID, or null */
async function getCallerBizId(userId: string): Promise<string | null> {
  const { data } = await createServiceClient()
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .single();
  return data?.id ?? null;
}

/** Returns true if the quote belongs to the given business */
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
    .from("job_notes")
    .select("*")
    .eq("quote_id", params.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bizId = await getCallerBizId(user.id);
  if (!bizId) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (!await quoteOwnedBy(params.id, bizId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  const { data, error } = await supabase
    .from("job_notes")
    .insert({ quote_id: params.id, content: content.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bizId = await getCallerBizId(user.id);
  if (!bizId) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (!await quoteOwnedBy(params.id, bizId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { noteId } = await req.json();
  // Scope the delete to this quote as an extra guard
  await supabase.from("job_notes").delete().eq("id", noteId).eq("quote_id", params.id);
  return NextResponse.json({ deleted: true });
}
