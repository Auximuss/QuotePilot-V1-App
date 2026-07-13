"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIERS, TIER_ORDER, type Tier } from "@/lib/subscription";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<Tier | null>(null);

  async function handleUpgrade(tier: Tier) {
    if (tier === "free") return;
    setLoading(tier);

    const origin = window.location.origin;
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier,
        successUrl: `${origin}/settings?upgraded=1`,
        cancelUrl:  `${origin}/pricing`,
      }),
    });

    if (res.status === 401) {
      router.push("/auth/login");
      return;
    }

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error ?? "Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#141519] to-ink px-5 py-10">
      {/* Back */}
      <button onClick={() => router.back()} className="mb-8 flex items-center gap-1.5 self-start text-[12px] text-textDim">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Back
      </button>

      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-hazard2 to-hazard">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" fill="#161006" />
              <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="#161006" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-barlow text-[18px] font-bold">Demand Pilot</span>
        </div>
        <h1 className="font-barlow text-[26px] font-bold leading-tight">
          Simple, honest pricing
        </h1>
        <p className="mt-2 text-[13px] text-textDim">
          7-day free trial on all paid plans. Cancel anytime.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-3 py-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-ok">No charge for 7 days</span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3.5">
        {TIER_ORDER.map((tier) => {
          const cfg = TIERS[tier];
          const isFree = cfg.priceMonthly === null;
          const isHighlighted = cfg.highlight;

          return (
            <div
              key={tier}
              className={`relative overflow-hidden rounded-2xl border ${
                isHighlighted
                  ? "border-hazard/50 bg-gradient-to-br from-hazard/8 to-transparent"
                  : "border-line bg-panel"
              } p-5`}
            >
              {isHighlighted && (
                <div className="absolute right-3 top-3 rounded-full bg-hazard px-2.5 py-1 font-barlow text-[10px] font-bold uppercase tracking-wide text-[#161006]">
                  Most popular
                </div>
              )}

              <div className="flex items-end gap-2">
                <span className="font-barlow text-[22px] font-bold">{cfg.name}</span>
                {!isFree && (
                  <span className="mb-0.5 font-mono text-[13px] text-textDim">
                    £{cfg.priceMonthly}/mo
                  </span>
                )}
              </div>

              <div className="mt-0.5 text-[11.5px] text-textDim">
                {cfg.monthlyLimit === null ? "Unlimited sent quotes" : `${cfg.monthlyLimit} sent quotes per month`}
              </div>

              <div className="my-4 h-px bg-line" />

              <ul className="space-y-2">
                {cfg.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12.5px]">
                    <svg className="mt-0.5 flex-none text-ok" width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M4 12l5 5L20 6" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className={f.includes("coming soon") ? "text-textDimmer" : ""}>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => isFree ? router.push("/home") : handleUpgrade(tier)}
                disabled={loading === tier}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-barlow text-[15px] font-bold uppercase tracking-wide transition-all active:scale-[0.97] disabled:opacity-60 ${
                  isFree
                    ? "border border-line text-textDim"
                    : isHighlighted
                    ? "bg-gradient-to-r from-hazard2 to-hazard text-[#161006] shadow-[0_4px_16px_-2px_rgba(255,106,31,0.35)]"
                    : "bg-panel border border-line text-paper hover:border-hazard/50"
                }`}
              >
                {loading === tier ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" /> Redirecting…</>
                ) : isFree ? (
                  "Start free →"
                ) : (
                  `Try ${cfg.name} free →`
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-8 space-y-1.5 text-center">
        <p className="text-[11px] text-textDim">
          All paid plans renew monthly. Cancel any time from settings — no questions asked.
        </p>
        <p className="text-[11px] text-textDim">
          Payments secured by <span className="font-semibold text-[#635bff]">Stripe</span>. We never store card details.
        </p>
      </div>
    </div>
  );
}
