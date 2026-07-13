import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("quotes")
    .update({ status: "declined" })
    .eq("id", params.id)
    .eq("status", "sent");

  if (error) {
    console.error("Failed to decline quote:", error);
    return NextResponse.json({ error: "Failed to decline quote" }, { status: 500 });
  }

  // ── Fire-and-forget notification email to tradesperson ─────────────────────
  try {
    const { data: quote } = await supabase
      .from("quotes")
      .select("job_title, customer_name, business_id")
      .eq("id", params.id)
      .single();

    if (quote) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("name, owner_id")
        .eq("id", quote.business_id)
        .single();

      if (biz?.owner_id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(biz.owner_id);
        const ownerEmail = authUser?.user?.email;
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://demandpilot.app";

        if (ownerEmail) {
          await sendEmail({
            to: ownerEmail,
            subject: `Quote declined — ${quote.customer_name || "A customer"} passed on ${quote.job_title || "the job"}`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
                <h2 style="margin:0 0 4px;font-size:22px">Quote declined</h2>
                <p style="color:#666;margin:0 0 24px;font-size:14px">Unfortunately this one didn't go ahead.</p>
                <div style="background:#f8f6f3;border-radius:12px;padding:20px;margin-bottom:24px">
                  <div style="font-size:13px;color:#888;margin-bottom:2px">Customer</div>
                  <div style="font-size:16px;font-weight:600">${quote.customer_name || "—"}</div>
                  <div style="font-size:13px;color:#888;margin:12px 0 2px">Job</div>
                  <div style="font-size:16px;font-weight:600">${quote.job_title || "—"}</div>
                </div>
                <a href="${siteUrl}/quote/send?id=${params.id}" style="display:block;background:#221d14;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:16px">
                  View quote →
                </a>
                <p style="color:#999;font-size:12px;text-align:center">Consider following up — sometimes customers decline due to price or timing and are open to a conversation.</p>
              </div>
            `,
          });
        }
      }
    }
  } catch (err) {
    console.error("[decline] Notification email failed:", err);
  }

  return NextResponse.json({ success: true });
}
