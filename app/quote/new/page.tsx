"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuote } from "@/lib/QuoteContext";
import { useTranslation } from "@/lib/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import ScreenHeader from "@/components/ScreenHeader";
import PrimaryButton from "@/components/PrimaryButton";

type Stage = "idle" | "recording" | "transcribing" | "generating";
type InputMode = "voice" | "text";

export default function NewQuotePage() {
  const router = useRouter();
  const { createDraftFromAi, businessName, isLoading } = useQuote();
  const { t } = useTranslation();

  // All hooks must be declared before any early return
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [textInput, setTextInput] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [genLabel, setGenLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [hasRates, setHasRates] = useState<boolean | null>(null); // null = still checking
  const [priceBookItems, setPriceBookItems] = useState<{ description: string; category: string; unit: string; unitPrice: number }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Guard: only redirect once context has finished loading
  useEffect(() => {
    if (!isLoading && businessName === "") router.replace("/settings?setup=1");
  }, [isLoading, businessName, router]);

  // Fresh Supabase check for rates — bypasses stale context cache
  useEffect(() => {
    if (isLoading || !businessName) return;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setHasRates(false); return; }
      const { data: biz } = await supabase.from("businesses").select("id").eq("owner_id", user.id).single();
      if (!biz) { setHasRates(false); return; }
      const { data: items, count } = await supabase.from("price_book_items").select("*", { count: "exact" }).eq("business_id", biz.id);
      setHasRates((count ?? 0) > 0);
      if (items) setPriceBookItems(items.map((i: any) => ({ description: i.description, category: i.category, unit: i.unit ?? "", unitPrice: i.unit_price })));
    })();
  }, [isLoading, businessName]);

  if (isLoading || businessName === "") return null;
  if (hasRates === null) return null; // still checking rates

  // Block quoting until at least one rate is set
  if (!hasRates) {
    return (
      <div className="flex min-h-screen flex-col">
        <ScreenHeader title="New Quote" back="/home" />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-hazard/10 border border-hazard/20">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff6a1f" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <h2 className="font-barlow text-xl font-bold">Set your rates first</h2>
          <p className="mt-2 text-sm text-textDim leading-relaxed max-w-[260px]">
            The AI prices jobs using your day rates and materials. Add at least one rate so quotes come out accurate.
          </p>
          <div className="mt-6 w-full rounded-xl border border-line bg-panel px-4 py-3.5 text-left">
            <div className="font-barlow text-xs font-semibold uppercase tracking-wide text-textDim mb-2">Takes 2 minutes</div>
            <div className="flex items-start gap-3 mb-2.5">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-hazard/20 text-[10px] font-bold text-hazard">1</span>
              <span className="text-sm">Go to Settings → Rates</span>
            </div>
            <div className="flex items-start gap-3 mb-2.5">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-hazard/20 text-[10px] font-bold text-hazard">2</span>
              <span className="text-sm">Add your day rate or hourly rate</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-hazard/20 text-[10px] font-bold text-hazard">3</span>
              <span className="text-sm">Come back and generate your first quote</span>
            </div>
          </div>
          <button
            onClick={() => router.push("/settings?tab=pricebook")}
            className="mt-5 w-full rounded-xl bg-gradient-to-br from-hazard2 to-hazard py-3.5 font-barlow text-sm font-bold uppercase tracking-wide text-[#161006]"
          >
            Set Up My Rates →
          </button>
        </div>
      </div>
    );
  }

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

      recorder.start(100); // collect chunks every 100ms so no audio is lost at the start
      mediaRecorderRef.current = recorder;

      setStage("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error("Microphone access failed:", err);
      setError(
        "Couldn't access your microphone. Check that this site has permission in your browser settings."
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
      // Use the correct extension so Whisper knows the actual codec
      const ext = blob.type.includes("mp4") || blob.type.includes("m4a")
        ? "mp4"
        : blob.type.includes("ogg")
        ? "ogg"
        : blob.type.includes("wav")
        ? "wav"
        : "webm";
      formData.append("audio", blob, `recording.${ext}`);

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

  async function runGeneration(jobDescription: string) {
    setStage("generating");
    setGenLabel("Understanding the job…");
    setGenError(null);

    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: jobDescription,
          priceBook: priceBookItems.map((item) => ({
            description: item.description,
            category: item.category,
            unit: item.unit,
            unit_price: item.unitPrice,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error || "The AI couldn't generate a quote from that.";
        setGenError(msg);
        setStage("idle");
        return;
      }

      setGenLabel("Drafting scope & estimating pricing…");
      const result = await res.json();
      const id = createDraftFromAi(result);
      router.push(`/quote/review?id=${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setGenError(msg);
      setStage("idle");
    }
  }

  function handleMicTap() {
    if (stage === "idle") startRecording();
    else if (stage === "recording") stopRecording();
  }

  function handleTextSubmit() {
    if (!textInput.trim()) return;
    runGeneration(textInput.trim());
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (genError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-warn/40 bg-warn/10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e0c26b" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div className="font-barlow text-lg font-semibold">Generation failed</div>
        <div className="mt-2 max-w-[260px] text-xs text-textDim">{genError}</div>
        <button
          onClick={() => { setGenError(null); setStage("idle"); setTranscript(""); }}
          className="mt-5 rounded-xl bg-gradient-to-br from-hazard2 to-hazard px-6 py-2.5 font-barlow text-sm font-bold uppercase tracking-wide text-[#161006]"
        >
          {t.common.tryAgain}
        </button>
      </div>
    );
  }

  if (stage === "transcribing" || stage === "generating") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <div className="mb-7 h-20 w-20 animate-[spin_1.4s_linear_infinite]">
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#2e333a" strokeWidth={6} />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="#ff6a1f"
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray="140 214"
            />
          </svg>
        </div>
        <div className="font-barlow text-lg font-semibold">
          {stage === "transcribing" ? "Transcribing your recording…" : genLabel}
        </div>
        <div className="mt-2 text-xs text-textDim">
          {stage === "transcribing"
            ? "Listening to what you said"
            : "Talking to your AI model now"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title={t.quote.newTitle} back="/home" />

      {/* Mode toggle */}
      <div className="mx-5 mt-3 flex rounded-xl border border-line bg-panel p-1">
        <button
          onClick={() => { setInputMode("voice"); setError(null); }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-barlow text-sm font-semibold transition-colors ${
            inputMode === "voice"
              ? "bg-gradient-to-br from-hazard2 to-hazard text-[#161006]"
              : "text-textDim"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z"
              fill={inputMode === "voice" ? "#161006" : "currentColor"}
            />
            <path
              d="M19 11a7 7 0 01-14 0M12 18v3"
              stroke={inputMode === "voice" ? "#161006" : "currentColor"}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
          Voice
        </button>
        <button
          onClick={() => { setInputMode("text"); setError(null); }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-barlow text-sm font-semibold transition-colors ${
            inputMode === "text"
              ? "bg-gradient-to-br from-hazard2 to-hazard text-[#161006]"
              : "text-textDim"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
          </svg>
          Type
        </button>
      </div>

      {inputMode === "voice" ? (
        /* ---- Voice mode ---- */
        <div
          className="flex flex-1 flex-col items-center justify-between px-6 pb-8 pt-4"
          style={{ background: "radial-gradient(circle at 50% 34%, #241a12 0%, #121317 62%)" }}
        >
          <div className="flex w-full justify-between font-mono text-[11px] text-textDim">
            <span>VOICE NOTE</span>
            <span className="text-hazard">
              {mm}:{ss}
            </span>
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
                    height:
                      stage === "recording" ? [16, 38, 22, 52, 30, 58, 26, 44, 18][i] : 8,
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
                {stage === "recording"
                  ? t.quote.recording
                  : t.quote.orTypeBelow}
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
              <path
                d="M19 11a7 7 0 01-14 0M12 18v3"
                stroke="#161006"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        /* ---- Text mode ---- */
        <div className="flex flex-1 flex-col px-5 pb-8 pt-4">
          <p className="mb-3 text-xs text-textDim">
            Describe the job in plain English — include as much detail as you can about materials,
            scope, and any measurements.
          </p>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={t.quote.describeJob}
            rows={10}
            className="flex-1 rounded-xl border border-line bg-panel p-4 text-sm leading-relaxed text-paper placeholder:text-textDimmer focus:border-hazard focus:outline-none resize-none"
          />

          {error && (
            <div className="mt-3 rounded-lg border border-warn/40 bg-warn/15 px-3 py-2.5 text-[11.5px] text-[#e0c26b]">
              {error}
            </div>
          )}

          <PrimaryButton
            className="mt-4 w-full"
            onClick={handleTextSubmit}
            disabled={!textInput.trim() || stage === "generating"}
            icon={
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="#161006"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          >
            {stage === "generating" ? t.quote.generating : t.quote.generate}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
