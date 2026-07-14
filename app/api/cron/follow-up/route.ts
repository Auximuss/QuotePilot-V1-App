import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

/*
  Vercel Cron — runs daily at 10am.
  Emails customers whose quote has been sitting "sent" for 3 days with no response.
  Uses a 3–4 day sent_at window so each quote is only caught once (no extra DB column needed).
*/

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();

  // Window: sent 3–4 days ago
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const fourDaysAgo  = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, job_title, customer_name, customer_email, sent_at, business_id")
    .eq("status", "sent")
    .not("customer_email", "is", null)
    .gte("sent_at", fourDaysAgo.toISOString())
    .lte("sent_at", threeDaysAgo.toISOString());

  if (!quotes?.length) return NextResponse.json({ chased: 0 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://quote-pilot-v1-app.vercel.app";
  let chased = 0;

  for (const q of quotes) {
    // Get business name
    const { data: biz } = await supabase
      .from("businesses")
      .select("name")
      .eq("id", q.business_id)
      .single();

    const businessName = (biz as any)?.name || "Your tradesperson";

    const { sent } = await sendEmail({
      to: q.customer_email,
      subject: `Following up on your quote from ${businessName}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 4px;font-size:20px">Just following up 👋</h2>
          <p style="color:#666;margin:0 0 20px;font-size:14px">
            Hi ${q.customer_name || "there"}, <strong>${businessName}</strong> sent you a quote a few days ago and wanted to check in.
          </p>
          <div style="background:#f8f6f3;border-radius:12px;padding:20px;margin-bottom:24px">
            <div style="font-size:13px;color:#888;margin-bottom:4px">Job</div>
            <div style="font-size:16px;font-weight:600">${q.job_title || "—"}</div>
          </div>
          <a href="${siteUrl}/q/${q.id}" style="display:block;background:#ff6a1f;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:16px">
            View Your Quote →
          </a>
          <p style="color:#999;font-size:12px;text-align:center">
            Any questions? Just reply to this email — ${businessName} will get back to you.
          </p>
        </div>
      `,
    });

    if (sent) chased++;
  }

  return NextResponse.json({ chased, checked: quotes.length });
}
