import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ issues: [] });

  const { jobTitle, lineItems, total, customer, address, customerEmail, notes, checks, paymentTerms, exclusions } = await req.json();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are a UK trade quoting expert. Review a quote before it's sent to a customer and flag any issues that could cause problems, disputes, or lost money.

Return ONLY valid JSON:
{
  "score": number,
  "issues": [
    { "severity": "high" | "medium" | "low", "message": string }
  ]
}

Rules:
- "score" is 0-100 (100 = perfect quote)
- Check for: missing customer email, missing address, no payment terms stated, no exclusions, suspiciously low total, missing deposit, vague job description, no clarifications needed flagged
- "message" must be actionable and specific (e.g. "No customer email — you won't be able to send this quote")
- Max 5 issues
- Only flag real problems, not nitpicks`,
        },
        {
          role: "user",
          content: JSON.stringify({ jobTitle, lineItems: lineItems.map((l: any) => l.desc), total, customer, address, customerEmail, notes, checks, paymentTerms, exclusions }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return NextResponse.json({ score: 100, issues: [] });
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ score: 100, issues: [] });
  }
}
