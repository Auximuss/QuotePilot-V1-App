import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import OpenAI from "openai";

async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Alex at Demand Pilot <onboarding@resend.dev>",
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
  return res.json();
}

type SupabaseClient = ReturnType<typeof createServiceClient>;

async function agentLog(supabase: SupabaseClient, agent: string, message: string, type = "info", metadata?: Record<string, unknown>) {
  await supabase.from("agent_logs").insert({ agent, message, type, metadata });
}

// ── Scout Agent ───────────────────────────────────────────────────────────────
// Generates suggested search queries for finding leads — human adds them manually
async function runScout(supabase: SupabaseClient) {
  await agentLog(supabase, "Scout", "🔍 Generating lead search queries for Nottingham tradespeople...", "info");

  const trades = ["plumber", "electrician", "builder", "roofer", "plasterer", "carpenter", "gas engineer", "heating engineer"];
  const areas = ["Nottingham", "Beeston", "Arnold", "Hucknall", "Clifton", "West Bridgford", "Bulwell", "Carlton"];

  const queries = trades.flatMap(t => areas.slice(0, 3).map(a => `"${t} ${a}" site:checkatrade.com OR site:mybuilder.com`));

  await agentLog(supabase, "Scout", `✓ Generated ${queries.length} search queries. Copy these into Google to find leads.`, "success", { queries: queries.slice(0, 10) });

  return { queries: queries.slice(0, 10), message: `Scout generated ${queries.length} search queries` };
}

// ── Writer Agent ──────────────────────────────────────────────────────────────
async function runWriter(supabase: SupabaseClient) {
  const { data: leads } = await supabase
    .from("outreach_leads")
    .select("*")
    .eq("status", "new");

  if (!leads?.length) {
    await agentLog(supabase, "Writer", "No new leads to process — add leads first", "info");
    return { message: "No new leads to process" };
  }

  await agentLog(supabase, "Writer", `✍️ Processing ${leads.length} leads...`, "info");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let processed = 0;

  for (const lead of leads) {
    await agentLog(supabase, "Writer", `Generating email for ${lead.business_name ?? lead.email}...`, "info");

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `Write a short cold email to a UK tradesperson inviting them to try a free quoting app called Demand Pilot.

Business name: ${lead.business_name ?? "their business"}
Trade: ${lead.trade ?? "tradesperson"}
Location: ${lead.location ?? "Nottingham"}

Rules:
- 3 short paragraphs max, conversational tone
- Core benefit: describe a job by voice, AI builds the quote in seconds, send to customer via WhatsApp
- Completely free to try, no card needed
- End with a link placeholder [SIGNUP_LINK]
- Sign off: Alex, Founder — Demand Pilot
- Do NOT use generic phrases like "I hope this email finds you well"
- Start with "Hi," or use their trade naturally

Return ONLY the email body, nothing else.`
        }]
      });

      const emailBody = response.choices[0].message.content ?? "";
      const subject = `Free quoting tool for ${lead.trade ?? "tradespeople"} — 2 mins to try`;

      await supabase
        .from("outreach_leads")
        .update({ status: "email_ready", email_body: emailBody, email_subject: subject })
        .eq("id", lead.id);

      await agentLog(supabase, "Writer", `✓ Email ready for ${lead.business_name ?? lead.email}`, "success", { lead_id: lead.id });
      processed++;
    } catch (e: any) {
      await agentLog(supabase, "Writer", `✗ Failed for ${lead.email}: ${e.message}`, "error");
    }
  }

  return { message: `Writer processed ${processed} leads` };
}

