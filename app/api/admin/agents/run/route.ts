import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import OpenAI from "openai";

export const maxDuration = 60;

async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Alex at Demand Pilot <alex@demandpilot.co.uk>",
      reply_to: "pryeralex492@gmail.com",
      to, subject, text,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
  return res.json();
}

type SupabaseClient = ReturnType<typeof createServiceClient>;

async function agentLog(supabase: SupabaseClient, agent: string, message: string, type = "info", metadata?: Record<string, unknown>) {
  await supabase.from("agent_logs").insert({ agent, message, type, metadata });
}

// ── Scout ─────────────────────────────────────────────────────────────────────
// GPT discovers 10 fresh UK trade leads daily, rotating city + trade.
// Hunter.io validates each domain and finds a contact email.
async function runScout(supabase: SupabaseClient) {
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!HUNTER_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing HUNTER_API_KEY", "error");
    return { message: "Missing Hunter API key", totalFound: 0, totalWithEmail: 0 };
  }
  if (!OPENAI_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing OPENAI_API_KEY", "error");
    return { message: "Missing OpenAI API key", totalFound: 0, totalWithEmail: 0 };
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const UK_CITIES = [
    "Nottingham", "Derby", "Leicester", "Sheffield", "Birmingham",
    "Manchester", "Leeds", "Bristol", "Newcastle", "Liverpool",
    "Coventry", "Norwich", "Southampton", "Brighton", "Cardiff",
    "Glasgow", "Edinburgh", "Milton Keynes", "Reading", "Oxford",
    "Cambridge", "Exeter", "Plymouth", "Stoke-on-Trent", "Hull",
  ];
  const TRADES = [
    "plumber", "electrician", "builder", "roofer", "plasterer",
    "carpenter", "gas engineer", "tiler", "painter decorator", "landscaper",
  ];

  const dayIndex = Math.floor(Date.now() / 86400000);
  let totalFound = 0;
  let totalWithEmail = 0;

  // Try up to 4 different city+trade combos until we hit 10 leads.
  // This prevents the dedup wall when a city/trade has already been exhausted.
  for (let attempt = 0; attempt < 4 && totalFound < 10; attempt++) {
    const idx = dayIndex + attempt;
    const city  = UK_CITIES[idx % UK_CITIES.length];
    const trade = TRADES[Math.floor(idx / UK_CITIES.length) % TRADES.length];

    if (attempt === 0) {
      await agentLog(supabase, "Scout", `🔍 Searching for ${trade}s in ${city}…`, "info");
    } else {
      await agentLog(supabase, "Scout", `Only ${totalFound} leads so far — trying ${trade}s in ${city}…`, "info");
    }

    try {
      const gptRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: `List 25 real, independent UK ${trade} businesses based in ${city} or within 15 miles. Small local businesses (1–20 employees) only — absolutely no national chains or franchises. Return JSON: {"leads": [{"name": "Business Name", "domain": "domain.co.uk"}]}. Use .co.uk domains.`,
        }],
      });

      const candidates: { name: string; domain: string }[] =
        JSON.parse(gptRes.choices[0].message.content ?? "{}").leads ?? [];

      await agentLog(supabase, "Scout", `GPT returned ${candidates.length} candidates for ${city}`, "info");

      for (const candidate of candidates) {
        if (totalFound >= 10) break;
        if (!candidate.domain) continue;

        const domain = candidate.domain
          .replace(/^(https?:\/\/)?(www\.)?/, "")
          .split("/")[0]
          .toLowerCase();

        if (!domain.includes(".")) continue;

        // Dedup by domain
        const { data: existing } = await supabase
          .from("outreach_leads").select("id")
          .ilike("notes", `%${domain}%`)
          .limit(1);
        if (existing?.length) continue;

        // Verify domain is live
        let domainLive = false;
        try {
          const r = await fetch(`https://${domain}`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
          domainLive = r.status < 500;
        } catch {
          try {
            const r2 = await fetch(`https://www.${domain}`, { method: "HEAD", signal: AbortSignal.timeout(5000) });
            domainLive = r2.status < 500;
          } catch {}
        }
        if (!domainLive) continue;

        // Hunter.io email lookup
        let email: string | null = null;
        try {
          const hr = await fetch(
            `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=5`,
            { signal: AbortSignal.timeout(7000) }
          );
          if (hr.ok) {
            const hd = await hr.json();
            const emails: any[] = hd.data?.emails ?? [];
            email = (
              emails.find(e => /contact|info|hello|enquir|admin|quote|office/i.test(e.value))
              ?? emails[0]
            )?.value ?? null;
          }
        } catch {}

        const { error } = await supabase.from("outreach_leads").insert({
          business_name: candidate.name,
          trade,
          email,
          location: city,
          source: "scout",
          status: email ? "new" : "no_email",
          notes: `https://${domain}`,
        });

        if (error) {
          await agentLog(supabase, "Scout", `✗ DB: ${error.message}`, "error");
          continue;
        }

        totalFound++;
        if (email) {
          totalWithEmail++;
          await agentLog(supabase, "Scout", `✓ ${candidate.name} (${city}) — ${email}`, "success", { trade, city });
        } else {
          await agentLog(supabase, "Scout", `◎ ${candidate.name} (${city}) — no email found`, "info");
        }

        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e: any) {
      await agentLog(supabase, "Scout", `✗ Error on attempt ${attempt + 1}: ${e.message}`, "error");
    }
  }

  const summary = `Scout done — ${totalFound} new leads stored, ${totalWithEmail} with emails`;
  await agentLog(supabase, "Scout", summary, "success");
  return { message: summary, totalFound, totalWithEmail };
}

