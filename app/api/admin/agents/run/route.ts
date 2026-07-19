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
// Tries multiple UK directories in order until one yields results.
// Each source is an older server-rendered PHP site (not JS-heavy like Checkatrade/Yell).
async function runScout(supabase: SupabaseClient) {
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing HUNTER_API_KEY env var", "error");
    return { message: "Missing Hunter API key" };
  }

  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    "Cache-Control": "no-cache",
  };

  const TRADES = [
    "plumber", "electrician", "builder", "roofer",
    "plasterer", "carpenter", "gas engineer", "heating engineer",
  ];

  let totalFound = 0;
  let totalWithEmail = 0;

  // ── Helper: find email via Hunter ──────────────────────────────────────────
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

  // ── Helper: store a lead ───────────────────────────────────────────────────
  async function storeLead(name: string, trade: string, website: string | null, sourceUrl: string) {
    const { data: existing } = await supabase
      .from("outreach_leads").select("id").ilike("notes", `%${sourceUrl}%`).limit(1);
    if (existing?.length) return; // already stored

    const email = website ? await hunterEmail(website) : null;

    const { error } = await supabase.from("outreach_leads").insert({
      business_name: name,
      trade,
      email,
      location: "Nottingham",
      source: "scout",
      status: email ? "new" : "no_email",
      notes: sourceUrl,
    });

    if (error) {
      await agentLog(supabase, "Scout", `✗ DB insert failed: ${error.message}`, "error");
      return;
    }

    totalFound++;
    if (email) {
      totalWithEmail++;
      await agentLog(supabase, "Scout", `✓ ${name} — ${email}`, "success", { website, trade });
    } else {
      await agentLog(supabase, "Scout", `◎ ${name} — ${website ? "no email on Hunter" : "no website found"}`, "info");
    }
    await new Promise(r => setTimeout(r, 400));
  }

  // ── Source 1: FreeIndex ────────────────────────────────────────────────────
  async function scrapeFreeIndex(trade: string): Promise<boolean> {
    try {
      const url = `https://www.freeindex.co.uk/search.htm?q=${encodeURIComponent(trade)}&locality=Nottingham`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        await agentLog(supabase, "Scout", `FreeIndex ${res.status} for ${trade}`, "info");
        return false;
      }
      const html = await res.text();

      // FreeIndex profile links: /profile(number)/slug/
      const matches = [...html.matchAll(/href="(\/profile\([0-9]+\)\/[^"?#]+)"/g)];
      const paths = [...new Set(matches.map(m => m[1]))].slice(0, 8);

      if (!paths.length) {
        await agentLog(supabase, "Scout", `FreeIndex: no profiles for ${trade} — ${html.slice(0, 100).replace(/\s+/g, " ")}`, "info");
        return false;
      }

      await agentLog(supabase, "Scout", `FreeIndex: ${paths.length} profiles for ${trade}`, "info");

      for (const path of paths) {
        const profileUrl = `https://www.freeindex.co.uk${path}`;
        try {
          const pr = await fetch(profileUrl, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
          if (!pr.ok) continue;
          const ph = await pr.text();

          const nameMatch = ph.match(/<h1[^>]*>([^<]{2,80})<\/h1>/i) ?? ph.match(/"name"\s*:\s*"([^"]{2,80})"/);
          const name = nameMatch?.[1]?.trim().replace(/\s+(Ltd|Limited)\.?$/i, "") ?? path.split("/").pop() ?? "Unknown";

          const webMatch =
            ph.match(/href="(https?:\/\/(?!(?:www\.)?freeindex)[^"]{8,})"[^>]*(?:rel="nofollow"|class="[^"]*website)/i) ??
            ph.match(/<a[^>]+href="(https?:\/\/(?!(?:www\.)?freeindex)[^"]{8,})"[^>]*>(?:[^<]*)?[Ww]ebsite/i);
          const website = webMatch?.[1]?.split("?")[0] ?? null;

          await storeLead(name, trade, website, profileUrl);
        } catch {}
      }
      return true;
    } catch (e: any) {
      await agentLog(supabase, "Scout", `FreeIndex error (${trade}): ${e.message}`, "error");
      return false;
    }
  }

  // ── Source 2: Scoot ────────────────────────────────────────────────────────
  async function scrapeScoot(trade: string): Promise<boolean> {
    try {
      const url = `https://www.scoot.co.uk/find/${encodeURIComponent(trade.replace(/ /g, "-"))}/in-Nottingham`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        await agentLog(supabase, "Scout", `Scoot ${res.status} for ${trade}`, "info");
        return false;
      }
      const html = await res.text();

      // Scoot business links: /find/{business-slug}/
      const matches = [...html.matchAll(/href="(\/gb\/[^"?#]{5,})"/g)];
      const paths = [...new Set(matches.map(m => m[1]).filter(p => p.split("/").length > 3))].slice(0, 8);

      if (!paths.length) {
        await agentLog(supabase, "Scout", `Scoot: no profiles for ${trade} — ${html.slice(0, 100).replace(/\s+/g, " ")}`, "info");
        return false;
      }

      await agentLog(supabase, "Scout", `Scoot: ${paths.length} profiles for ${trade}`, "info");

      for (const path of paths) {
        const profileUrl = `https://www.scoot.co.uk${path}`;
        try {
          const pr = await fetch(profileUrl, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
          if (!pr.ok) continue;
          const ph = await pr.text();

          const nameMatch = ph.match(/<h1[^>]*>([^<]{2,80})<\/h1>/i);
          const name = nameMatch?.[1]?.trim().replace(/\s+(Ltd|Limited)\.?$/i, "") ?? "Unknown";

          const webMatch = ph.match(/href="(https?:\/\/(?!(?:www\.)?scoot)[^"]{8,})"[^>]*rel="nofollow"/i);
          const website = webMatch?.[1]?.split("?")[0] ?? null;

          await storeLead(name, trade, website, profileUrl);
        } catch {}
      }
      return true;
    } catch (e: any) {
      await agentLog(supabase, "Scout", `Scoot error (${trade}): ${e.message}`, "error");
      return false;
    }
  }

  // ── Source 3: Hotfrog ──────────────────────────────────────────────────────
  async function scrapeHotfrog(trade: string): Promise<boolean> {
    try {
      const url = `https://www.hotfrog.co.uk/search/nottingham/${encodeURIComponent(trade.replace(/ /g, "+"))}`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        await agentLog(supabase, "Scout", `Hotfrog ${res.status} for ${trade}`, "info");
        return false;
      }
      const html = await res.text();

      const matches = [...html.matchAll(/href="(\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]{8,}\/?)"/g)];
      const paths = [...new Set(matches.map(m => m[1]).filter(p => !p.includes("search") && !p.includes("category")))].slice(0, 8);

      if (!paths.length) {
        await agentLog(supabase, "Scout", `Hotfrog: no profiles for ${trade} — ${html.slice(0, 100).replace(/\s+/g, " ")}`, "info");
        return false;
      }

      await agentLog(supabase, "Scout", `Hotfrog: ${paths.length} profiles for ${trade}`, "info");

      for (const path of paths) {
        const profileUrl = `https://www.hotfrog.co.uk${path}`;
        try {
          const pr = await fetch(profileUrl, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
          if (!pr.ok) continue;
          const ph = await pr.text();

          const nameMatch = ph.match(/<h1[^>]*>([^<]{2,80})<\/h1>/i);
          const name = nameMatch?.[1]?.trim().replace(/\s+(Ltd|Limited)\.?$/i, "") ?? "Unknown";

          const webMatch = ph.match(/href="(https?:\/\/(?!(?:www\.)?hotfrog)[^"]{8,})"[^>]*(?:rel="nofollow"|class="[^"]*website)/i);
          const website = webMatch?.[1]?.split("?")[0] ?? null;

          await storeLead(name, trade, website, profileUrl);
        } catch {}
      }
      return true;
    } catch (e: any) {
      await agentLog(supabase, "Scout", `Hotfrog error (${trade}): ${e.message}`, "error");
      return false;
    }
  }

  // ── Main: try each source per trade ───────────────────────────────────────
  await agentLog(supabase, "Scout", `🔍 Searching UK directories for ${TRADES.length} trades (FreeIndex → Scoot → Hotfrog)...`, "info");

  for (const trade of TRADES) {
    const found =
      await scrapeFreeIndex(trade) ||
      await scrapeScoot(trade) ||
      await scrapeHotfrog(trade);

    if (!found) {
      await agentLog(supabase, "Scout", `⚠ All sources blocked/empty for ${trade}`, "error");
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
