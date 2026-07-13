import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimiter";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a quoting assistant for UK tradespeople. You will receive a raw voice transcript of a builder describing a job, and optionally a JSON array of their historical price-book rates.

Extract structured data and return ONLY valid JSON matching this exact shape, no other text:

{
  "job_title": string,
  "customer_summary": string,
  "scope_of_work": string[],
  "line_items": [
    {
      "category": "material" | "labour",
      "description": string,
      "quantity": number,
      "unit": string,
      "estimated_unit_price": number | null
    }
  ],
  "suggested_exclusions": string[],
  "clarifications_needed": string[],
  "confidence": number
}

Rules:
- If the business's price book includes a matching item, use that rate instead of guessing.
- If a quantity or price is genuinely unclear, set it to null rather than inventing a number.
- "confidence" is your own 0-100 estimate of how complete the transcript was for producing an accurate quote — lower it when key details (measurements, specification, exclusions) are missing.
- "clarifications_needed" should name the specific gaps driving that confidence score (e.g. "Worktop measurements not given", "Electrical specification not stated", "Flooring not mentioned").`;

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
