import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

/*
  Vercel Cron — runs once a day at 9am.
  Finds quotes that expire in the next 24 hours (status = "sent")
  and emails the customer a friendly reminder.
*/

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find sent quotes expiring within 24 hours that haven't had a reminder sent
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, job_title, customer_name, customer_email, valid_days, created_at, business_id")
    .eq("status", "sent")
    .eq("expiry_reminder_sent", false)
    .not("customer_email", "is", null);

  if (!quotes?.length) return NextResponse.json({ reminded: 0 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://demandpilot.app";
  let reminded = 0;

  for (const q of quotes) {
    // Calculate expiry date
    const validDays = q.valid_days ?? 30;
    const expiryDate = new Date(new Date(q.created_at).getTime() + validDays * 24 * 60 * 60 * 1000);

    // Skip if not expiring in the next 24 hours
    if (expiryDate < now || expiryDate > in24h) continue;

    // Get business name
    const { data: biz } = await supabase
      .from("businesses")
      .select("name")
      .eq("id", q.business_id)
      .single();

    const businessName = (biz as any)?.name || "Your builder";
    const formattedExpiry = expiryDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

    const { sent } = await sendEmail({
      to: q.customer_email,
      subject: `⏰ Your quote from ${businessName} expires tomorrow`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 4px;font-size:20px">Your quote expires tomorrow</h2>
          <p style="color:#666;margin:0 0 24px;font-size:14px">
            Just a reminder that your quote from <strong>${businessName}</strong> expires on <strong>${formattedExpiry}</strong>.
          </p>
          <div style="background:#f8f6f3;border-radius:12px;padding:20px;margin-bottom:24px">
            <div style="font-size:13px;color:#888;margin-bottom:2px">Job</div>
            <div style="font-size:16px;font-weight:600">${q.job_title || "—"}</div>
          </div>
          <a href="${siteUrl}/q/${q.id}" style="display:block;background:#ff6a1f;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:16px">
            View &amp; Accept Quote →
          </a>
          <p style="color:#999;font-size:12px;text-align:center">
            After this date the quote may no longer be valid. Contact ${businessName} if you need more time.
          </p>
        </div>
      `,
    });

    if (sent) {
      // Mark reminder as sent so we don't send it again
      await supabase
        .from("quotes")
        .update({ expiry_reminder_sent: true })
        .eq("id", q.id);
      reminded++;
    }
  }

  return NextResponse.json({ reminded });
}
