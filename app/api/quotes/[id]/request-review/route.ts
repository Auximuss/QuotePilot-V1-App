import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = createServiceClient();

  // Get quote + business info
  const { data: quote } = await supabase
    .from("quotes")
    .select("customer_name, customer_email, job_title, business_id")
    .eq("id", params.id)
    .single();

  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (!quote.customer_email) return NextResponse.json({ sent: false, reason: "no_customer_email" });

  const { data: biz } = await supabase
    .from("businesses")
    .select("name, google_review_link")
    .eq("id", quote.business_id)
    .single();

  const businessName = (biz as any)?.name || "Your tradesperson";
  const reviewLink = (biz as any)?.google_review_link || null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://quote-pilot-v1-app.vercel.app";

  const { sent } = await sendEmail({
    to: quote.customer_email,
    subject: `How did we do? — ${businessName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 4px;font-size:20px">Thanks for choosing us! 🙌</h2>
        <p style="color:#666;margin:0 0 20px;font-size:14px">
          Hi ${quote.customer_name || "there"}, we hope you're happy with the work on <strong>${quote.job_title || "your job"}</strong>.
          We'd really appreciate a quick review — it helps small businesses like ours grow.
        </p>
        ${reviewLink ? `
        <a href="${reviewLink}" style="display:block;background:#ff6a1f;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:16px">
          Leave a Google Review ⭐ →
        </a>` : ""}
        <p style="color:#999;font-size:12px;text-align:center">
          It only takes 2 minutes and means a lot. Thank you from everyone at ${businessName}!
        </p>
      </div>
    `,
  });

  return NextResponse.json({ sent });
}
