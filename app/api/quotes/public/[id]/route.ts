import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { Quote } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();

  const { data: quoteRow, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !quoteRow) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const [{ data: lineItems }, { data: business }] = await Promise.all([
    supabase.from("quote_line_items").select("*").eq("quote_id", params.id),
    supabase.from("businesses").select("name, payment_link, bank_name, bank_sort_code, bank_account, deposit_percent, payment_terms, exclusions").eq("id", quoteRow.business_id).single(),
  ]);

  const quote: Quote = {
    id: quoteRow.id,
    job: quoteRow.job_title ?? "",
    customer: quoteRow.customer_name ?? "",
    address: quoteRow.customer_address ?? "",
    notes: quoteRow.notes ?? "",
    lineItems: (lineItems ?? []).map((li: any) => ({
      id: li.id,
      category: li.category,
      desc: li.description,
      meta: li.meta ?? "",
      price: li.unit_price,
    })),
    depositOn: quoteRow.deposit_requested,
    status: quoteRow.status,
    confidence: quoteRow.ai_confidence ?? 0,
    checks: quoteRow.clarifications_needed ?? [],
    createdAt: quoteRow.created_at,
    sentAt: quoteRow.sent_at,
    acceptedAt: quoteRow.accepted_at,
    seenByBuilder: true,
    validDays: quoteRow.valid_days ?? 30,
  };

  return NextResponse.json({
    quote,
    businessName: (business as any)?.name ?? "",
    paymentLink: (business as any)?.payment_link ?? null,
    bankName: (business as any)?.bank_name ?? null,
    bankSortCode: (business as any)?.bank_sort_code ?? null,
    bankAccount: (business as any)?.bank_account ?? null,
    depositPercent: (business as any)?.deposit_percent ?? 25,
    paymentTerms: (business as any)?.payment_terms ?? null,
    exclusions: (business as any)?.exclusions ?? null,
    depositPaid: quoteRow.deposit_paid ?? false,
    finalPaymentRequested: quoteRow.final_payment_requested ?? false,
    finalPaymentPaid: quoteRow.final_payment_paid ?? false,
  });
}