// ── Sender Agent ──────────────────────────────────────────────────────────────
async function runSender(supabase: SupabaseClient) {
  const { data: leads } = await supabase
    .from("outreach_leads")
    .select("*")
    .eq("status", "email_ready")
    .not("email", "is", null);

  if (!leads?.length) {
    await agentLog(supabase, "Sender", "No emails ready to send — run Writer first", "info");
    return { message: "No leads ready to send" };
  }

  await agentLog(supabase, "Sender", `📤 Sending ${leads.length} emails...`, "info");

  let sent = 0;

  for (const lead of leads) {
    if (!lead.email) continue;

    try {
      const body = (lead.email_body ?? "")
        .replace(/\[SIGNUP_LINK\]/g, "https://demand-pilot.vercel.app");

      await sendEmail({
        to: lead.email,
        subject: lead.email_subject ?? "Free quoting tool for UK tradespeople",
        text: body,
      });

      await supabase
        .from("outreach_leads")
        .update({ status: "email_sent", email_sent_at: new Date().toISOString() })
        .eq("id", lead.id);

      await agentLog(supabase, "Sender", `✓ Sent to ${lead.email}`, "success", { lead_id: lead.id });
      sent++;

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 200));
    } catch (e: any) {
      await agentLog(supabase, "Sender", `✗ Failed → ${lead.email}: ${e.message}`, "error");
    }
  }

  return { message: `Sender delivered ${sent} emails` };
}

// ── Reporter Agent ────────────────────────────────────────────────────────────
async function runReporter(supabase: SupabaseClient) {
  const { data: leads } = await supabase.from("outreach_leads").select("status");
  const total = leads?.length ?? 0;
  const byStatus = (s: string) => leads?.filter(l => l.status === s).length ?? 0;

  const report = [
    `📊 Demand Pilot — Daily Outreach Report`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Total leads:    ${total}`,
    `New (pending):  ${byStatus("new")}`,
    `Email ready:    ${byStatus("email_ready")}`,
    `Emails sent:    ${byStatus("email_sent")}`,
    `Replied:        ${byStatus("replied")}`,
    `Signed up:      ${byStatus("signed_up")}`,
    ``,
    `Conversion rate: ${total ? Math.round((byStatus("signed_up") / total) * 100) : 0}%`,
    `Reply rate:      ${byStatus("email_sent") ? Math.round((byStatus("replied") / byStatus("email_sent")) * 100) : 0}%`,
  ].join("\n");

  await sendEmail({
    to: "pryeralex492@gmail.com",
    subject: `📊 Agent Report — ${new Date().toLocaleDateString("en-GB")}`,
    text: report,
  });

  await agentLog(supabase, "Reporter", `✓ Daily report sent (${total} leads, ${byStatus("email_sent")} sent)`, "success");
  return { message: "Report sent to your email", report };
}

// ── Full pipeline (Scout → Writer → Sender → Reporter) ───────────────────────
async function runPipeline(supabase: SupabaseClient) {
  await agentLog(supabase, "Pipeline", "🚀 Starting full pipeline: Scout → Writer → Sender → Reporter", "info");
  const scoutResult = await runScout(supabase);
  const writerResult = await runWriter(supabase);
  const senderResult = await runSender(supabase);
  const reporterResult = await runReporter(supabase);
  await agentLog(supabase, "Pipeline", "✅ Full pipeline complete", "success");
  return { scout: scoutResult, writer: writerResult, sender: senderResult, reporter: reporterResult };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createServiceClient();

  const { agent } = await req.json();

  try {
    // Auto-chain: scout runs writer, writer runs sender
    if (agent === "scout") {
      const scoutResult = await runScout(supabase);
      await agentLog(supabase, "Pipeline", "⛓ Scout complete — handing off to Writer...", "info");
      const writerResult = await runWriter(supabase);
      await agentLog(supabase, "Pipeline", "⛓ Writer complete — handing off to Sender...", "info");
      const senderResult = await runSender(supabase);
      return NextResponse.json({ scout: scoutResult, writer: writerResult, sender: senderResult });
    }
    if (agent === "writer") {
      const writerResult = await runWriter(supabase);
      await agentLog(supabase, "Pipeline", "⛓ Writer complete — handing off to Sender...", "info");
      const senderResult = await runSender(supabase);
      return NextResponse.json({ writer: writerResult, sender: senderResult });
    }
    if (agent === "sender") return NextResponse.json(await runSender(supabase));
    if (agent === "reporter") return NextResponse.json(await runReporter(supabase));
    if (agent === "pipeline") return NextResponse.json(await runPipeline(supabase));
    return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  } catch (e: any) {
    await agentLog(supabase, agent, `✗ Agent crashed: ${e.message}`, "error");
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
