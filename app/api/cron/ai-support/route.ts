import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import OpenAI from "openai";

/*
  Vercel Cron Job — runs every 10 minutes.
  Finds support conversations where:
    - The last message is from the user
    - That message was sent > 1 hour ago
    - No admin/AI reply has been sent after it
  Then generates a helpful AI reply using GPT-4o-mini.
*/

const SYSTEM_PROMPT = `You are a friendly, helpful support assistant for Demand Pilot — a voice-to-quote app built specifically for UK tradespeople (builders, plumbers, electricians, decorators, etc.).

Your job is to answer user questions helpfully and concisely. Keep replies under 3 sentences unless the question genuinely needs more detail.

Key things you know about Demand Pilot:
- Users record their voice to describe a job and the app instantly generates a professional quote
- Quotes can be sent via WhatsApp or email with one tap
- Customers can view, accept, or decline quotes online — with a full e-signature flow
- After a customer accepts, they can pay via a payment link (Stripe/PayPal/GoCardless) or bank transfer
- Settings → Bank details is where tradespeople add their bank account and online payment link
- Subscription plans: Free (3 quotes/month), Trade £7.99/mo (50/month), Pro £14.99/mo (unlimited), Business £24.99/mo (unlimited + team features)
- Upgrade via Settings → Billing
- The app tracks quote history, revenue analytics, HMRC tax estimates, and job costing
- Tradespeople can raise variation orders on accepted jobs
- Customers can submit inbound quote requests via a shareable link
- If a user is having trouble with a specific feature, reassure them and let them know the team will personally follow up if needed

Tone: warm, concise, practical. Don't use corporate jargon. You're talking to a tradesperson who is busy and wants a quick answer. Always end with something encouraging or helpful.`;

export async function GET(req: NextRequest) {
  // Auth: Vercel sends the CRON_SECRET as a Bearer token
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "No OpenAI key" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Fetch all support messages
  const { data: messages } = await supabase
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (!messages?.length) return NextResponse.json({ processed: 0 });

  // Group by business_id
  const byBusiness = new Map<string, typeof messages>();
  for (const m of messages) {
    if (!byBusiness.has(m.business_id)) byBusiness.set(m.business_id, []);
    byBusiness.get(m.business_id)!.push(m);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let processed = 0;

  for (const [businessId, msgs] of byBusiness) {
    const lastMsg = msgs[msgs.length - 1];

    // Skip if last message is already from admin/AI
    if (lastMsg.from_admin) continue;

    // Skip if last user message is less than 1 hour old
    if (lastMsg.created_at > oneHourAgo) continue;

    // Build conversation history for OpenAI
    const chatMessages = msgs.map((m) => ({
      role: (m.from_admin ? "assistant" : "user") as "assistant" | "user",
      content: m.message,
    }));

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...chatMessages],
        max_tokens: 250,
        temperature: 0.7,
      });

      const reply = completion.choices[0]?.message?.content?.trim();
      if (!reply) continue;

      await supabase.from("support_messages").insert({
        business_id: businessId,
        user_email: lastMsg.user_email,
        business_name: lastMsg.business_name,
        message: reply,
        from_admin: true,
        read_by_admin: true,
        read_by_user: false,
        is_ai_reply: true,
      });

      console.log(`[ai-support] Replied to ${lastMsg.business_name} (${businessId})`);
      processed++;
    } catch (err) {
      console.error(`[ai-support] Error replying to ${businessId}:`, err);
    }
  }

  return NextResponse.json({ processed });
}
