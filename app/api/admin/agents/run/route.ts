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
// Uses a verified seed list of real Nottingham tradespeople (found via live
// search), then runs Hunter.io on each domain to find email addresses.
// New businesses are added to the seed list over time.
async function runScout(supabase: SupabaseClient) {
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing HUNTER_API_KEY env var", "error");
    return { message: "Missing Hunter API key" };
  }

  // ── Verified Nottingham tradespeople (real businesses, confirmed live) ─────
  const SEED_LEADS = [
    // Plumbers
    { name: "Plumbers Notts",              trade: "plumber",          website: "https://www.plumbers-notts.co.uk" },
    { name: "BL Plumbers Nottingham",      trade: "plumber",          website: "https://blplumbersnottinghamltd.co.uk",  email: "blplumbers247@gmail.com" },
    { name: "MB Plumbing & Heating",       trade: "plumber",          website: "https://mbplumbers.co.uk" },
    { name: "DJA Plumbing and Heating",    trade: "plumber",          website: "https://djaplumbingandheating.co.uk" },
    { name: "Near Plumber Beeston",        trade: "plumber",          website: "https://nearplumber.co.uk",             email: "info@nearplumber.co.uk" },
    { name: "FWP Plumbers Nottingham",     trade: "plumber",          website: "https://www.fwpplumbersnottingham.co.uk" },
    { name: "Ben Plumber",                 trade: "plumber",          website: "https://www.benplumberltd.co.uk" },
    { name: "Andy the Plumber Stapleford", trade: "plumber",          website: "https://staplefordplumber.co.uk" },
    // Electricians
    { name: "RG Electrical Nottingham",    trade: "electrician",      website: "https://electrician-nottingham.co.uk" },
    { name: "S O Campbell Electrical",     trade: "electrician",      website: "https://www.socampbellelectrical.co.uk", email: "info@socampbellelectrical.co.uk" },
    { name: "ADC Electrical",              trade: "electrician",      website: "https://adcalltrade.co.uk" },
    { name: "Arnold Electrical",           trade: "electrician",      website: "https://www.arnoldelectrical.com" },
    { name: "Wing Electrical",             trade: "electrician",      website: "https://wingelectrical.co.uk" },
    { name: "Dennis Electrical",           trade: "electrician",      website: "https://dennis-electrical.co.uk" },
    { name: "MT Electrical",               trade: "electrician",      website: "https://mt-electrical.co.uk" },
    { name: "Alpha Electricians",          trade: "electrician",      website: "https://www.nottingham-electrician.co.uk" },
    // Builders
    { name: "Building Nottingham",         trade: "builder",          website: "https://www.building-nottingham.co.uk" },
    { name: "Nottingham Building & Roofing", trade: "builder",        website: "https://www.nottinghambuildingandroofing.co.uk" },
    // Roofers
    { name: "Nottingham Gutters & Roofing", trade: "roofer",          website: "https://www.nottinghamgutters.co.uk",   email: "info@nottinghamgutters.co.uk" },
    { name: "JTB Roofers Nottingham",      trade: "roofer",           website: "https://www.roofersofnottingham.co.uk" },
    { name: "B&S Roofing Nottingham",      trade: "roofer",           website: "https://bsroofingnottingham.co.uk" },
    { name: "D&S Roofing Contractors",     trade: "roofer",           website: "https://dandsroofingcontractors.co.uk" },
    // Plasterers
    { name: "JB Plastering Nottingham",    trade: "plasterer",        website: "https://www.plasterernottinghamshire.co.uk" },
    { name: "Marklands Plastering",        trade: "plasterer",        website: "https://www.marklandsplastering.co.uk" },
    { name: "Quality Plastering Nottingham", trade: "plasterer",      website: "https://www.qualityplasteringnottingham.co.uk" },
    { name: "ATK Plastering Ltd",          trade: "plasterer",        website: "https://www.atkplastering.co.uk" },
    { name: "DF Plastering Nottingham",    trade: "plasterer",        website: "https://dfplasteringnottingham.com" },
    { name: "RJ Bethell Plastering",       trade: "plasterer",        website: "https://www.nottinghamplasterer.co.uk" },
    { name: "JSL Plastering",              trade: "plasterer",        website: "https://www.jslplastering.co.uk" },
    { name: "AS Complete Plastering",      trade: "plasterer",        website: "https://www.ascompleteplastering.co.uk" },
    // Carpenters & Joiners
    { name: "Joiner Nottingham",           trade: "carpenter",        website: "https://www.joinernottingham.co.uk" },
    { name: "S Kirk Joinery",              trade: "carpenter",        website: "https://www.skirkjoinery.co.uk" },
    { name: "Trentside Joinery",           trade: "carpenter",        website: "https://trentsidejoinery.com" },
    { name: "Redwood Joinery Ltd",         trade: "carpenter",        website: "https://www.redwood-joinery.co.uk" },
    // Gas Engineers
    { name: "Gaswise Nottingham",          trade: "gas engineer",     website: "https://www.gaswiseonline.co.uk" },
    { name: "We Fix Boilers Nottingham",   trade: "gas engineer",     website: "https://www.wefixboilers.co.uk" },
    { name: "Nottingham Gas Services",     trade: "gas engineer",     website: "https://www.nottinghamgasservices.co.uk" },
    { name: "Nottingham Boiler Shop",      trade: "gas engineer",     website: "https://www.nottinghamboilershop.co.uk" },
    { name: "Nottingham Boiler Solutions", trade: "gas engineer",     website: "https://nottinghamboilersolutions.co.uk" },
    { name: "CCMK Gas Nottingham",         trade: "gas engineer",     website: "https://ccmkgas.co.uk" },
    { name: "Nottingham Heating",          trade: "gas engineer",     website: "https://www.nottinghamheating.co.uk" },
    { name: "RB Heating & Gas Services",   trade: "gas engineer",     website: "https://rbheatingandgas.co.uk" },
  ];

  let totalFound = 0;
  let totalWithEmail = 0;

  await agentLog(supabase, "Scout", `🔍 Processing ${SEED_LEADS.length} verified Nottingham trade businesses...`, "info");

  for (const lead of SEED_LEADS) {
    // Dedup — skip if already stored
    const { data: existing } = await supabase
      .from("outreach_leads").select("id")
      .ilike("notes", `%${lead.website}%`)
      .limit(1);
    if (existing?.length) continue;

    // Use direct email if we already know it, otherwise try Hunter
    let email = lead.email ?? null;
    if (!email && lead.website) {
      try {
        const domain = new URL(lead.website).hostname.replace(/^www\./, "");
        const hr = await fetch(
          `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=5`,
          { signal: AbortSignal.timeout(7000) }
        );
        if (hr.ok) {
          const hd = await hr.json();
          const emails: any[] = hd.data?.emails ?? [];
          email = (
            emails.find(e => /contact|info|hello|enquir|admin|quote|office/i.test(e.value)) ?? emails[0]
          )?.value ?? null;
        }
      } catch {}
    }

    const { error } = await supabase.from("outreach_leads").insert({
      business_name: lead.name,
      trade: lead.trade,
      email,
      location: "Nottingham",
      source: "scout",
      status: email ? "new" : "no_email",
      notes: lead.website,
    });

    if (error) {
      await agentLog(supabase, "Scout", `✗ DB insert failed: ${error.message}`, "error");
      continue;
    }

    totalFound++;
    if (email) {
      totalWithEmail++;
      await agentLog(supabase, "Scout", `✓ ${lead.name} — ${email}`, "success", { trade: lead.trade });
    } else {
      await agentLog(supabase, "Scout", `◎ ${lead.name} — no email found`, "info");
    }

    await new Promise(r => setTimeout(r, 500));
  }

  const summary = `Scout done — ${totalFound} leads stored, ${totalWithEmail} with emails ready for Writer`;
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
      const body = (lead.email_body ?? "").replace(/\[SIGNUP_LINK\]/g, "https://demand-pilot.vercel.app");
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
