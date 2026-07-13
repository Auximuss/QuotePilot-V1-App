New-Item -ItemType Directory -Force -Path "app\quote\new" | Out-Null
$content = @'
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuote } from "@/lib/QuoteContext";
import ScreenHeader from "@/components/ScreenHeader";

type Stage = "idle" | "recording" | "transcribing" | "generating";

export default function NewQuotePage() {
  const router = useRouter();
  const { createDraftFromAi } = useQuote();

  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [genLabel, setGenLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function startRecording() {
    setError(null);
    setTranscript("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        handleRecordingComplete(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;

      setStage("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error("Microphone access failed:", err);
      setError(
        "Couldn't access your microphone. Check that this site has permission to use it in your browser settings."
      );
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }

  async function handleRecordingComplete(blob: Blob) {
    setStage("transcribing");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      const res = await fetch("/api/quotes/transcribe", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't transcribe that recording.");
      }

      const { transcript: text } = await res.json();
      setTranscript(text);

      if (!text || !text.trim()) {
        setStage("idle");
        setError("Didn't catch anything — try again and speak clearly into the mic.");
        return;
      }

      await runGeneration(text);
    } catch (err) {
      setStage("idle");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function runGeneration(realTranscript: string) {
    setStage("generating");
    setGenLabel("Understanding the job…");

    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: realTranscript,
          priceBook: [], // TODO: pass this business's price_book_items from Supabase
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "The AI couldn't generate a quote from that.");
      }

      setGenLabel("Drafting scope & estimating pricing…");
      const result = await res.json();
      const id = createDraftFromAi(result);
      router.push(`/quote/review?id=${id}`);
    } catch (err) {
      setStage("idle");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handleMicTap() {
    if (stage === "idle") startRecording();
    else if (stage === "recording") stopRecording();
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (stage === "transcribing" || stage === "generating") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <div className="mb-7 h-20 w-20 animate-[spin_1.4s_linear_infinite]">
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#2e333a" strokeWidth={6} />
            <circle
              cx="40" cy="40" r="34" fill="none" stroke="#ff6a1f" strokeWidth={6}
              strokeLinecap="round" strokeDasharray="140 214"
            />
          </svg>
        </div>
        <div className="font-barlow text-lg font-semibold">
          {stage === "transcribing" ? "Transcribing your recording…" : genLabel}
        </div>
        <div className="mt-2 text-xs text-textDim">
          {stage === "transcribing" ? "Listening to what you said" : "Talking to your AI model now"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="New Quote" back="/home" />

      <div
        className="flex flex-1 flex-col items-center justify-between px-6 pb-8"
        style={{ background: "radial-gradient(circle at 50% 34%, #241a12 0%, #121317 62%)" }}
      >
        <div className="flex w-full justify-between font-mono text-[11px] text-textDim">
          <span>VOICE NOTE</span>
          <span className="text-hazard">{mm}:{ss}</span>
        </div>

        <div className="flex flex-col items-center">
          <div className="font-barlow text-xl font-semibold">
            {stage === "recording" ? "Listening" : "Tap to start"}
          </div>
          <div className="mt-1 max-w-[220px] text-center text-xs text-textDim">
            {stage === "recording"
              ? "Tap again when you're done"
              : "Talk through the job like you're telling the customer"}
          </div>

          <div className="my-5 flex h-14 items-center gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className={`block w-1 rounded-sm ${
                  stage === "recording" ? "animate-wavePulse bg-hazard" : "bg-lineLight"
                }`}
                style={{
                  height: stage === "recording" ? [16, 38, 22, 52, 30, 58, 26, 44, 18][i] : 8,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="min-h-[100px] w-full rounded-xl border border-line bg-panel p-3.5 text-xs leading-relaxed">
          {transcript ? (
            transcript
          ) : (
            <span className="text-textDimmer">
              {stage === "recording" ? "Recording… we'll show what you said once you stop." : "Your words will appear here…"}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-3 w-full rounded-lg border border-warn/40 bg-warn/15 px-3 py-2.5 text-[11.5px] text-[#e0c26b]">
            {error}
          </div>
        )}

        <button
          onClick={handleMicTap}
          className={`mt-3 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-hazard2 to-hazard shadow-[0_0_0_8px_#ff6a1f1f,0_10px_30px_-6px_rgba(255,106,31,0.6)] transition-transform active:scale-95 ${
            stage === "recording" ? "animate-micPulse from-[#ff8a6a] to-[#ff3b1f]" : ""
          }`}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" fill="#161006" />
            <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="#161006" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

'@
Set-Content -Path "app\quote\new\page.tsx" -Value $content -Encoding utf8 -NoNewline
Write-Host "Done - app\quote\new\page.tsx written."