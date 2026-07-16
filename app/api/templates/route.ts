import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: biz } = await supabase.from("businesses").select("id").eq("owner_id", user.id).single();
  if (!biz) return NextResponse.json({ templates: [] });

  const { data } = await supabase
    .from("quote_templates")
    .select("*")
    .eq("business_id", biz.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: biz } = await supabase.from("businesses").select("id").eq("owner_id", user.id).single();
  if (!biz) return NextResponse.json({ error: "No business found" }, { status: 404 });

  const { name, jobTitle, lineItems, suggestedExclusions } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { data, error } = await supabase.from("quote_templates").insert({
    business_id: biz.id,
    name: name.trim(),
    job_title: jobTitle ?? "",
    line_items: lineItems ?? [],
    suggested_exclusions: suggestedExclusions ?? [],
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
