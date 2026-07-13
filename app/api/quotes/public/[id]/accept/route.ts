import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();
  const body = await request.json().catch(() => ({}));
  const signatureName = body.signatureName ?? null;

  // Check the quote exists and isn't already declined
  const { data: existing } = await supabase
    .from("quotes")
    .select("status")
    .eq("id", params.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  if (existing.status === "declined") {
    return NextResponse.json({ error: "Quote already declined" }, { status: 400 });
  }

  if (existing.status === "accepted") {
    // Already accepted — just return success
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase
    .from("quotes")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      ...(signatureName ? { signature_name: signatureName } : {}),
    })
    .eq("id", params.id);

  if (error) {
    console.error("Failed to accept quote:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
            subject: `🎉 Quote accepted — ${quote.customer_name || "Your customer"} confirmed the job`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
                <h2 style="margin:0 0 4px;font-size:22px">Quote accepted ✓</h2>
                <p style="color:#666;margin:0 0 24px;font-size:14px">Great news — you've got a confirmed job.</p>
                <div style="background:#f8f6f3;border-radius:12px;padding:20px;margin-bottom:24px">
                  <div style="font-size:13px;color:#888;margin-bottom:2px">Customer</div>
                  <div style="font-size:16px;font-weight:600">${quote.customer_name || "—"}</div>
                  <div style="font-size:13px;color:#888;margin:12px 0 2px">Job</div>
                  <div style="font-size:16px;font-weight:600">${quote.job_title || "—"}</div>
                  ${signatureName ? `<div style="font-size:13px;color:#888;margin:12px 0 2px">Signed by</div><div style="font-size:14px;font-style:italic">${signatureName}</div>` : ""}
                </div>
                <a href="${siteUrl}/quote/send?id=${params.id}" style="display:block;background:#ff6a1f;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:16px">
                  View quote →
                </a>
                <p style="color:#999;font-size:12px;text-align:center">You can raise a variation order or generate an invoice from the quote page.</p>
              </div>
            `,
          });
        }
      }
    }
  } catch (err) {
    console.error("[accept] Notification email failed:", err);
  }

  return NextResponse.json({ success: true });
}
