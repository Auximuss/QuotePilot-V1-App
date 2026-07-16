import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ benchmark: null });

  const { jobTitle, total, trade, lineItems } = await req.json();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are a UK trade pricing expert. Given a job description, total quote value, and line items, estimate whether the price is competitive vs typical UK market rates.

Return ONLY valid JSON:
{
  "rating": "low" | "fair" | "high",
  "marketLow": number,
  "marketHigh": number,
  "summary": string
}

Rules:
- "rating": "low" = below typical market, "fair" = within 15% of typical, "high" = above typical market
- "marketLow" and "marketHigh" are the typical UK price range for this job in GBP
- "summary" is one short sentence (max 12 words) for the tradesperson, e.g. "Competitive rate for this scope of work" or "Slightly above average — ensure scope justifies it"
- Base estimates on 2024 UK regional averages for the trade type`,
        },
        {
          role: "user",
          content: JSON.stringify({ jobTitle, total, trade, lineItems: lineItems.map((l: any) => l.desc) }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return NextResponse.json({ benchmark: null });
    const parsed = JSON.parse(raw);
    return NextResponse.json({ benchmark: parsed });
  } catch {
    return NextResponse.json({ benchmark: null });
  }
}
