import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const supabase = createServiceClient();
  const normalEmail = email.trim().toLowerCase();

  // Check if any quotes exist for this email
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id")
    .eq("customer_email", normalEmail)
    .limit(1);

  // Always respond with success to prevent email enumeration
  if (!quotes?.length) return NextResponse.json({ sent: true });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await supabase.from("customer_sessions").insert({ customer_email: normalEmail, token, expires_at: expiresAt.toISOString() });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://demand-pilot.vercel.app";
  const link = `${appUrl}/customer/dashboard?token=${token}`;

  await sendEmail({
    to: normalEmail,
    subject: "Your Demand Pilot portal link",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#ff6a1f">Your quotes & invoices</h2>
        <p>Click the link below to view all your quotes and invoices. This link expires in 1 hour.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#ff6a1f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
            View My Quotes
          </a>
        </p>
        <p style="font-size:12px;color:#888">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });

  return NextResponse.json({ sent: true });
}
