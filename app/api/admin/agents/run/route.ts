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
      from: "Alex at Demand Pilot <onboarding@resend.dev>",
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
// Source 1: OpenStreetMap Overpass API — free, no auth, UK tradespeople data
// Source 2: Companies House API — free UK gov API, no auth, registered companies
// Then Hunter.io on any websites found to get email addresses.
async function runScout(supabase: SupabaseClient) {
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing HUNTER_API_KEY env var", "error");
    return { message: "Missing Hunter API key" };
  }

  let totalFound = 0;
  let totalWithEmail = 0;

  // ── Hunter email lookup ────────────────────────────────────────────────────
  async function hunterEmail(website: string): Promise<string | null> {
    try {
      const domain = new URL(website).hostname.replace(/^www\./, "");
      if (!domain || domain.length < 4) return null;
      const hr = await fetch(
        `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=5`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!hr.ok) return null;
      const hd = await hr.json();
      const emails: any[] = hd.data?.emails ?? [];
      return (
        emails.find(e => /contact|info|hello|enquir|admin|quote|office/i.test(e.value)) ?? emails[0]
      )?.value ?? null;
    } catch { return null; }
  }

  // ── Store a lead (deduplicates by notes key) ───────────────────────────────
  async function storeLead(key: string, name: string, trade: string, website: string | null, directEmail?: string | null) {
    const { data: existing } = await supabase
      .from("outreach_leads").select("id").ilike("notes", `%${key}%`).limit(1);
    if (existing?.length) return;

    const email = directEmail ?? (website ? await hunterEmail(website) : null);

    const { error } = await supabase.from("outreach_leads").insert({
      business_name: name,
      trade,
      email,
      location: "Nottingham",
      source: "scout",
      status: email ? "new" : "no_email",
      notes: key,
    });
    if (error) { await agentLog(supabase, "Scout", `✗ DB: ${error.message}`, "error"); return; }

    totalFound++;
    if (email) {
      totalWithEmail++;
      await agentLog(supabase, "Scout", `✓ ${name} — ${email}`, "success", { website, trade });
    } else {
      await agentLog(supabase, "Scout", `◎ ${name} — ${website ? "no email on Hunter" : "no website found"}`, "info");
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ── Source 1: OpenStreetMap Overpass API ───────────────────────────────────
  // Nottingham bounding box: 52.88,-1.28,53.08,-0.98
  const OSM_CRAFTS: Record<string, string> = {
    plumber:           "plumber",
    electrician:       "electrician",
    builder:           "builder",
    roofer:            "roofer",
    plasterer:         "plasterer",
    carpenter:         "carpenter",
    "gas engineer":    "hvac_technician",
    "heating engineer":"hvac_technician",
  };

  await agentLog(supabase, "Scout", "🗺 Querying OpenStreetMap for Nottingham tradespeople...", "info");

  for (const [trade, osmTag] of Object.entries(OSM_CRAFTS)) {
    try {
      const query = `[out:json][timeout:20];(node["craft"="${osmTag}"](52.88,-1.28,53.08,-0.98);way["craft"="${osmTag}"](52.88,-1.28,53.08,-0.98););out body;`;
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
        headers: { "Content-Type": "text/plain" },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) { await agentLog(supabase, "Scout", `OSM error ${res.status} for ${trade}`, "info"); continue; }
      const data = await res.json();
      const elements: any[] = data.elements ?? [];

      await agentLog(supabase, "Scout", `OSM: ${elements.length} ${trade} entries in Nottingham`, "info");

      for (const el of elements) {
        const tags = el.tags ?? {};
        const name = tags.name ?? tags["name:en"] ?? null;
        if (!name) continue;
        const website = tags.website ?? tags.url ?? null;
        const directEmail = tags.email ?? null;
        const key = `osm:${el.id}`;
        await storeLead(key, name, trade, website, directEmail);
      }
    } catch (e: any) {
      await agentLog(supabase, "Scout", `OSM error (${trade}): ${e.message}`, "error");
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ── Source 2: Companies House API ─────────────────────────────────────────
  // SIC codes for trades — filtered from CH search results
  const CH_QUERIES = [
    { trade: "plumber",          q: "plumbing nottingham" },
    { trade: "electrician",      q: "electrical nottingham" },
    { trade: "builder",          q: "building construction nottingham" },
    { trade: "roofer",           q: "roofing nottingham" },
    { trade: "plasterer",        q: "plastering nottingham" },
    { trade: "carpenter",        q: "carpentry joinery nottingham" },
    { trade: "gas engineer",     q: "gas heating nottingham" },
    { trade: "heating engineer", q: "heating engineer nottingham" },
  ];

  const TRADE_SICS: Record<string, string[]> = {
    plumber:           ["43220"],
    electrician:       ["43210"],
    builder:           ["41100","41201","41202","43290","43999"],
    roofer:            ["43910"],
    plasterer:         ["43300"],
    carpenter:         ["43320"],
    "gas engineer":    ["43220","43290"],
    "heating engineer":["43220","35300"],
  };

  await agentLog(supabase, "Scout", "🏢 Querying Companies House for registered Nottingham trade businesses...", "info");

  for (const { trade, q } of CH_QUERIES) {
    try {
      const res = await fetch(
        `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=20`,
        { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) { await agentLog(supabase, "Scout", `CH error ${res.status} for ${trade}`, "info"); continue; }
      const data = await res.json();
      const companies: any[] = (data.items ?? []).filter((c: any) =>
        // Only active companies
        c.company_status === "active" &&
        // Registered in Nottingham area
        /Nottingham|NG\d/i.test(JSON.stringify(c.registered_office_address ?? {}))
      ).slice(0, 10);

      await agentLog(supabase, "Scout", `CH: ${companies.length} active ${trade} companies in Nottingham`, "info");

      for (const co of companies) {
        const name = co.title ?? "Unknown";
        const companyNumber = co.company_number;
        const key = `ch:${companyNumber}`;

        // Try to guess their website from company name
        const slug = name
          .toLowerCase()
          .replace(/\s+(ltd|limited|plc|llp|lp)\.?$/i, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        // Try the most common domain patterns
        let website: string | null = null;
        for (const tld of [".co.uk", ".com"]) {
          const candidate = `https://${slug}${tld}`;
          try {
            const headRes = await fetch(candidate, { method: "HEAD", signal: AbortSignal.timeout(4000) });
            if (headRes.ok || headRes.status === 405) { website = candidate; break; }
          } catch {}
        }

        await storeLead(key, name, trade, website);
      }
    } catch (e: any) {
      await agentLog(supabase, "Scout", `CH error (${trade}): ${e.message}`, "error");
    }
    await new Promise(r => setTimeout(r, 400));
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