// ── Writer ────────────────────────────────────────────────────────────────────
async function runWriter(supabase: SupabaseClient) {
  const { data: leads } = await supabase.from("outreach_leads").select("*").eq("status", "new");

  if (!leads?.length) {
    await agentLog(supabase, "Writer", "No new leads to process", "info");
    return { message: "No new leads to process" };
  }

  await agentLog(supabase, "Writer", `Writing emails for ${leads.length} leads...`, "info");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let processed = 0;

  for (const lead of leads) {
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
- Do NOT use "I hope this email finds you well"
- Start with "Hi," or reference their trade naturally

Return ONLY the email body, nothing else.`
        }]
      });

      const emailBody = response.choices[0].message.content ?? "";
      const subject = `Free quoting tool for ${lead.trade ?? "tradespeople"} — 2 mins to try`;

      await supabase.from("outreach_leads")
        .update({ status: "email_ready", email_body: emailBody, email_subject: subject })
        .eq("id", lead.id);

      await agentLog(supabase, "Writer", `Email ready for ${lead.business_name ?? lead.email}`, "success", { lead_id: lead.id });
      processed++;
    } catch (e: any) {
      await agentLog(supabase, "Writer", `Failed for ${lead.email}: ${e.message}`, "error");
    }
  }

  return { message: `Writer processed ${processed} leads` };
}

// ── Sender ────────────────────────────────────────────────────────────────────
async function runSender(supabase: SupabaseClient) {
  const { data: leads } = await supabase.from("outreach_leads").select("*").eq("status", "email_ready").not("email", "is", null);

  if (!leads?.length) {
    await agentLog(supabase, "Sender", "No emails ready to send", "info");
    return { message: "No leads ready to send" };
  }

  await agentLog(supabase, "Sender", `Sending ${leads.length} emails...`, "info");
  let sent = 0;

  for (const lead of leads) {
    if (!lead.email) continue;
    try {
      const body = (lead.email_body ?? "").replace(/\[SIGNUP_LINK\]/g, "https://demandpilot.co.uk");
      await sendEmail({ to: lead.email, subject: lead.email_subject ?? "Free quoting tool for UK tradespeople", text: body });
      await supabase.from("outreach_leads").update({ status: "email_sent", email_sent_at: new Date().toISOString() }).eq("id", lead.id);
      await agentLog(supabase, "Sender", `Sent to ${lead.email}`, "success", { lead_id: lead.id });
      sent++;
      await new Promise(r => setTimeout(r, 200));
    } catch (e: any) {
      await agentLog(supabase, "Sender", `Failed → ${lead.email}: ${e.message}`, "error");
    }
  }

  return { message: `Sender delivered ${sent} emails` };
}

// ── Reporter ──────────────────────────────────────────────────────────────────
async function runReporter(supabase: SupabaseClient) {
  const { data: leads } = await supabase.from("outreach_leads").select("status");
  const total = leads?.length ?? 0;
  const byStatus = (s: string) => leads?.filter(l => l.status === s).length ?? 0;

  const report = [
    `Demand Pilot — Daily Outreach Report`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Total leads:    ${total}`,
    `No email:       ${byStatus("no_email")}`,
    `New (pending):  ${byStatus("new")}`,
    `Email ready:    ${byStatus("email_ready")}`,
    `Emails sent:    ${byStatus("email_sent")}`,
    `Replied:        ${byStatus("replied")}`,
    `Signed up:      ${byStatus("signed_up")}`,
    ``,
    `Conversion: ${total ? Math.round((byStatus("signed_up") / total) * 100) : 0}%`,
    `Reply rate: ${byStatus("email_sent") ? Math.round((byStatus("replied") / byStatus("email_sent")) * 100) : 0}%`,
  ].join("\n");

  await sendEmail({
    to: "pryeralex492@gmail.com",
    subject: `Agent Report — ${new Date().toLocaleDateString("en-GB")}`,
    text: report,
  });

  await agentLog(supabase, "Reporter", `Daily report sent (${total} total, ${byStatus("email_sent")} sent, ${byStatus("signed_up")} signed up)`, "success");
  return { message: "Report sent to your email", report };
}

// ── Full pipeline ─────────────────────────────────────────────────────────────
async function runPipeline(supabase: SupabaseClient) {
  await agentLog(supabase, "Pipeline", "Starting full pipeline: Scout → Writer → Sender → Reporter", "info");
  const scout = await runScout(supabase);
  const writer = await runWriter(supabase);
  const sender = await runSender(supabase);
  const reporter = await runReporter(supabase);
  await agentLog(supabase, "Pipeline", "Full pipeline complete", "success");
  return { scout, writer, sender, reporter };
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
    if (agent === "scout") {
      const scout = await runScout(supabase);
      await agentLog(supabase, "Pipeline", "Scout done — handing off to Writer...", "info");
      const writer = await runWriter(supabase);
      await agentLog(supabase, "Pipeline", "Writer done — handing off to Sender...", "info");
      const sender = await runSender(supabase);
      return NextResponse.json({ scout, writer, sender });
    }
    if (agent === "writer") {
      const writer = await runWriter(supabase);
      await agentLog(supabase, "Pipeline", "Writer done — handing off to Sender...", "info");
      const sender = await runSender(supabase);
      return NextResponse.json({ writer, sender });
    }
    if (agent === "sender")   return NextResponse.json(await runSender(supabase));
    if (agent === "reporter") return NextResponse.json(await runReporter(supabase));
    if (agent === "pipeline") return NextResponse.json(await runPipeline(supabase));
    return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  } catch (e: any) {
    await agentLog(supabase, agent, `Agent crashed: ${e.message}`, "error");
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
