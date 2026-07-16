import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimiter";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

  const rateLimitKey = user?.id
    ? `transcribe:${user.id}`
    : `transcribe:ip:${request.headers.get("x-forwarded-for") ?? "unknown"}`;

  const { allowed, resetInSeconds } = checkRateLimit(rateLimitKey, 30, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${Math.ceil(resetInSeconds / 60)} minutes.` },
      { status: 429, headers: { "Retry-After": String(resetInSeconds) } }
    );
  }

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: "No audio file received." }, { status: 400 });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });

    return NextResponse.json({ transcript: transcription.text });
  } catch (err) {
    console.error("Whisper transcription failed:", err);
    return NextResponse.json(
      { error: "Couldn't transcribe that recording. Please try again." },
      { status: 502 }
    );
  }
}
