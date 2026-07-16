/**
 * Shared email sender using Resend.
 * Falls back gracefully if no API key is configured.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "Demand Pilot <onboarding@resend.dev>";

  if (!apiKey) return { sent: false, reason: "no_api_key" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[email] Send failed:", err);
    return { sent: false, reason: err };
  }

  return { sent: true };
}
