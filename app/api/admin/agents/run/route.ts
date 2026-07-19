import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import OpenAI from "openai";

export const maxDuration = 60; // Vercel Pro — Scout needs time to search + call Hunter

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
// Searches Google for real UK tradespeople, finds their emails via Hunter.io,
// stores them as leads ready for Writer to process.
async function runScout(supabase: SupabaseClient) {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID || !HUNTER_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing env vars — add GOOGLE_API_KEY, GOOGLE_CSE_ID, HUNTER_API_KEY in Vercel", "error");
    return { message: "Missing API keys" };
  }

  const SKIP_DOMAINS = ["checkatrade.com", "yell.com", "mybuilder.com", "ratedpeople.com", "trustatrader.com", "facebook.com", "instagram.com", "twitter.com", "linkedin.com", "google.com", "bing.com", "bark.com", "rated.com", "which.co.uk"];

  const SEARCHES = [
    { trade: "plumber",          area: "Nottingham" },
    { trade: "electrician",      area: "Nottingham" },
    { trade: "builder",          area: "Nottingham" },
    { trade: "roofer",           area: "Nottingham" },
    { trade: "plasterer",        area: "Nottingham" },
    { trade: "carpenter",        area: "Nottingham" },
    { trade: "gas engineer",     area: "Nottingham" },
    { trade: "plumber",          area: "Beeston" },
    { trade: "electrician",      area: "Arnold" },
    { trade: "builder",          area: "West Bridgford" },
    { trade: "roofer",           area: "Hucknall" },
    { trade: "heating engineer", area: "Nottingham" },
  ];

  let totalFound = 0;
  let totalWithEmail = 0;

  await agentLog(supabase, "Scout", `🔍 Searching for Nottingham tradespeople across ${SEARCHES.length} queries...`, "info");

  for (const { trade, area } of SEARCHES) {
    try {
      const query = `${trade} ${area} contact`;
      const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=10`;

      const googleRes = await fetch(googleUrl);
      if (!googleRes.ok) {
        const errText = await googleRes.text();
        await agentLog(supabase, "Scout", `✗ Google API error (${googleRes.status}) — ${errText.slice(0, 120)}`, "error");
        break;
      }

      const googleData = await googleRes.json();
      if (googleData.error) {
        await agentLog(supabase, "Scout", `✗ Google: ${googleData.error.message}`, "error");
        break;
      }

      const items: any[] = googleData.items ?? [];

      for (const item of items) {
        try {
          // Parse domain
          let domain: string;
          try { domain = new URL(item.link).hostname.replace(/^www\./, ""); } catch { continue; }

          // Skip directories & social
          if (SKIP_DOMAINS.some(d => domain.includes(d))) continue;

          // Skip already found
          const { data: existing } = await supabase
            .from("outreach_leads").select("id").ilike("notes", `%${domain}%`).limit(1);
          if (existing?.length) continue;

          // Clean business name
          const businessName = item.title
            .split(/\s[-|–·|]\s/)[0]
            .replace(/\s+(Ltd|Limited|LTD|plc|PLC)\.?$/i, "")
            .trim()
            .substring(0, 80) || domain;

          // Hunter.io — find email for this domain
          let email: string | null = null;
          const hunterRes = await fetch(
            `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=5`
          );
          if (hunterRes.ok) {
            const hunterData = await hunterRes.json();
            const emails: any[] = hunterData.data?.emails ?? [];
            const best = emails.find(e =>
              /contact|info|hello|enquir|admin|quote|office/i.test(e.value)
            ) ?? emails[0];
            email = best?.value ?? null;
          }

          // Detect location from snippet
          const AREAS = ["Nottingham", "Beeston", "Arnold", "Hucknall", "Clifton", "West Bridgford", "Bulwell", "Carlton", "Nottinghamshire"];
          const detectedArea = AREAS.find(a => `${item.snippet ?? ""} ${item.title}`.includes(a)) ?? area;

          await supabase.from("outreach_leads").insert({
            business_name: businessName,
            trade,
            email,
            location: detectedArea,
            phone: null,
            source: "scout",
            status: email ? "new" : "no_email",
            notes: item.link,
          });

          totalFound++;
          if (email) {
            totalWithEmail++;
            await agentLog(supabase, "Scout", `✓ ${businessName} — ${email}`, "success", { domain, trade });
          } else {
            await agentLog(supabase, "Scout", `◎ ${businessName} (${domain}) — no email found`, "info");
          }

          await new Promise(r => setTimeout(r, 250));
        } catch (e: any) {
          await agentLog(supabase, "Scout", `✗ Result error: ${e.message}`, "error");
        }
      }

      await new Promise(r => setTimeout(r, 300));
    } catch (e: any) {
      await agentLog(supabase, "Scout", `✗ Search error (${trade} ${area}): ${e.message}`, "error");
    }
  }

  const summary = `✅ Scout done — ${totalFound} leads found, ${totalWithEmail} with emails ready for Writer`;
  await agentLog(supabase, "Scout", summary, "success");
  return { message: summary, totalFound, totalWithEmail };
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
