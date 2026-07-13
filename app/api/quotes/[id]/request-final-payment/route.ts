import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { quoteTotal, depositAmountFor } from "@/lib/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, name, payment_link, bank_name, bank_sort_code, bank_account")
    .eq("owner_id", user.id)
    .single();

  if (!biz) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { data: quoteRow } = await supabase
    .from("quotes")
    .select("*, quote_line_items(*)")
    .eq("id", params.id)
    .eq("business_id", biz.id)
    .single();

  if (!quoteRow) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  // Mark final payment as requested
  await supabase
    .from("quotes")
    .update({
      final_payment_requested: true,
      final_payment_requested_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  // Calculate amounts
  const lineItems = (quoteRow.quote_line_items ?? []).map((li: any) => ({
    id: li.id, category: li.category, desc: li.description, meta: li.meta ?? "", price: li.unit_price,
  }));
  const fakeQuote = { ...quoteRow, lineItems, depositOn: quoteRow.deposit_requested };
  const total = quoteTotal(fakeQuote as any);
  const deposit = depositAmountFor(fakeQuote as any);
  const finalAmount = quoteRow.deposit_requested ? total - deposit : total;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://demandpilot.app";
  const customerEmail = quoteRow.customer_email;

  if (customerEmail) {
    const paymentSection = biz.payment_link
      ? `<a href="${biz.payment_link}" style="display:block;background:#ff6a1f;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin:20px 0">Pay £${finalAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })} →</a>`
      : biz.bank_account
      ? `<div style="background:#f8f6f3;border-radius:12px;padding:16px;margin:16px 0;font-size:13px">
          <strong>Bank transfer details:</strong><br/>
          ${biz.bank_name ? `Bank: ${biz.bank_name}<br/>` : ""}
          ${biz.bank_sort_code ? `Sort code: ${biz.bank_sort_code}<br/>` : ""}
          Account: ${biz.bank_account}
         </div>`
      : `<p style="color:#666;font-size:14px">Please contact ${biz.name} to arrange payment.</p>`;

    await sendEmail({
      to: customerEmail,
      subject: `Final payment due — ${quoteRow.job_title || "Your job"} with ${biz.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 4px;font-size:22px">Final payment due</h2>
          <p style="color:#666;margin:0 0 24px;font-size:14px">
            Your job is complete — thank you for choosing ${biz.name}!
          </p>
          <div style="background:#f8f6f3;border-radius:12px;padding:20px;margin-bottom:16px">
            <div style="font-size:13px;color:#888;margin-bottom:2px">Job</div>
            <div style="font-size:16px;font-weight:600">${quoteRow.job_title || "—"}</div>
            <div style="font-size:13px;color:#888;margin:12px 0 2px">Total quote</div>
            <div style="font-size:15px">£${total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
            ${quoteRow.deposit_requested ? `
            <div style="font-size:13px;color:#888;margin:12px 0 2px">Deposit paid</div>
            <div style="font-size:15px;color:#4ade80">− £${deposit.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
            ` : ""}
            <div style="border-top:1px solid #e5e2de;margin:12px 0 8px"></div>
            <div style="font-size:13px;color:#888;margin-bottom:2px">Balance due</div>
            <div style="font-size:22px;font-weight:700;color:#ff6a1f">£${finalAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
          </div>
          ${paymentSection}
          <a href="${siteUrl}/q/${params.id}" style="display:block;text-align:center;color:#999;font-size:12px;margin-top:12px;text-decoration:none">
            View your full quote →
          </a>
        </div>
      `,
    });
  }

  return NextResponse.json({ ok: true, emailSent: !!customerEmail });
}
