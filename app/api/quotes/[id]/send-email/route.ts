import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/*
  Sends a quote link to the customer via email using Resend.
  Add RESEND_API_KEY to your .env.local to enable real sending.
  Sign up free at https://resend.com — 3,000 emails/month free.

  Also set RESEND_FROM_EMAIL to your verified sender address,
  e.g. quotes@yourdomain.com
*/

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = createServiceClient();

  // Fetch quote
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .single();

  console.log("[send-email] quote id:", id, "| found:", !!quote, "| error:", quoteError?.message);

  if (!quote) return NextResponse.json({ error: `Quote not found (db: ${quoteError?.message ?? "no row"})` }, { status: 404 });

  // Fetch business + line items in parallel
  const [{ data: biz }, { data: lineItems }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", quote.business_id).single(),
    supabase.from("quote_line_items").select("unit_price").eq("quote_id", id),
  ]);

  // Compute total from line items (quote.total column is not always up-to-date)
  const computedTotal = (lineItems ?? []).reduce((sum: number, li: any) => sum + (li.unit_price || 0), 0);

  const { customerEmail } = await req.json().catch(() => ({ customerEmail: null }));
  const email = customerEmail || quote.customer_email;
  if (!email) return NextResponse.json({ error: "No customer email on this quote" }, { status: 400 });

  const quoteUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://yourapp.com"}/q/${id}`;
  const businessName = (biz as any)?.name || "Your builder";
  const totalDisplay = computedTotal.toLocaleString("en-GB", { minimumFractionDigits: 2 });

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px;font-size:20px">${businessName}</h2>
      <p style="color:#666;margin:0 0 24px;font-size:14px">Quote for: ${quote.job_title || "your job"}</p>
      <div style="background:#f8f6f3;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
        <div style="font-size:13px;color:#888;margin-bottom:4px">Quote total</div>
        <div style="font-size:32px;font-weight:700;color:#ff6a1f">
          £${totalDisplay}
        </div>
      </div>
      <a href="${quoteUrl}" style="display:block;background:#ff6a1f;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:24px">
        View &amp; Accept Quote →
      </a>
      <p style="color:#999;font-size:12px;text-align:center">
        If you have questions, reply to this email or use the "Ask a question" button on the quote page.
      </p>
    </div>
  `;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await supabase.from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ sent: false, reason: "no_api_key", quoteUrl });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "quotes@demandpilot.app",
      to: [email],
      subject: `Quote from ${businessName}: £${totalDisplay} for ${quote.job_title || "your job"}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  // Mark as sent
  await supabase.from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ sent: true });
}
