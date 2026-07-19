import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import OpenAI from "openai";

// Cron runs the full pipeline daily at 7am UTC — no user auth needed.
// Protected by CRON_SECRET env var.

export const maxDuration = 300; // 5 min — Scout needs time on Vercel Pro

type Supa = ReturnType<typeof createServiceClient>;

async function agentLog(supabase: Supa, agent: string, message: string, type = "info", metadata?: Record<string, unknown>) {
  await supabase.from("agent_logs").insert({ agent, message, type, metadata });
}

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

// ── Scout (OpenStreetMap + Companies House — fully free, no card) ────────────
async function runScout(supabase: Supa) {
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing HUNTER_API_KEY", "error");
    return { totalFound: 0, totalWithEmail: 0 };
  }

  let totalFound = 0, totalWithEmail = 0;

  async function hunterEmail(website: string): Promise<string | null> {
    try {
      const domain = new URL(website).hostname.replace(/^www\./, "");
      if (!domain || domain.length < 4) return null;
      const hr = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=5`, { signal: AbortSignal.timeout(6000) });
      if (!hr.ok) return null;
      const hd = await hr.json();
      const emails: any[] = hd.data?.emails ?? [];
      return (emails.find(e => /contact|info|hello|enquir|admin|quote|office/i.test(e.value)) ?? emails[0])?.value ?? null;
    } catch { return null; }
  }

  async function storeLead(key: string, name: string, trade: string, website: string | null, directEmail?: string | null) {
    const { data: ex } = await supabase.from("outreach_leads").select("id").ilike("notes", `%${key}%`).limit(1);
    if (ex?.length) return;
    const email = directEmail ?? (website ? await hunterEmail(website) : null);
    const { error } = await supabase.from("outreach_leads").insert({ business_name: name, trade, email, location: "Nottingham", source: "scout", status: email ? "new" : "no_email", notes: key });
    if (error) { await agentLog(supabase, "Scout", `✗ DB: ${error.message}`, "error"); return; }
    totalFound++;
    if (email) { totalWithEmail++; await agentLog(supabase, "Scout", `✓ ${name} — ${email}`, "success", { trade }); }
    else { await agentLog(supabase, "Scout", `◎ ${name} — ${website ? "no email" : "no website"}`, "info"); }
    await new Promise(r => setTimeout(r, 300));
  }

  // OpenStreetMap Overpass API — Nottingham bounding box
  const OSM_CRAFTS: Record<string, string> = {
    plumber: "plumber", electrician: "electrician", builder: "builder",
    roofer: "roofer", plasterer: "plasterer", carpenter: "carpenter",
    "gas engineer": "hvac_technician", "heating engineer": "hvac_technician",
  };

  await agentLog(supabase, "Scout", "🗺 Querying OpenStreetMap for Nottingham tradespeople...", "info");
  for (const [trade, osmTag] of Object.entries(OSM_CRAFTS)) {
    try {
      const query = `[out:json][timeout:20];(node["craft"="${osmTag}"](52.88,-1.28,53.08,-0.98);way["craft"="${osmTag}"](52.88,-1.28,53.08,-0.98););out body;`;
      const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query, headers: { "Content-Type": "text/plain" }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) continue;
      const data = await res.json();
      const elements: any[] = data.elements ?? [];
      await agentLog(supabase, "Scout", `OSM: ${elements.length} ${trade} entries`, "info");
      for (const el of elements) {
        const tags = el.tags ?? {};
        if (!tags.name) continue;
        await storeLead(`osm:${el.id}`, tags.name, trade, tags.website ?? tags.url ?? null, tags.email ?? null);
      }
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }

  // Companies House API — free UK government API
  const CH_QUERIES = [
    { trade: "plumber", q: "plumbing nottingham" },
    { trade: "electrician", q: "electrical nottingham" },
    { trade: "builder", q: "building construction nottingham" },
    { trade: "roofer", q: "roofing nottingham" },
    { trade: "plasterer", q: "plastering nottingham" },
    { trade: "carpenter", q: "carpentry joinery nottingham" },
    { trade: "gas engineer", q: "gas heating nottingham" },
    { trade: "heating engineer", q: "heating engineer nottingham" },
  ];

  await agentLog(supabase, "Scout", "🏢 Querying Companies House for Nottingham trade companies...", "info");
  for (const { trade, q } of CH_QUERIES) {
    try {
      const res = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=20`, { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const data = await res.json();
      const companies: any[] = (data.items ?? [])
        .filter((c: any) => c.company_status === "active" && /Nottingham|NG\d/i.test(JSON.stringify(c.registered_office_address ?? {})))
        .slice(0, 10);
      await agentLog(supabase, "Scout", `CH: ${companies.length} active ${trade} companies in Nottingham`, "info");
      for (const co of companies) {
        const name = co.title ?? "Unknown";
        const slug = name.toLowerCase().replace(/\s+(ltd|limited|plc|llp)\.?$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        let website: string | null = null;
        for (const tld of [".co.uk", ".com"]) {
          try {
            const hr = await fetch(`https://${slug}${tld}`, { method: "HEAD", signal: AbortSignal.timeout(4000) });
            if (hr.ok || hr.status === 405) { website = `https://${slug}${tld}`; break; }
          } catch {}
        }
        await storeLead(`ch:${co.company_number}`, name, trade, website);
      }
    } catch (e: any) {
      await agentLog(supabase, "Scout", `CH error (${trade}): ${e.message}`, "error");
    }
    await new Promise(r => setTimeout(r, 400));
  }

  await agentLog(supabase, "Scout", `✅ ${totalFound} leads found, ${totalWithEmail} with emails`, "success");
  return { totalFound, totalWithEmail };
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  await agentLog(supabase, "Pipeline", "⏰ Cron triggered — starting daily pipeline", "info");

  try {
    // ── Scout ───────────────────────────────────────────────────────────────
    const { totalFound, totalWithEmail } = await runScout(supabase);

    // ── Writer: write emails for new leads ──────────────────────────────────
    const { data: newLeads } = await supabase.from("outreach_leads").select("*").eq("status", "new");
    let writerCount = 0;
    if (newLeads?.length) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      for (const lead of newLeads) {
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
          await supabase.from("outreach_leads")
            .update({ status: "email_ready", email_body: emailBody, email_subject: subject })
            .eq("id", lead.id);
          await agentLog(supabase, "Writer", `✓ Email ready for ${lead.business_name ?? lead.email}`, "success");
          writerCount++;
        } catch (e: any) {
          await agentLog(supabase, "Writer", `✗ Failed: ${e.message}`, "error");
        }
      }
    } else {
      await agentLog(supabase, "Writer", "No new leads to process", "info");
    }

    // ── Sender: send ready emails ────────────────────────────────────────────
    const { data: readyLeads } = await supabase.from("outreach_leads").select("*").eq("status", "email_ready").not("email", "is", null);
    let senderCount = 0;
    for (const lead of readyLeads ?? []) {
      if (!lead.email) continue;
      try {
        const body = (lead.email_body ?? "").replace(/\[SIGNUP_LINK\]/g, "https://demand-pilot.vercel.app");
        await sendEmail({ to: lead.email, subject: lead.email_subject ?? "Free quoting tool for UK tradespeople", text: body });
        await supabase.from("outreach_leads").update({ status: "email_sent", email_sent_at: new Date().toISOString() }).eq("id", lead.id);
        await agentLog(supabase, "Sender", `✓ Sent to ${lead.email}`, "success");
        senderCount++;
        await new Promise(r => setTimeout(r, 200));
      } catch (e: any) {
        await agentLog(supabase, "Sender", `✗ Failed → ${lead.email}: ${e.message}`, "error");
      }
    }

    // ── Reporter: daily summary ───────────────────────────────────────────────
    const { data: allLeads } = await supabase.from("outreach_leads").select("status");
    const total = allLeads?.length ?? 0;
    const byStatus = (s: string) => allLeads?.filter(l => l.status === s).length ?? 0;

    const report = [
      `📊 Demand Pilot — Daily Outreach Report (${new Date().toLocaleDateString("en-GB")})`,
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
      ``,
      `Tonight's run: Scout found ${totalFound} leads (${totalWithEmail} with emails), Writer processed ${writerCount}, Sender delivered ${senderCount}.`,
    ].join("\n");

    await sendEmail({
      to: "pryeralex492@gmail.com",
      subject: `📊 Agent Report — ${new Date().toLocaleDateString("en-GB")}`,
      text: report,
    });

    await agentLog(supabase, "Reporter", `✓ Daily report sent`, "success");
    await agentLog(supabase, "Pipeline", `✅ Cron complete — Writer: ${writerCount}, Sender: ${senderCount}`, "success");

    return NextResponse.json({ ok: true, writer: writerCount, sender: senderCount });
  } catch (e: any) {
    await agentLog(supabase, "Pipeline", `✗ Cron crashed: ${e.message}`, "error");
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
