import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function GET() {
  const supabase = createServiceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find accepted/complete quotes where final payment hasn't been paid and job was completed > 7 days ago
  const { data: quotes } = await supabase
    .from("quotes")
    .select("*, businesses(name, phone)")
    .eq("final_payment_requested", true)
    .eq("final_payment_paid", false)
    .is("invoice_paid_at", null)
    .lte("sent_at", sevenDaysAgo)
    .not("customer_email", "is", null);

  if (!quotes?.length) return NextResponse.json({ chased: 0 });

  let chased = 0;
  for (const q of quotes) {
    const biz = q.businesses as any;
    const total = q.total ?? 0;
    await sendEmail({
      to: q.customer_email,
      subject: `Payment reminder — ${q.job_title ?? "Your Job"} | ${biz?.name ?? ""}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#ff6a1f">Friendly Payment Reminder</h2>
          <p>Hi ${q.customer_name ?? "there"},</p>
          <p>We just wanted to send a friendly reminder that payment of <strong>£${total.toLocaleString("en-GB")}</strong> is outstanding for:</p>
          <p style="background:#f5f5f5;padding:12px;border-radius:8px"><strong>${q.job_title ?? "Your recent job"}</strong><br>${q.address ?? ""}</p>
          ${q.stripe_payment_link ? `
          <p style="margin:20px 0">
            <a href="${q.stripe_payment_link}" style="background:#ff6a1f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
              Pay Now — £${total.toLocaleString("en-GB")}
            </a>
          </p>` : ""}
          <p>If you have any questions, please don't hesitate to get in touch.</p>
          <p>Thank you,<br><strong>${biz?.name ?? ""}</strong>${biz?.phone ? `<br>${biz.phone}` : ""}</p>
        </div>
      `,
    });
    chased++;
  }

  return NextResponse.json({ chased });
}
