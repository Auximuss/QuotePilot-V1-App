"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useQuote } from "@/lib/QuoteContext";
import { useTranslation } from "@/lib/LanguageContext";
import QuoteCard from "@/components/QuoteCard";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import OnboardingModal from "@/components/OnboardingModal";

function sb() {
  return createClient();
}

type QuoteRequest = { id: string; customer_name: string; description: string; customer_phone: string; customer_email: string; created_at: string; };

export default function HomePage() {
  const router = useRouter();
  const { quotes, stats, unseenAcceptedQuotes, dismissAcceptanceBanner, businessName } = useQuote();
  const { t } = useTranslation();
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [usageTier, setUsageTier] = useState<string>("free");
  const [sentThisMonth, setSentThisMonth] = useState(0);
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(null);
  const [usageDismissed, setUsageDismissed] = useState(false);
  const isAdminUser = usageTier === "admin";

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setUsageTier(d.tier ?? "free");
          setSentThisMonth(d.sentThisMonth ?? 0);
          setMonthlyLimit(d.limit);
        }
      })
      .catch(() => {});
  }, []);

  // Quotes needing a chase (sent > 5 days ago, no response)
  const now = Date.now();
  const chaseQuotes = quotes.filter((q) => {
    if (q.status !== "sent" || !q.sentAt) return false;
    const daysSince = (now - new Date(q.sentAt).getTime()) / 86_400_000;
    return daysSince >= 5;
  }).slice(0, 3);

  // Load inbound quote requests
  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      const { data: biz } = await sb().from("businesses").select("id").eq("owner_id", user.id).single();
      if (!biz) return;
      const { data } = await sb().from("quote_requests").select("*").eq("business_id", biz.id).eq("status", "new").order("created_at", { ascending: false }).limit(5);
      if (data) setRequests(data as QuoteRequest[]);
    })();
  }, []);

  async function dismissRequest(reqId: string) {
    await sb().from("quote_requests").update({ status: "seen" }).eq("id", reqId);
    setRequests((prev) => prev.filter((r) => r.id !== reqId));
  }

  const recent = [...quotes]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="flex min-h-screen flex-col">
      <OnboardingModal />
      <TopBar
        title={t.home.title}
        subtitle={
          stats.hasAnyQuotes
            ? `${stats.outstandingCount} ${t.home.outstandingQuotes} · ${quotes.filter((q) => q.status === "accepted").length} ${t.status.accepted}`
            : t.home.noQuotes
        }
      />
      {businessName === "" && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-hazard/30 bg-hazard/8 px-4 py-3.5">
          <svg width="18" height="18" className="mt-0.5 flex-none text-hazard" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <div className="flex-1">
            <div className="font-barlow text-[14px] font-bold">{t.settings.completeSetup}</div>
            <div className="mt-0.5 text-[11px] text-textDim">{t.settings.completeSetupSub}</div>
            <a href="/settings" className="mt-2 block font-barlow text-[12px] font-bold text-hazard">
              Complete setup →
            </a>
          </div>
        </div>
      )}
      {isAdminUser && (
        <div className="mx-5 mb-2">
          <button
            onClick={() => router.push("/admin")}
            className="flex w-full items-center justify-between rounded-xl border border-hazard/40 bg-hazard/10 px-4 py-2.5"
          >
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff6a1f" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span className="font-barlow text-[13px] font-bold text-hazard">Admin Panel</span>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff6a1f" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
      )}
      <div className="flex-1 px-5 pb-6 pt-2">
        <div className="mt-4 flex gap-2.5">
          <StatCard label={t.home.revenueThisMonth} value={`£${stats.revenueThisMonth.toLocaleString("en-GB")}`} />
          <StatCard label={t.home.acceptanceRate} value={stats.acceptanceRate === null ? "—" : `${stats.acceptanceRate}%`} />
        </div>
        <div className="mt-2.5 flex gap-2.5">
          <StatCard label={t.home.outstandingQuotes} value={`${stats.outstandingCount}`} />
          <StatCard
            label={t.home.depositsWaiting}
            value={stats.depositsWaiting > 0 ? `£${stats.depositsWaiting.toLocaleString("en-GB")}` : "£0"}
          />
        </div>

        {unseenAcceptedQuotes.map((q) => (
          <div
            key={q.id}
            className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-ok/40 bg-gradient-to-r from-ok/15 to-ok/5 px-3 py-2.5"
          >
            <div className="flex h-6.5 w-6.5 items-center justify-center rounded-full bg-ok/20">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M4 12l5 5L20 6" stroke="#3fae5c" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold">🎉 {q.customer || "Customer"} accepted {q.job}</div>
              <div className="text-[10.5px] text-textDim">Quote #{q.id}</div>
            </div>
            <button onClick={() => dismissAcceptanceBanner(q.id)} className="text-textDimmer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {/* Usage banner — shown when at limit or on last quote (never for admin) */}
        {!usageDismissed && !isAdminUser && monthlyLimit !== null && sentThisMonth >= monthlyLimit - 1 && (
          <div className={`mt-4 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 ${
            sentThisMonth >= monthlyLimit
              ? "border-red-500/30 bg-red-500/10"
              : "border-warn/30 bg-warn/10"
          }`}>
            <div className="flex-1 min-w-0">
              <div className={`text-[12.5px] font-semibold ${sentThisMonth >= monthlyLimit ? "text-red-400" : "text-warn"}`}>
                {sentThisMonth >= monthlyLimit
                  ? t.home.limitReached
                  : `${t.home.lastQuote} (${sentThisMonth}/${monthlyLimit} used)`}
              </div>
              <div className="mt-0.5 text-[10.5px] text-textDim">
                {sentThisMonth >= monthlyLimit
                  ? "You won't be able to send new quotes until you upgrade or next month."
                  : "You have 1 quote left. Upgrade for more."}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-none">
              <button
                onClick={() => router.push("/settings")}
                className="rounded-lg bg-hazard px-3 py-1.5 font-barlow text-[11px] font-bold uppercase tracking-wide text-[#161006]"
              >
                {t.common.upgrade}
              </button>
              <button onClick={() => setUsageDismissed(true)} className="text-textDimmer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* Onboarding card — shown only when no quotes exist yet */}
        {!stats.hasAnyQuotes && (
          <div className="mt-4 rounded-2xl border border-hazard/20 bg-gradient-to-br from-hazard/8 to-transparent p-4">
            <div className="mb-3 font-barlow text-[15px] font-bold">{t.home.getStarted}</div>
            <div className="space-y-2.5">
              {[
                { icon: "🏢", label: t.home.step1, sub: t.home.step1sub, done: businessName !== "" },
                { icon: "🎙️", label: t.home.step2, sub: t.home.step2sub, done: false },
                { icon: "📤", label: t.home.step3, sub: t.home.step3sub, done: false },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm ${step.done ? "bg-ok/20" : "bg-[#1e2229]"}`}>
                    {step.done ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="#3fae5c" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : step.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12.5px] font-semibold ${step.done ? "text-textDim line-through" : ""}`}>{step.label}</div>
                    <div className="text-[10.5px] text-textDim">{step.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAB spacer — keeps content from hiding behind the fixed button */}
        <div className="h-16" />

        {/* Inbound quote requests */}
        {requests.length > 0 && (
          <>
            <div className="mb-2.5 mt-6 font-mono text-[10.5px] uppercase tracking-wider text-textDim flex items-center gap-2">
              <span>{t.home.newRequests}</span>
              <span className="rounded-full bg-hazard/20 px-1.5 py-0.5 text-[9px] text-hazard font-bold">{requests.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {requests.map((req) => (
                <div key={req.id} className="rounded-xl border border-hazard/30 bg-hazard/5 px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold truncate">{req.customer_name}</div>
                      <div className="mt-0.5 text-[11px] text-textDim line-clamp-2">{req.description}</div>
                      {req.customer_phone && (
                        <div className="mt-1 text-[10.5px] text-textDimmer">{req.customer_phone}</div>
                      )}
                    </div>
                    <button onClick={() => dismissRequest(req.id)} className="flex-none text-textDimmer mt-0.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => router.push(`/quote/new?customer=${encodeURIComponent(req.customer_name)}&job=${encodeURIComponent(req.description)}`)}
                      className="flex-1 rounded-lg bg-hazard py-2 font-barlow text-[12px] font-bold uppercase tracking-wide text-[#161006]"
                    >
                      {t.home.quoteThemButton}
                    </button>
                    {req.customer_phone && (
                      <a
                        href={`https://wa.me/${req.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${req.customer_name}, thanks for your quote request. I'll be in touch shortly.`)}`}
                        target="_blank" rel="noopener"
                        className="flex items-center gap-1.5 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2 text-[12px] font-bold text-[#25D366]"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Follow-up reminders */}
        {chaseQuotes.length > 0 && (
          <>
            <div className="mb-2.5 mt-6 font-mono text-[10.5px] uppercase tracking-wider text-textDim flex items-center gap-2">
              <span>{t.home.chaseUp}</span>
              <span className="rounded-full bg-warn/20 px-1.5 py-0.5 text-[9px] text-warn font-bold">{chaseQuotes.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {chaseQuotes.map((q) => {
                const daysSince = Math.floor((now - new Date(q.sentAt!).getTime()) / 86_400_000);
                const waMsg = `Hi ${q.customer || "there"}, just following up on the quote I sent you for ${q.job}. Let me know if you have any questions! 👍`;
                return (
                  <div key={q.id} className="rounded-xl border border-warn/30 bg-warn/5 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold truncate">{q.customer || "No name"}</div>
                        <div className="mt-0.5 text-[11px] text-textDim truncate">{q.job}</div>
                        <div className="mt-0.5 text-[10px] text-warn">{t.home.sentAgo.replace("{n}", String(daysSince))}</div>
                      </div>
                      <div className="text-right flex-none">
                        <div className="text-[13px] font-mono text-hazard">£{q.lineItems.reduce((s, i) => s + i.price, 0).toLocaleString("en-GB")}</div>
                      </div>
                    </div>
                    <div className="mt-2.5 flex gap-2">
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(waMsg)}`}
                        target="_blank" rel="noopener"
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] py-2 font-barlow text-[12px] font-bold uppercase tracking-wide text-[#0d1a0f]"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                        {t.home.chaseViaWhatsapp}
                      </a>
                      <button
                        onClick={() => router.push(`/quote/send?id=${q.id}`)}
                        className="rounded-lg border border-line px-3 py-2 font-barlow text-[12px] font-bold uppercase tracking-wide text-textDim"
                      >
                        {t.common.view}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="mb-2.5 mt-6 font-mono text-[10.5px] uppercase tracking-wider text-textDim">
          {t.home.recent}
        </div>

        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-textDim">
            {t.home.noQuotes}
          </div>
        ) : (
          recent.map((q) => <QuoteCard key={q.id} quote={q} />)
        )}
      </div>

      {/* Floating New Quote button — always visible above bottom nav */}
      <div className="fixed bottom-[64px] left-0 right-0 flex justify-center pointer-events-none z-30">
        <button
          onClick={() => router.push("/quote/new")}
          className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-hazard px-6 py-3.5 shadow-lg shadow-hazard/30 font-barlow text-[14px] font-bold uppercase tracking-wide text-[#161006] active:scale-95 transition-transform"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" stroke="#161006" strokeWidth={2} />
            <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="#161006" strokeWidth={2} strokeLinecap="round" />
          </svg>
          {t.home.newQuote}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl border border-line bg-panel p-3">
      <div className="font-mono text-lg text-hazard">{value}</div>
      <div className="mt-0.5 text-[10px] text-textDim">{label}</div>
    </div>
  );
}
