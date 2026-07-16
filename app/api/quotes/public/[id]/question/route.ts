import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { question } = await request.json();

  if (!question || typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify the quote exists before saving the question
  const { data: quote } = await supabase
    .from("quotes")
    .select("id")
    .eq("id", params.id)
    .single();

  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  // Save to customer_questions table.
  // Run this SQL in Supabase if this table doesn't exist yet:
  //   create table customer_questions (
  //     id uuid primary key default gen_random_uuid(),
  //     quote_id uuid references quotes(id) on delete cascade,
  //     question text not null,
  //     created_at timestamptz default now()
  //   );
  const { error } = await supabase.from("customer_questions").insert({
    quote_id: params.id,
    question: question.trim(),
  });

  if (error) {
    // Don't fail the customer — log it server-side
    console.error("Failed to save customer question:", error);
  }

  return NextResponse.json({ success: true });
}
