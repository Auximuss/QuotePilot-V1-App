New-Item -ItemType Directory -Force -Path "app\api\quotes\transcribe" | Out-Null
$content = @'
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
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

'@
Set-Content -Path "app\api\quotes\transcribe\route.ts" -Value $content -Encoding utf8 -NoNewline
Write-Host "Done - app\api\quotes\transcribe\route.ts written."