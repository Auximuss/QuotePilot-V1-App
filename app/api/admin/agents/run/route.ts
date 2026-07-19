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
// Searches Checkatrade directly (no Google API needed):
// 1. Hits Checkatrade search for each trade in Nottingham
// 2. Extracts trader profile URLs from the HTML
// 3. Fetches each profile to find their own website
// 4. Hunter.io on their website to get email
async function runScout(supabase: SupabaseClient) {
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing HUNTER_API_KEY env var", "error");
    return { message: "Missing Hunter API key" };
  }

  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.5",
  };

  const TRADES = [
    { trade: "plumber",          query: "plumber" },
    { trade: "electrician",      query: "electrician" },
    { trade: "builder",          query: "builder" },
    { trade: "roofer",           query: "roofer" },
    { trade: "plasterer",        query: "plasterer" },
    { trade: "carpenter",        query: "carpenter" },
    { trade: "gas engineer",     query: "gas-engineer" },
    { trade: "heating engineer", query: "heating-engineer" },
  ];

  const LOCATIONS = ["Nottingham", "NG1", "NG2", "NG3", "NG5", "NG7", "NG8", "NG9"];

  let totalFound = 0;
  let totalWithEmail = 0;

  await agentLog(supabase, "Scout", `🔍 Searching Checkatrade directly for ${TRADES.length} trades in Nottingham...`, "info");

  for (const { trade, query } of TRADES) {
    for (const location of LOCATIONS.slice(0, 3)) {
      try {
        // Checkatrade search URL
        const searchUrl = `https://www.checkatrade.com/search?tradeName=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`;

        const searchRes = await fetch(searchUrl, {
          headers: HEADERS,
          signal: AbortSignal.timeout(8000),
        });

        if (!searchRes.ok) {
          await agentLog(supabase, "Scout", `Checkatrade returned ${searchRes.status} for ${trade} in ${location}`, "info");
          continue;
        }

        const html = await searchRes.text();

        // Extract trader profile URLs from search results
        const profileMatches = [...html.matchAll(/href="(\/trades\/[A-Za-z0-9_-]+)"/g)];
        const profilePaths = [...new Set(profileMatches.map(m => m[1]))].slice(0, 5);

        if (!profilePaths.length) {
          await agentLog(supabase, "Scout", `No profiles found for ${trade} in ${location} — Checkatrade may be JS-rendered`, "info");
          continue;
        }

        await agentLog(supabase, "Scout", `Found ${profilePaths.length} profiles for ${trade} in ${location}`, "info");

        for (const profilePath of profilePaths) {
          const profileUrl = `https://www.checkatrade.com${profilePath}`;
          try {
            // Skip already stored
            const { data: existing } = await supabase
              .from("outreach_leads").select("id").ilike("notes", `%${profilePath}%`).limit(1);
            if (existing?.length) continue;

            // Fetch the trader's Checkatrade profile
            const profileRes = await fetch(profileUrl, {
              headers: HEADERS,
              signal: AbortSignal.timeout(7000),
            });

            if (!profileRes.ok) continue;
            const profileHtml = await profileRes.text();

            // Extract business name
            const nameMatch =
              profileHtml.match(/<h1[^>]*>([^<]{3,60})<\/h1>/i) ??
              profileHtml.match(/"name"\s*:\s*"([^"]{3,60})"/);
            const businessName = nameMatch?.[1]?.trim().replace(/\s+(Ltd|Limited|LTD)\.?$/i, "") ?? profilePath.split("/").pop() ?? "Unknown";

            // Extract their own website from the profile
            const websiteMatch =
              profileHtml.match(/"websiteUrl"\s*:\s*"(https?:\/\/(?!(?:www\.)?checkatrade)[^"]{8,})"/i) ??
              profileHtml.match(/href="(https?:\/\/(?!(?:www\.)?checkatrade\.com)[^"]{8,})"[^>]*rel="nofollow"/i) ??
              profileHtml.match(/externalUrl['":\s]+"(https?:\/\/[^"']{8,})"/i);
            const traderWebsite = websiteMatch?.[1]?.split("?")[0] ?? null;

            // Hunter.io on their website
            let email: string | null = null;
            if (traderWebsite) {
              try {
                const domain = new URL(traderWebsite).hostname.replace(/^www\./, "");
                const hr = await fetch(
                  `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=5`
                );
                if (hr.ok) {
                  const hd = await hr.json();
                  const emails: any[] = hd.data?.emails ?? [];
                  email = (emails.find(e => /contact|info|hello|enquir|admin|quote|office/i.test(e.value)) ?? emails[0])?.value ?? null;
                }
              } catch {}
            }

            await supabase.from("outreach_leads").insert({
              business_name: businessName,
              trade,
              email,
              location,
              source: "scout",
              status: email ? "new" : "no_email",
              notes: profileUrl,
            });

            totalFound++;
            if (email) {
              totalWithEmail++;
              await agentLog(supabase, "Scout", `✓ ${businessName} — ${email}`, "success", { website: traderWebsite, trade });
            } else if (traderWebsite) {
              await agentLog(supabase, "Scout", `◎ ${businessName} — website found but no email on Hunter`, "info");
            } else {
              await agentLog(supabase, "Scout", `◎ ${businessName} — no website on their Checkatrade profile`, "info");
            }

            await new Promise(r => setTimeout(r, 400));
          } catch (e: any) {
            await agentLog(supabase, "Scout", `Error on ${profilePath}: ${e.message}`, "error");
          }
        }

        await new Promise(r => setTimeout(r, 600));
      } catch (e: any) {
        await agentLog(supabase, "Scout", `Search error (${trade} ${location}): ${e.message}`, "error");
      }
    }
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
