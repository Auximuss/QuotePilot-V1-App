import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimiter";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a quoting assistant for UK tradespeople (builders, plumbers, electricians, decorators, tilers, landscapers, etc.). You will receive a raw voice transcript of a tradesperson describing a job, and optionally a JSON array of their price-book rates.

Extract structured data and return ONLY valid JSON matching this exact shape, no other text:

{
  "job_title": string,
  "customer_summary": string,
  "scope_of_work": string[],
  "line_items": [
    {
      "category": "material" | "labour",
      "description": string,
      "quantity": number | null,
      "unit": string,
      "estimated_unit_price": number | null
    }
  ],
  "suggested_exclusions": string[],
  "clarifications_needed": string[],
  "confidence": number
}

MEASUREMENT RULES — this is critical:
- Always extract the exact number and unit the tradesperson says. Examples:
  - "30 square feet of tiling" → quantity: 30, unit: "sq ft"
  - "30 square metres of decking" → quantity: 30, unit: "m²"
  - "15 linear metres of skirting" → quantity: 15, unit: "lin m"
  - "3 coats on 2 walls" → quantity: 2, unit: "walls"
  - "fit 8 spotlights" → quantity: 8, unit: "lights"
  - "supply and fit a new boiler" → quantity: 1, unit: "unit"
- Common area units: "square feet", "sq ft", "sqft", "square metres", "sq m", "m2", "m²"
- Common length units: "metres", "m", "feet", "ft", "linear metres", "lin m"
- If they say a measurement in passing ("the room is 30 sq ft"), use it as quantity for the relevant line item.
- Never convert between imperial and metric — keep what the tradesperson said.
- Split into separate line items for labour and materials.

LABOUR ESTIMATION RULES — critical:
- The price book gives you the RATE (price per unit). You must estimate the QUANTITY (how many days/hours) yourself based on job complexity.
- Estimate realistically for UK trades. Examples:
  - Full bathroom renovation (strip out, re-tile, new suite, plumbing): 5–7 days
  - Fit a single radiator: 0.5 days
  - Rewire a 3-bed house: 5–8 days
  - Lay laminate flooring in one room: 1 day
  - Paint one room (2 coats): 1–1.5 days
  - New kitchen fit (units, worktop, appliances): 3–5 days
  - Replace a boiler: 1–2 days
- If the price book has a "per day" rate, estimate days. If it has an "hourly" rate, estimate hours.
- If the price book only has a "half day" rate, express quantity in half-days (e.g. a 3-day job = 6 half days).
- NEVER use quantity 1 for a multi-day job just because you only have one rate in the price book.

PRICING RULES:
- Price book rates: use the matching rate from the price book for labour. The price book unit tells you what the rate covers (per day, per hour, per half day, per m², etc.).
- For materials NOT in the price book, use realistic UK supply prices as your best estimate — do NOT leave at null or 0. Examples:
  - Porcelain/ceramic tiles: £20–£50 per m²
  - Plasterboard (per sheet): £10–£15
  - Copper pipe (per metre): £5–£8
  - Standard radiator: £60–£150 each
  - Toilet (close-coupled): £100–£250
  - Basin + vanity unit: £150–£400
  - Walk-in shower tray + screen: £300–£700
  - Heated towel rail: £80–£200
  - Extractor fan: £30–£80
  - Underfloor heating kit (per m²): £25–£50
  - Emulsion paint (per litre): £5–£12
  - Skirting board (per metre): £4–£8
  - Door (internal): £60–£150
  - Aggregate/sand (per tonne): £40–£80
- Use mid-range prices unless the tradesperson specifies premium or budget materials.
- Only set estimated_unit_price to null if you genuinely cannot estimate (e.g. a bespoke custom item).

GENERAL RULES:
- "confidence" is your 0–100 estimate of how complete the transcript was — lower it when key details are missing.
- "clarifications_needed" should name specific gaps (e.g. "Room dimensions not stated", "Tile spec not given").
- Keep descriptions concise and professional — they appear on a customer-facing quote.`;

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  // ── Auth + rate limiting ────────────────────────────────────────────────────
  const supabase = createServiceClient();
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();

  // Fall back to IP if no user (shouldn't happen in normal use)
  const rateLimitKey = user?.id
    ? `generate:${user.id}`
    : `generate:ip:${request.headers.get("x-forwarded-for") ?? "unknown"}`;

  const { allowed, remaining, resetInSeconds } = checkRateLimit(rateLimitKey, 20, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${Math.ceil(resetInSeconds / 60)} minutes.` },
      { status: 429, headers: { "Retry-After": String(resetInSeconds), "X-RateLimit-Remaining": "0" } }
    );
  }

  const { transcript, priceBook } = await request.json();

  if (!transcript || typeof transcript !== "string") {
    return NextResponse.json({ error: "Missing 'transcript' string in request body." }, { status: 400 });
  }

  if (transcript.length > 5000) {
    return NextResponse.json({ error: "Transcript too long. Maximum 5,000 characters." }, { status: 400 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            transcript,
            price_book: priceBook ?? [],
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: "OpenAI returned an empty response." }, { status: 502 });
    }

    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("OpenAI quote generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate the quote. Please try again." },
      { status: 502 }
    );
  }
}

/*
  Client usage (see app/quote/new/page.tsx):

  const res = await fetch("/api/quotes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, priceBook }),
  });
  const quote = await res.json();

  Note on voice input: this route takes a text transcript. Actually
  capturing the builder's voice needs two more pieces which aren't wired
  up yet:
    1. Record audio client-side with the MediaRecorder API.
    2. POST the audio blob to a route that calls OpenAI's Whisper
       (audio.transcriptions.create) to get the transcript, then pass
       that transcript into this route.
  Right now app/quote/new/page.tsx still fakes the transcript text so you
  can test this endpoint end-to-end without building the recorder first.
*/
