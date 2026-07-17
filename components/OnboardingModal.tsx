"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function sb() { return createClient(); }

const LS_KEY = "dp_onboarded";

export default function OnboardingModal() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [saving, setSaving] = useState(false);
  const [shareLink, setShareLink] = useState("");

  useEffect(() => {
    // Only show if never completed onboarding
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LS_KEY)) return;

    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      const { data } = await sb().from("businesses").select("name, id").eq("owner_id", user.id).single();
      // Show onboarding if business name is missing
      if (!data?.name) {
        setShareLink(`${window.location.origin}/request/${data?.id ?? ""}`);
        setShow(true);
      } else {
        // Already set up — mark as done silently
        localStorage.setItem(LS_KEY, "1");
      }
    })();
  }, []);

  async function saveName() {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), trade: trade.trim() }),
    });
    setSaving(false);
    setStep(1);
  }

  function finish() {
    localStorage.setItem(LS_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  const STEPS = [
    {
      icon: "🏗️",
      title: "Welcome to Demand Pilot",
      sub: "Let's get you set up in 30 seconds.",
    },
    {
      icon: "⚡",
      title: "How it works",
      sub: "Three things that'll save you hours every week.",
    },
    {
      icon: "🎉",
      title: "You're all set!",
      sub: "Ready to create your first quote.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-3xl border-t border-line bg-[#0e1012] px-6 pb-10 pt-6">

        {/* Step dots */}
        <div className="mb-6 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-hazard" : i < step ? "w-4 bg-hazard/40" : "w-4 bg-line"}`} />
          ))}
        </div>

        {/* Step 0 — Business name */}
        {step === 0 && (
          <div>
            <div className="mb-1 text-center text-4xl">{STEPS[0].icon}</div>
            <h2 className="mt-3 text-center font-barlow text-[22px] font-bold">{STEPS[0].title}</h2>
            <p className="mt-1 text-center text-[13px] text-textDim">{STEPS[0].sub}</p>

            <div className="mt-6 space-y-3">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-textDim">Your business name</div>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && name.trim() && saveName()}
                  placeholder="e.g. Smith Plumbing Ltd"
                  className="field"
                />
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-textDim">Your trade</div>
                <input
                  value={trade}
                  onChange={e => setTrade(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && name.trim() && saveName()}
                  placeholder="e.g. Plumber, Electrician, Builder…"
                  className="field"
                />
              </div>
            </div>

            <button
              onClick={saveName}
              disabled={!name.trim() || saving}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-hazard2 to-hazard py-3.5 font-barlow text-[15px] font-bold uppercase tracking-wide text-[#161006] shadow-[0_4px_16px_-2px_rgba(255,106,31,0.4)] disabled:opacity-40"
            >
              {saving ? "Saving…" : "Continue →"}
            </button>
          </div>
        )}

        {/* Step 1 — How it works */}
        {step === 1 && (
          <div>
            <div className="mb-1 text-center text-4xl">{STEPS[1].icon}</div>
            <h2 className="mt-3 text-center font-barlow text-[22px] font-bold">{STEPS[1].title}</h2>
            <p className="mt-1 text-center text-[13px] text-textDim">{STEPS[1].sub}</p>

            <div className="mt-6 space-y-3">
              {[
                { icon: "🎙️", title: "Speak a job description", sub: "AI turns it into a full priced quote in seconds." },
                { icon: "📲", title: "Send it via WhatsApp or email", sub: "Customer gets a link to view, accept, and sign." },
                { icon: "💰", title: "Track payments", sub: "Deposit, final payment, and 'Job done' — all in one place." },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3.5 rounded-2xl border border-line bg-panel px-4 py-3.5">
                  <span className="mt-0.5 text-2xl">{item.icon}</span>
                  <div>
                    <div className="font-semibold text-[13px]">{item.title}</div>
                    <div className="mt-0.5 text-[11.5px] text-textDim">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-hazard2 to-hazard py-3.5 font-barlow text-[15px] font-bold uppercase tracking-wide text-[#161006] shadow-[0_4px_16px_-2px_rgba(255,106,31,0.4)]"
            >
              Got it →
            </button>
          </div>
        )}

        {/* Step 2 — Done */}
        {step === 2 && (
          <div>
            <div className="mb-1 text-center text-4xl">{STEPS[2].icon}</div>
            <h2 className="mt-3 text-center font-barlow text-[22px] font-bold">{STEPS[2].title}</h2>
            <p className="mt-1 text-center text-[13px] text-textDim">
              Hi <span className="text-hazard font-semibold">{name}</span> — here's what to do first.
            </p>

            <div className="mt-6 space-y-3">
              <button
                onClick={() => { finish(); router.push("/quote/new"); }}
                className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-br from-hazard2 to-hazard px-5 py-4 shadow-[0_4px_16px_-2px_rgba(255,106,31,0.4)]"
              >
                <div className="text-left">
                  <div className="font-barlow text-[15px] font-bold text-[#161006]">Create your first quote</div>
                  <div className="text-[11px] text-[#161006]/70">Speak or type a job — takes 10 seconds</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#161006" strokeWidth={2.5}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </button>

              {shareLink && (
                <div className="rounded-2xl border border-line bg-panel px-4 py-3.5">
                  <div className="mb-1 text-[12px] font-semibold">Your customer request link</div>
                  <div className="mb-2.5 text-[11px] text-textDim">Share this so customers can request quotes from you directly.</div>
                  <div className="flex items-center gap-2 rounded-xl bg-panelRaised px-3 py-2">
                    <span className="flex-1 truncate font-mono text-[10px] text-textDim">{shareLink}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(shareLink)}
                      className="flex-none rounded-lg bg-line px-2.5 py-1 text-[10px] font-semibold"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button onClick={finish} className="mt-4 w-full text-center text-[11px] text-textDimmer underline">
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
