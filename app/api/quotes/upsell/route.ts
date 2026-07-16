import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ suggestions: [] });

  const { jobTitle, lineItems, trade } = await req.json();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You are a UK trade quoting assistant. Given a job and its line items, suggest 2-3 optional add-on services the customer might genuinely want. These should be realistic upsells a tradesperson would naturally offer.

Return ONLY valid JSON:
{
  "suggestions": [
    { "description": string, "reason": string, "estimatedPrice": number }
  ]
}

Rules:
- Max 3 suggestions
- Each suggestion must be relevant to the job
- "reason" is a short one-liner explaining why the customer might want it (e.g. "Worth doing while the wall is open")
- "estimatedPrice" is a rough UK market rate in GBP (integer)
- Do NOT suggest things already in the line items`,
        },
        {
          role: "user",
          content: JSON.stringify({ jobTitle, lineItems: lineItems.map((l: any) => l.desc), trade }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return NextResponse.json({ suggestions: [] });
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
