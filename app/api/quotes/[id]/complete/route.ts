import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, businesses(name, phone, bank_name, bank_sort_code, bank_account, payment_link, vat_registered, vat_number, payment_terms)")
    .eq("id", params.id)
    .single();

  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mark as complete
  await supabase.from("quotes").update({ status: "complete" }).eq("id", params.id);

  const biz = quote.businesses as any;
  const total = quote.total ?? 0;
  const vat = biz?.vat_registered ? total * 0.2 : 0;
  const totalIncVat = total + vat;

  // Send final invoice email
  if (quote.customer_email) {
    const paymentSection = biz?.payment_link
      ? `<p style="margin:16px 0"><a href="${biz.payment_link}" style="background:#ff6a1f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Pay Now</a></p>`
      : biz?.bank_account
      ? `<p style="margin:8px 0;color:#555">Bank transfer: <b>${biz.bank_name ?? ""}</b> | Sort: <b>${biz.bank_sort_code ?? ""}</b> | Acc: <b>${biz.bank_account}</b></p>`
      : "";

    await sendEmail({
      to: quote.customer_email,
      subject: `Final Invoice — ${quote.job_title ?? "Your Job"} | ${biz?.name ?? ""}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#ff6a1f">Final Invoice</h2>
          <p>Hi ${quote.customer_name ?? "there"},</p>
          <p>The work has been completed. Please find your final invoice below.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr style="background:#f5f5f5">
              <th style="padding:8px;text-align:left;border:1px solid #ddd">Job</th>
              <td style="padding:8px;border:1px solid #ddd">${quote.job_title ?? "—"}</td>
            </tr>
            <tr>
              <th style="padding:8px;text-align:left;border:1px solid #ddd">Address</th>
              <td style="padding:8px;border:1px solid #ddd">${quote.address ?? "—"}</td>
            </tr>
            ${vat > 0 ? `
            <tr style="background:#f5f5f5">
              <th style="padding:8px;text-align:left;border:1px solid #ddd">Subtotal (exc VAT)</th>
              <td style="padding:8px;border:1px solid #ddd">£${total.toLocaleString("en-GB")}</td>
            </tr>
            <tr>
              <th style="padding:8px;text-align:left;border:1px solid #ddd">VAT (20%) — ${biz?.vat_number ?? ""}</th>
              <td style="padding:8px;border:1px solid #ddd">£${vat.toLocaleString("en-GB")}</td>
            </tr>` : ""}
            <tr style="background:#fff3ee">
              <th style="padding:8px;text-align:left;border:1px solid #ddd;color:#ff6a1f">Total Due</th>
              <td style="padding:8px;border:1px solid #ddd;font-weight:bold;color:#ff6a1f">£${totalIncVat.toLocaleString("en-GB")}</td>
            </tr>
          </table>
          ${paymentSection}
          ${biz?.payment_terms ? `<p style="font-size:12px;color:#888;margin-top:16px">${biz.payment_terms}</p>` : ""}
          <p style="margin-top:24px">Thank you for your business,<br><b>${biz?.name ?? ""}</b>${biz?.phone ? ` | ${biz.phone}` : ""}</p>
        </div>
      `,
    });
  }

  return NextResponse.json({ ok: true });
}
