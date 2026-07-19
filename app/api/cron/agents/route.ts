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

// ── Scout (Yell.com scraper — server-rendered, no JS required) ───────────────
async function runScout(supabase: Supa) {
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing HUNTER_API_KEY", "error");
    return { totalFound: 0, totalWithEmail: 0 };
  }

  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
  };

  const SEARCHES = [
    { trade: "plumber",          slug: "plumber-nottingham" },
    { trade: "electrician",      slug: "electrician-nottingham" },
    { trade: "builder",          slug: "builder-nottingham" },
    { trade: "roofer",           slug: "roofer-nottingham" },
    { trade: "plasterer",        slug: "plasterer-nottingham" },
    { trade: "carpenter",        slug: "carpenter-nottingham" },
    { trade: "gas engineer",     slug: "gas-engineer-nottingham" },
    { trade: "heating engineer", slug: "heating-engineer-nottingham" },
  ];

  let totalFound = 0, totalWithEmail = 0;
  await agentLog(supabase, "Scout", `🔍 Searching Yell.com for ${SEARCHES.length} trades in Nottingham...`, "info");

  for (const { trade, slug } of SEARCHES) {
    try {
      const searchUrl = `https://www.yell.com/s/${slug}.html`;
      const searchRes = await fetch(searchUrl, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!searchRes.ok) {
        await agentLog(supabase, "Scout", `Yell returned ${searchRes.status} for ${slug}`, "info");
        continue;
      }

      const html = await searchRes.text();
      const bizMatches = [...html.matchAll(/href="(\/biz\/[^"?#]{10,}\/?)"/g)];
      const bizPaths = [...new Set(bizMatches.map(m => m[1]).filter(p => !p.includes("category")))].slice(0, 8);

      if (!bizPaths.length) {
        await agentLog(supabase, "Scout", `No listings found on Yell for "${slug}"`, "info");
        continue;
      }

      await agentLog(supabase, "Scout", `Found ${bizPaths.length} listings for ${trade}`, "info");

      for (const bizPath of bizPaths) {
        const bizUrl = `https://www.yell.com${bizPath}`;
        const { data: ex } = await supabase.from("outreach_leads").select("id").ilike("notes", `%${bizPath}%`).limit(1);
        if (ex?.length) continue;

        try {
          const bizRes = await fetch(bizUrl, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
          if (!bizRes.ok) continue;
          const bizHtml = await bizRes.text();

          const nameMatch =
            bizHtml.match(/<h1[^>]*itemprop="name"[^>]*>([^<]{2,80})<\/h1>/i) ??
            bizHtml.match(/<h1[^>]*>([^<]{2,80})<\/h1>/i) ??
            bizHtml.match(/"name"\s*:\s*"([^"]{2,80})"/);
          const businessName = nameMatch?.[1]?.trim().replace(/\s+(Ltd|Limited|LTD)\.?$/i, "") ?? "Unknown";

          const websiteMatch =
            bizHtml.match(/href="(https?:\/\/(?!(?:www\.)?yell\.com)[^"]{8,})"[^>]*(?:rel="nofollow"|class="[^"]*website[^"]*")/i) ??
            bizHtml.match(/"url"\s*:\s*"(https?:\/\/(?!(?:www\.)?yell)[^"]{8,})"/i);
          const traderWebsite = websiteMatch?.[1]?.split("?")[0] ?? null;

          let email: string | null = null;
          if (traderWebsite) {
            try {
              const domain = new URL(traderWebsite).hostname.replace(/^www\./, "");
              const hr = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=5`);
              if (hr.ok) {
                const hd = await hr.json();
                const emails: any[] = hd.data?.emails ?? [];
                email = (emails.find(e => /contact|info|hello|enquir|admin|quote|office/i.test(e.value)) ?? emails[0])?.value ?? null;
              }
            } catch {}
          }

          const { error: insertError } = await supabase.from("outreach_leads").insert({
            business_name: businessName, trade, email,
            location: "Nottingham", source: "scout",
            status: email ? "new" : "no_email", notes: bizUrl,
          });

          if (!insertError) {
            totalFound++;
            if (email) { totalWithEmail++; await agentLog(supabase, "Scout", `✓ ${businessName} — ${email}`, "success", { trade }); }
            else { await agentLog(supabase, "Scout", `◎ ${businessName} — ${traderWebsite ? "no email on Hunter" : "no website listed"}`, "info"); }
          }
          await new Promise(r => setTimeout(r, 500));
        } catch (e: any) {
          await agentLog(supabase, "Scout", `Error on ${bizPath}: ${e.message}`, "error");
        }
      }
      await new Promise(r => setTimeout(r, 700));
    } catch (e: any) {
      await agentLog(supabase, "Scout", `Search error (${slug}): ${e.message}`, "error");
    }
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
