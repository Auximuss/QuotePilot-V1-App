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

// ── Scout ────────────────────────────────────────────────────────────────────
async function runScout(supabase: Supa) {
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    await agentLog(supabase, "Scout", "✗ Missing HUNTER_API_KEY", "error");
    return { totalFound: 0, totalWithEmail: 0 };
  }

  const SEED_LEADS = [
    { name: "Plumbers Notts",               trade: "plumber",     website: "https://www.plumbers-notts.co.uk" },
    { name: "BL Plumbers Nottingham",        trade: "plumber",     website: "https://blplumbersnottinghamltd.co.uk",   email: "blplumbers247@gmail.com" },
    { name: "MB Plumbing & Heating",         trade: "plumber",     website: "https://mbplumbers.co.uk" },
    { name: "DJA Plumbing and Heating",      trade: "plumber",     website: "https://djaplumbingandheating.co.uk" },
    { name: "Near Plumber Beeston",          trade: "plumber",     website: "https://nearplumber.co.uk",               email: "info@nearplumber.co.uk" },
    { name: "FWP Plumbers Nottingham",       trade: "plumber",     website: "https://www.fwpplumbersnottingham.co.uk" },
    { name: "Ben Plumber",                   trade: "plumber",     website: "https://www.benplumberltd.co.uk" },
    { name: "Andy the Plumber Stapleford",   trade: "plumber",     website: "https://staplefordplumber.co.uk" },
    { name: "RG Electrical Nottingham",      trade: "electrician", website: "https://electrician-nottingham.co.uk" },
    { name: "S O Campbell Electrical",       trade: "electrician", website: "https://www.socampbellelectrical.co.uk",  email: "info@socampbellelectrical.co.uk" },
    { name: "ADC Electrical",                trade: "electrician", website: "https://adcalltrade.co.uk" },
    { name: "Arnold Electrical",             trade: "electrician", website: "https://www.arnoldelectrical.com" },
    { name: "Wing Electrical",               trade: "electrician", website: "https://wingelectrical.co.uk" },
    { name: "Dennis Electrical",             trade: "electrician", website: "https://dennis-electrical.co.uk" },
    { name: "MT Electrical",                 trade: "electrician", website: "https://mt-electrical.co.uk" },
    { name: "Alpha Electricians",            trade: "electrician", website: "https://www.nottingham-electrician.co.uk" },
    { name: "Building Nottingham",           trade: "builder",     website: "https://www.building-nottingham.co.uk" },
    { name: "Nottingham Building & Roofing", trade: "builder",     website: "https://www.nottinghambuildingandroofing.co.uk" },
    { name: "Nottingham Gutters & Roofing",  trade: "roofer",      website: "https://www.nottinghamgutters.co.uk",     email: "info@nottinghamgutters.co.uk" },
    { name: "JTB Roofers Nottingham",        trade: "roofer",      website: "https://www.roofersofnottingham.co.uk" },
    { name: "B&S Roofing Nottingham",        trade: "roofer",      website: "https://bsroofingnottingham.co.uk" },
    { name: "D&S Roofing Contractors",       trade: "roofer",      website: "https://dandsroofingcontractors.co.uk" },
  ] as { name: string; trade: string; website: string; email?: string }[];

  let totalFound = 0, totalWithEmail = 0;
  await agentLog(supabase, "Scout", `🔍 Processing ${SEED_LEADS.length} verified Nottingham trade businesses...`, "info");

  for (const lead of SEED_LEADS) {
    const { data: ex } = await supabase.from("outreach_leads").select("id").ilike("notes", `%${lead.website}%`).limit(1);
    if (ex?.length) continue;

    let email = lead.email ?? null;
    if (!email) {
      try {
        const domain = new URL(lead.website).hostname.replace(/^www\./, "");
        const hr = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=5`, { signal: AbortSignal.timeout(7000) });
        if (hr.ok) {
          const hd = await hr.json();
          const emails: any[] = hd.data?.emails ?? [];
          email = (emails.find(e => /contact|info|hello|enquir|admin|quote|office/i.test(e.value)) ?? emails[0])?.value ?? null;
        }
      } catch {}
    }

    const { error } = await supabase.from("outreach_leads").insert({ business_name: lead.name, trade: lead.trade, email, location: "Nottingham", source: "scout", status: email ? "new" : "no_email", notes: lead.website });
    if (error) { await agentLog(supabase, "Scout", `✗ DB: ${error.message}`, "error"); continue; }
    totalFound++;
    if (email) { totalWithEmail++; await agentLog(supabase, "Scout", `✓ ${lead.name} — ${email}`, "success", { trade: lead.trade }); }
    else { await agentLog(supabase, "Scout", `◎ ${lead.name} — no email found`, "info"); }
    await new Promise(r => setTimeout(r, 500));
  }

  await agentLog(supabase, "Scout", `✅ ${totalFound} leads stored, ${totalWithEmail} with emails`, "success");
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
