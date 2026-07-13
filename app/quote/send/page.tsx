"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useQuote } from "@/lib/QuoteContext";
import { useTranslation } from "@/lib/LanguageContext";
import { quoteTotal, depositAmountFor, quoteExpiryDate } from "@/lib/types";
import ScreenHeader from "@/components/ScreenHeader";

function sb() {
  return createClient();
}

// ── Types ──────────────────────────────────────────────────────────────────
type Variation = { id: string; description: string; amount: number; status: string; created_at: string };

// ── Page ───────────────────────────────────────────────────────────────────
function SendPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { getQuote, markSent, businessName, logoUrl, settings, duplicateQuote } = useQuote();
  const { t } = useTranslation();
  const [googleReviewLink, setGoogleReviewLink] = useState("");
  const quote = getQuote(id);

  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">(
    quote && quote.status !== "draft" ? "sent" : "idle"
  );
  const [showToast, setShowToast] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [bankDetails, setBankDetails] = useState({ account: "", paymentLink: "" });

  // ── Usage / paywall ────────────────────────────────────────────────────────
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [tier, setTier] = useState<string>("free");
  const [sentThisMonth, setSentThisMonth] = useState(0);
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setTier(d.tier ?? "free");
          setSentThisMonth(d.sentThisMonth ?? 0);
          setMonthlyLimit(d.limit);
        }
        setUsageLoaded(true);
      })
      .catch(() => setUsageLoaded(true));
  }, []);

  const atLimit = monthlyLimit !== null && sentThisMonth >= monthlyLimit;

  async function startCheckout(targetTier: string) {
    setCheckoutLoading(targetTier);
    const origin = window.location.origin;
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: targetTier,
        successUrl: `${origin}/settings?upgraded=1`,
        cancelUrl:  `${origin}/quote/send?id=${id}`,
      }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else { setCheckoutLoading(null); }
  }

  // Payment tracking
  const [depositPaid, setDepositPaid] = useState(false);
  const [depositPaidAt, setDepositPaidAt] = useState<string | null>(null);
  const [finalPaymentRequested, setFinalPaymentRequested] = useState(false);
  const [finalPaymentPaid, setFinalPaymentPaid] = useState(false);
  const [paymentActionLoading, setPaymentActionLoading] = useState<string | null>(null);

  // Job costing (for accepted quotes)
  const [actualMaterials, setActualMaterials] = useState("");
  const [actualHours, setActualHours] = useState("");
  const [hourlyRate, setHourlyRate] = useState("200");
  const [costSaved, setCostSaved] = useState(false);
  const [costLoading, setCostLoading] = useState(false);
  const [showCosting, setShowCosting] = useState(false);

  // Variations
  const [variations, setVariations] = useState<Variation[]>([]);
  const [showVariationForm, setShowVariationForm] = useState(false);
  const [varDesc, setVarDesc] = useState("");
  const [varAmount, setVarAmount] = useState("");
  const [varSaving, setVarSaving] = useState(false);

  // Load google review link and bank details — re-run on every focus so
  // changes saved in Settings are picked up without a full page reload
  useEffect(() => {
    async function loadBiz() {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      const { data } = await sb().from("businesses").select("google_review_link, bank_account, payment_link").eq("owner_id", user.id).single();
      if (data?.google_review_link) setGoogleReviewLink(data.google_review_link);
      if (data) {
        setBankDetails({
          account: (data as any).bank_account ?? "",
          paymentLink: (data as any).payment_link ?? "",
        });
      }
    }
    loadBiz();
    window.addEventListener("focus", loadBiz);
    return () => window.removeEventListener("focus", loadBiz);
  }, []);

  // Load existing job costing + variations + payment status for accepted quotes
  useEffect(() => {
    if (!quote || quote.status !== "accepted") return;
    (async () => {
      const { data: q } = await sb().from("quotes").select("actual_materials_cost,actual_hours,actual_hourly_rate,deposit_paid,deposit_paid_at,final_payment_requested,final_payment_paid").eq("id", id).single();
      if (q) {
        if (q.actual_materials_cost) setActualMaterials(String(q.actual_materials_cost));
        if (q.actual_hours) setActualHours(String(q.actual_hours));
        if (q.actual_hourly_rate) setHourlyRate(String(q.actual_hourly_rate));
        setDepositPaid(q.deposit_paid ?? false);
        setDepositPaidAt(q.deposit_paid_at ?? null);
        setFinalPaymentRequested(q.final_payment_requested ?? false);
        setFinalPaymentPaid(q.final_payment_paid ?? false);
      }
      const { data: vars } = await sb().from("variations").select("*").eq("quote_id", id).order("created_at");
      if (vars) setVariations(vars);
    })();
  }, [id, quote?.status]);

  if (!quote) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <div className="font-barlow text-lg font-semibold">Quote not found</div>
        <button onClick={() => router.push("/home")} className="mt-4 text-xs font-semibold text-hazard">Back to dashboard</button>
      </div>
    );
  }

  const total = quoteTotal(quote);
  const depositPct = settings.depositPercent;
  const deposit = depositAmountFor(quote, depositPct);
  const expiry = quoteExpiryDate(quote);
  const displayName = businessName || "My Business";
  const paymentTerms = settings.paymentTerms;
  const exclusions = settings.exclusions;
  const vatRegistered = settings.vatRegistered;
  const vatNumber = settings.vatNumber;
  const quoteLabel = quote.quoteNumber ?? `QUOTE #${quote.id.slice(0, 8).toUpperCase()}`;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/q/${quote.id}` : `/q/${quote.id}`;

  // Job costing maths
  const actualLabourCost = (parseFloat(actualHours) || 0) * (parseFloat(hourlyRate) || 0);
  const actualTotalCost = (parseFloat(actualMaterials) || 0) + actualLabourCost;
  const profit = total - actualTotalCost;
  const marginPct = total > 0 ? Math.round((profit / total) * 100) : 0;
  const variationsTotal = variations.filter((v) => v.status === "accepted").reduce((s, v) => s + v.amount, 0);

  function handleSend() {
    if (sendState === "sent") return;
    if (atLimit && quote!.status === "draft") { setShowPaywall(true); return; }
    setSendState("sending");
    setTimeout(() => {
      setSendState("sent");
      markSent(quote!.id);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2800);
    }, 850);
  }

  async function handleEmailSend() {
    if (atLimit && quote!.status === "draft") { setShowPaywall(true); return; }
    setEmailSending(true);
    setEmailResult(null);
    const res = await fetch(`/api/quotes/${id}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerEmail: emailInput || undefined }),
    });
    const data = await res.json();
    setEmailSending(false);
    if (!res.ok) {
      setEmailResult("error:" + (data.error || "Failed to send"));
    } else if (data.sent === false && data.reason === "no_api_key") {
      setEmailResult("no_key");
    } else {
      setEmailResult("sent");
      setSendState("sent");
      markSent(quote!.id);
    }
  }

  async function saveJobCosting() {
    setCostLoading(true);
    await sb().from("quotes").update({
      actual_materials_cost: parseFloat(actualMaterials) || null,
      actual_hours: parseFloat(actualHours) || null,
      actual_hourly_rate: parseFloat(hourlyRate) || null,
      completed_at: new Date().toISOString(),
    }).eq("id", id);
    setCostLoading(false);
    setCostSaved(true);
    setTimeout(() => setCostSaved(false), 1800);
  }

  async function raiseVariation() {
    if (!varDesc.trim()) return;
    setVarSaving(true);
    const { data } = await sb().from("variations").insert({
      quote_id: id,
      description: varDesc,
      amount: parseFloat(varAmount) || 0,
      status: "pending",
    }).select().single();
    if (data) setVariations((prev) => [...prev, data as Variation]);
    setVarDesc(""); setVarAmount(""); setVarSaving(false); setShowVariationForm(false);
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Paywall modal ─────────────────────────────────────────────────── */}
      {showPaywall && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm no-print">
          <div className="w-full max-w-lg rounded-t-3xl border-t border-line bg-panel p-6 pb-10">
            <div className="mb-1 flex items-center justify-between">
              <div className="font-barlow text-[18px] font-bold">Upgrade to send more</div>
              <button onClick={() => setShowPaywall(false)} className="text-textDimmer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <p className="mb-5 text-[12.5px] text-textDim">
              You&apos;ve used all <b className="text-paper">{monthlyLimit}</b> free quotes this month. Pick a plan to keep sending.
            </p>

            <div className="flex flex-col gap-3">
              {/* Trade */}
              <button
                onClick={() => startCheckout("trade")}
                disabled={checkoutLoading !== null}
                className="flex items-center justify-between rounded-2xl border border-line bg-panelRaised px-4 py-3.5 transition-all hover:border-hazard/50 active:scale-[0.97] disabled:opacity-60"
              >
                <div className="text-left">
                  <div className="font-barlow text-[15px] font-bold">Trade <span className="ml-1 font-mono text-[12px] font-normal text-textDim">£7.99/mo</span></div>
                  <div className="mt-0.5 text-[11.5px] text-textDim">50 sent quotes per month</div>
                </div>
                {checkoutLoading === "trade"
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-textDim border-t-paper" />
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                }
              </button>

              {/* Pro */}
              <button
                onClick={() => startCheckout("pro")}
                disabled={checkoutLoading !== null}
                className="flex items-center justify-between rounded-2xl border border-hazard/50 bg-gradient-to-r from-hazard/10 to-transparent px-4 py-3.5 transition-all active:scale-[0.97] disabled:opacity-60"
              >
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-barlow text-[15px] font-bold">Pro</span>
                    <span className="rounded-full bg-hazard/20 px-2 py-0.5 text-[9.5px] font-bold text-hazard">MOST POPULAR</span>
                    <span className="font-mono text-[12px] text-textDim">£14.99/mo</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-textDim">Unlimited quotes, all features</div>
                </div>
                {checkoutLoading === "pro"
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-hazard/30 border-t-hazard" />
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff6a1f" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                }
              </button>

              {/* Business */}
              <button
                onClick={() => startCheckout("business")}
                disabled={checkoutLoading !== null}
                className="flex items-center justify-between rounded-2xl border border-line bg-panelRaised px-4 py-3.5 transition-all hover:border-hazard/50 active:scale-[0.97] disabled:opacity-60"
              >
                <div className="text-left">
                  <div className="font-barlow text-[15px] font-bold">Business <span className="ml-1 font-mono text-[12px] font-normal text-textDim">£24.99/mo</span></div>
                  <div className="mt-0.5 text-[11.5px] text-textDim">Unlimited + team features</div>
                </div>
                {checkoutLoading === "business"
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-textDim border-t-paper" />
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                }
              </button>
            </div>

            <button onClick={() => router.push("/pricing")} className="mt-3 w-full text-center text-[11px] text-textDim underline">
              View full plan comparison
            </button>
          </div>
        </div>
      )}

      <div className="no-print">
        <ScreenHeader title={t.quote.sendTitle} back={`/quote/review?id=${quote.id}`} />
      </div>

      <div className="relative flex flex-1 flex-col items-center bg-[#08090a] p-4 print:bg-white print:p-0">
        {/* Quote document */}
        <div className="relative w-full overflow-hidden rounded bg-paper p-5 font-mono text-[#221d14] print:shadow-none">

          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-[#221d14] pb-2.5">
            <div>
              {logoUrl ? (
                <img src={logoUrl} alt={displayName} className="mb-1 h-10 max-w-[120px] object-contain" />
              ) : (
                <div className="font-archivo text-base">{displayName}</div>
              )}
              {vatRegistered && vatNumber && (
                <div className="mt-0.5 text-[8px] text-[#6b6252]">VAT No: {vatNumber}</div>
              )}
            </div>
            <div className="text-right text-[9.5px] leading-relaxed">
              <b className="text-[11.5px]">{quoteLabel}</b>
              <br />
              {new Date(quote.createdAt).toLocaleDateString("en-GB")}
            </div>
          </div>

          {/* Customer */}
          <div className="mt-3">
            <div className="text-[8.5px] uppercase tracking-wider text-[#6b6252]">For</div>
            <div className="font-work text-[10px] leading-relaxed">
              {quote.customer || "Customer name not set"} — {quote.job}
              {quote.address ? `, ${quote.address}` : ""}
            </div>
          </div>

          {/* Line items */}
          <div className="mt-3">
            <div className="text-[8.5px] uppercase tracking-wider text-[#6b6252]">Items</div>
            <table className="mt-1 w-full border-collapse">
              <tbody>
                {quote.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="border-b border-dashed border-[#c9c3b6] py-1 text-[9.5px]">{item.desc}</td>
                    <td className="border-b border-dashed border-[#c9c3b6] py-1 text-right text-[9.5px]">£{item.price.toLocaleString("en-GB")}</td>
                  </tr>
                ))}
                {variations.filter((v) => v.status === "accepted").map((v) => (
                  <tr key={v.id}>
                    <td className="border-b border-dashed border-[#c9c3b6] py-1 text-[9.5px] text-[#8b6c42]">Variation: {v.description}</td>
                    <td className="border-b border-dashed border-[#c9c3b6] py-1 text-right text-[9.5px] text-[#8b6c42]">£{v.amount.toLocaleString("en-GB")}</td>
                  </tr>
                ))}
                {quote.depositOn && (
                  <tr>
                    <td className="border-b border-dashed border-[#c9c3b6] py-1 text-[9.5px] text-hazard">Deposit due on acceptance ({depositPct}%)</td>
                    <td className="border-b border-dashed border-[#c9c3b6] py-1 text-right text-[9.5px] text-hazard">£{deposit.toLocaleString("en-GB")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="mt-3 flex justify-between border-t-2 border-[#221d14] pt-2.5 text-[12.5px] font-semibold">
            <span>{t.quote.total} {vatRegistered ? "exc. VAT" : "inc. VAT"}</span>
            <span>£{(total + variationsTotal).toLocaleString("en-GB")}</span>
          </div>
          {vatRegistered && (
            <div className="mt-2 space-y-1 border-t border-line pt-2 text-[11px]">
              <div className="flex justify-between text-textDim">
                <span>{t.quote.subtotal}</span>
                <span>£{total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-textDim">
                <span>{t.quote.vatAmount}</span>
                <span>£{(total * 0.2).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>{t.quote.totalIncVat}</span>
                <span className="text-hazard">£{(total * 1.2).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
          <div className="mt-1.5 text-right text-[8.5px] text-[#6b6252]">Valid until {expiry.toLocaleDateString("en-GB")}</div>

          {quote.notes && (
            <div className="mt-2 rounded border border-[#c9c3b6] px-2 py-1.5 text-[8.5px] text-[#6b6252]">{quote.notes}</div>
          )}
          {exclusions && (
            <div className="mt-2">
              <div className="text-[7.5px] uppercase tracking-wider text-[#6b6252]">Exclusions</div>
              <div className="mt-0.5 text-[8.5px] text-[#6b6252]">{exclusions}</div>
            </div>
          )}
          {paymentTerms && (
            <div className="mt-2 border-t border-dashed border-[#c9c3b6] pt-2">
              <div className="text-[7.5px] uppercase tracking-wider text-[#6b6252]">Payment terms</div>
              <div className="mt-0.5 text-[8.5px] text-[#6b6252]">{paymentTerms}</div>
            </div>
          )}

          {/* Payment link nudge */}
          {!settings.paymentLink && (
            <div className="no-print mt-3 flex items-center gap-2 rounded-lg border border-[#c9c3b6]/40 bg-[#f5f1eb] px-3 py-2 text-[#6b6252]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-none">
                <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
              </svg>
              <span className="text-[10px] leading-tight flex-1">
                Add a payment link in Settings so customers can pay online after accepting.
              </span>
              <button
                onClick={() => router.push("/settings")}
                className="flex-none text-[10px] font-semibold text-[#8b6c42] underline"
              >
                Set up →
              </button>
            </div>
          )}

          {/* Preview link */}
          <div className="no-print mt-2.5 text-center">
            <button onClick={() => window.open(`/q/${quote.id}`, "_blank")} className="font-mono text-[9px] text-[#6b6252] underline">
              👁 Preview as customer
            </button>
          </div>

          {/* Usage indicator */}
          {usageLoaded && quote.status === "draft" && (
            <div className={`no-print mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-[11px] ${atLimit ? "border border-warn/40 bg-warn/10 text-warn" : "border border-line bg-panelRaised text-[#6b6252]"}`}>
              <span>
                {atLimit
                  ? `Free limit reached — ${sentThisMonth}/${monthlyLimit} quotes sent this month`
                  : monthlyLimit === null
                    ? `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan — unlimited sends`
                    : `${sentThisMonth}/${monthlyLimit} free quotes used this month`}
              </span>
              {atLimit && (
                <button onClick={() => setShowPaywall(true)} className="ml-2 font-semibold text-hazard">
                  Upgrade →
                </button>
              )}
            </div>
          )}

          {/* Bank details warning */}
          {!bankDetails.account && !bankDetails.paymentLink && quote.status === "draft" && (
            <div className="no-print mb-2 flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] text-[#e0c26b]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              No bank details or payment link set — customers won&apos;t know how to pay.{" "}
              <a href="/settings" className="font-semibold text-hazard underline">Fix in settings →</a>
            </div>
          )}

          {/* Action buttons */}
          <div className="no-print mt-4 space-y-2">
            {/* Row 1: PDF + Invoice + Duplicate */}
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="flex-1 rounded-lg border-[1.5px] border-[#221d14] py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide">
                {t.quote.downloadPdf}
              </button>
              {quote.status === "accepted" && (
                <button onClick={() => router.push(`/invoice/${quote.id}`)} className="flex-1 rounded-lg border-[1.5px] border-[#221d14] py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide bg-[#221d14] text-paper">
                  {t.quote.invoice}
                </button>
              )}
              {(quote.status === "draft" || quote.status === "sent") && (
                <button
                  onClick={() => router.push(`/quote/review?id=${quote.id}`)}
                  className="flex-none rounded-lg border-[1.5px] border-[#221d14] px-3 py-2.5 font-barlow text-[12px] font-bold uppercase tracking-wide"
                >
                  {t.common.edit}
                </button>
              )}
              <button
                onClick={async () => {
                  const newId = await duplicateQuote(quote.id);
                  if (newId) router.push(`/quote/send?id=${newId}`);
                }}
                className="flex-none rounded-lg border-[1.5px] border-[#221d14] px-3 py-2.5 font-barlow text-[12px] font-bold uppercase tracking-wide"
              >
                {t.quote.duplicate}
              </button>
            </div>

            {/* Row 2: WhatsApp + Email */}
            <div className="flex gap-2">
              <a
                href={atLimit && quote.status === "draft" ? "#" : `https://wa.me/?text=${encodeURIComponent(`Hi ${quote.customer || "there"}, here's your quote for ${quote.job}. View and accept it here: ${shareUrl}`)}`}
                target={atLimit && quote.status === "draft" ? undefined : "_blank"}
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (atLimit && quote.status === "draft") { e.preventDefault(); setShowPaywall(true); return; }
                  markSent(quote.id); setSendState("sent");
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#25d366] py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {t.quote.sendViaWhatsapp}
              </a>
              <button
                onClick={() => {
                  if (atLimit && quote!.status === "draft") { setShowPaywall(true); return; }
                  setShowEmailInput((v) => !v);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-hazard py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide text-[#161006] transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {t.quote.sendViaEmail}
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className={`flex flex-none items-center justify-center gap-1 rounded-lg px-3 py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide transition-colors ${copied ? "bg-ok text-[#0d1a10]" : "bg-[#221d14] border border-[#3a3526] text-paper"}`}
              >
                {copied ? "✓" : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                )}
              </button>
            </div>

            {/* Email input panel */}
            {showEmailInput && (
              <div className="rounded-xl border border-line bg-panelRaised p-3">
                <div className="mb-1.5 text-[11px] text-textDim">Customer&apos;s email address</div>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="customer@email.com"
                  className="field mb-2"
                />
                {emailResult === "no_key" && (
                  <div className="mb-2 rounded-lg bg-warn/10 px-3 py-2 text-[11px] text-[#e0c26b]">
                    Add <code>RESEND_API_KEY</code> to your .env.local to send real emails. Quote link: <span className="break-all text-hazard">{shareUrl}</span>
                  </div>
                )}
                {emailResult === "sent" && (
                  <div className="mb-2 rounded-lg bg-ok/10 px-3 py-2 text-[11px] text-ok">Email sent successfully!</div>
                )}
                {typeof emailResult === "string" && emailResult.startsWith("error:") && (
                  <div className="mb-2 rounded-lg bg-warn/10 px-3 py-2 text-[11px] text-warn">{emailResult.replace("error:", "")}</div>
                )}
                <button
                  onClick={handleEmailSend}
                  disabled={emailSending}
                  className="w-full rounded-lg bg-gradient-to-br from-hazard2 to-hazard py-2 font-barlow text-sm font-bold uppercase tracking-wide text-[#161006] disabled:opacity-50"
                >
                  {emailSending ? t.common.saving : t.quote.sendViaEmail}
                </button>
              </div>
            )}

            {/* Mark as declined */}
            {quote.status === "sent" && (
              <button
                onClick={async () => {
                  if (!confirm("Mark this quote as declined?")) return;
                  await fetch(`/api/quotes/public/${quote.id}/decline`, { method: "POST" });
                  router.push("/home");
                }}
                className="no-print mt-1 w-full text-center text-[11px] text-textDimmer underline"
              >
                {t.quote.markDeclined}
              </button>
            )}
          </div>
        </div>

        {/* ── Variation orders (accepted quotes) ─────────────────────── */}
        {quote.status === "accepted" && (
          <div className="mt-4 w-full">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-textDim">Variations</div>
            {variations.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {variations.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-xl border border-line bg-panel px-3 py-2.5">
                    <div>
                      <div className="text-xs font-medium">{v.description}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-textDim">£{v.amount.toLocaleString("en-GB")}</div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${v.status === "accepted" ? "bg-ok/15 text-ok" : v.status === "declined" ? "bg-red-500/15 text-red-400" : "bg-warn/15 text-warn"}`}>
                      {v.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {showVariationForm ? (
              <div className="rounded-xl border border-line bg-panel p-3">
                <div className="mb-2 text-[11px] text-textDim">Describe the extra work and cost. Customer approves via their portal link.</div>
                <input value={varDesc} onChange={(e) => setVarDesc(e.target.value)} placeholder="e.g. Extra plastering to chimney breast" className="field mb-2" />
                <div className="relative mb-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-textDimmer">£</span>
                  <input type="number" min={0} value={varAmount} onChange={(e) => setVarAmount(e.target.value)} placeholder="0" className="field pl-6" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowVariationForm(false)} className="flex-1 rounded-lg border border-line py-2 text-xs text-textDim">Cancel</button>
                  <button onClick={raiseVariation} disabled={!varDesc.trim() || varSaving} className="flex-1 rounded-lg bg-gradient-to-br from-hazard2 to-hazard py-2 text-xs font-bold text-[#161006] disabled:opacity-50">
                    {varSaving ? "Saving…" : "Raise variation"}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowVariationForm(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-xs font-semibold text-textDim transition-colors hover:border-hazard hover:text-hazard">
                + Raise variation order
              </button>
            )}
          </div>
        )}

        {/* ── Payment tracking (accepted quotes) ─────────────────────── */}
        {quote.status === "accepted" && (
          <div className="mt-4 w-full">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-textDim">Payment Status</div>
            <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">

              {/* Step 1 — Deposit */}
              {quote.depositOn && (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold">Deposit · £{deposit.toLocaleString("en-GB")}</div>
                    {depositPaidAt && <div className="text-[10px] text-textDim">Received {new Date(depositPaidAt).toLocaleDateString("en-GB")}</div>}
                    {!depositPaid && <div className="text-[10px] text-textDim">Awaiting payment from customer</div>}
                  </div>
                  {depositPaid ? (
                    <span className="flex-none rounded-full bg-ok/15 px-2.5 py-1 text-[10px] font-bold text-ok">✓ Paid</span>
                  ) : (
                    <button
                      onClick={async () => {
                        setPaymentActionLoading("deposit");
                        await fetch(`/api/quotes/${id}/deposit-paid`, { method: "POST" });
                        setDepositPaid(true);
                        setDepositPaidAt(new Date().toISOString());
                        setPaymentActionLoading(null);
                      }}
                      disabled={paymentActionLoading === "deposit"}
                      className="flex-none rounded-xl border border-ok/40 bg-ok/10 px-3 py-1.5 text-[11px] font-bold text-ok disabled:opacity-50"
                    >
                      {paymentActionLoading === "deposit" ? "…" : "Mark received"}
                    </button>
                  )}
                </div>
              )}

              {/* Divider */}
              {quote.depositOn && <div className="h-px bg-line" />}

              {/* Step 2 — Final payment */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold">
                    Final payment · £{(quote.depositOn ? total - deposit : total).toLocaleString("en-GB")}
                  </div>
                  {!finalPaymentRequested && !finalPaymentPaid && (
                    <div className="text-[10px] text-textDim">
                      {quote.depositOn && !depositPaid ? "Pay deposit first" : "Send request when job is done"}
                    </div>
                  )}
                  {finalPaymentRequested && !finalPaymentPaid && (
                    <div className="text-[10px] text-textDim">Request sent — awaiting payment</div>
                  )}
                </div>
                {finalPaymentPaid ? (
                  <span className="flex-none rounded-full bg-ok/15 px-2.5 py-1 text-[10px] font-bold text-ok">✓ Paid</span>
                ) : finalPaymentRequested ? (
                  <button
                    onClick={async () => {
                      setPaymentActionLoading("final-paid");
                      await fetch(`/api/quotes/${id}/final-payment-paid`, { method: "POST" });
                      setFinalPaymentPaid(true);
                      setPaymentActionLoading(null);
                    }}
                    disabled={paymentActionLoading === "final-paid"}
                    className="flex-none rounded-xl border border-ok/40 bg-ok/10 px-3 py-1.5 text-[11px] font-bold text-ok disabled:opacity-50"
                  >
                    {paymentActionLoading === "final-paid" ? "…" : "Mark received"}
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      setPaymentActionLoading("final-request");
                      const res = await fetch(`/api/quotes/${id}/request-final-payment`, { method: "POST" });
                      const d = await res.json();
                      setFinalPaymentRequested(true);
                      setPaymentActionLoading(null);
                      if (d.emailSent === false) alert("Payment request saved — no customer email on file, so no email was sent.");
                    }}
                    disabled={(quote.depositOn && !depositPaid) || paymentActionLoading === "final-request"}
                    className="flex-none rounded-xl border border-hazard/40 bg-hazard/10 px-3 py-1.5 text-[11px] font-bold text-hazard disabled:opacity-40"
                  >
                    {paymentActionLoading === "final-request" ? "…" : "Request payment"}
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ── Review request (accepted quotes) ───────────────────────── */}
        {quote.status === "accepted" && quote.customer && googleReviewLink && (
          <div className="mt-4 w-full">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-textDim">Request a Review</div>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Hi ${quote.customer}, just wanted to say thanks for choosing us for ${quote.job}! If you're happy with the work, it would mean a lot if you could leave us a quick Google review — it really helps small businesses like ours. Here's the link: ${googleReviewLink}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#25d366]/30 bg-[#25d366]/10 py-3 font-barlow text-[13px] font-bold uppercase tracking-wide text-[#25d366] transition-colors hover:bg-[#25d366]/20"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Ask for Google Review
            </a>
          </div>
        )}

        {/* ── Job costing (accepted quotes) ───────────────────────────── */}
        {quote.status === "accepted" && (
          <div className="mt-4 w-full">
            <button
              onClick={() => setShowCosting((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-line bg-panel px-4 py-3"
            >
              <div>
                <div className="text-left text-sm font-semibold">Job costing</div>
                <div className="text-left text-[11px] text-textDim">Log actual costs to track your profit</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showCosting ? "rotate-180" : ""}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showCosting && (
              <div className="mt-2 rounded-xl border border-line bg-panel p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-textDim">Materials spend (£)</div>
                    <input type="number" min={0} value={actualMaterials} onChange={(e) => setActualMaterials(e.target.value)} placeholder="0" className="field" />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-textDim">Hours worked</div>
                    <input type="number" min={0} step={0.5} value={actualHours} onChange={(e) => setActualHours(e.target.value)} placeholder="0" className="field" />
                  </div>
                  <div className="col-span-2">
                    <div className="mb-1 text-[11px] font-semibold text-textDim">Hourly rate (£)</div>
                    <input type="number" min={0} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="field" />
                  </div>
                </div>

                {(actualMaterials || actualHours) && (
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-panelRaised p-3">
                    <div className="text-center">
                      <div className="font-mono text-[11px] font-bold text-hazard">£{actualTotalCost.toLocaleString("en-GB")}</div>
                      <div className="mt-0.5 text-[9px] text-textDim">Actual cost</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-mono text-[11px] font-bold ${profit >= 0 ? "text-ok" : "text-red-400"}`}>
                        {profit >= 0 ? "+" : ""}£{profit.toLocaleString("en-GB")}
                      </div>
                      <div className="mt-0.5 text-[9px] text-textDim">Profit</div>
                    </div>
                    <div className="text-center">
                      <div className={`font-mono text-[11px] font-bold ${marginPct >= 20 ? "text-ok" : "text-warn"}`}>{marginPct}%</div>
                      <div className="mt-0.5 text-[9px] text-textDim">Margin</div>
                    </div>
                  </div>
                )}

                <button
                  onClick={saveJobCosting}
                  disabled={costLoading}
                  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${costSaved ? "bg-ok/15 text-ok border border-ok/30" : "bg-gradient-to-br from-hazard2 to-hazard text-[#161006]"} disabled:opacity-50`}
                >
                  {costLoading ? "Saving…" : costSaved ? "✓ Saved" : "Save job costs"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Success toast */}
        <div className={`no-print absolute bottom-6 left-4 right-4 flex items-center gap-2.5 rounded-xl border border-ok bg-panel p-3 transition-all ${showToast ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"}`}>
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ok/20">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="#3fae5c" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <b className="block text-xs">Quote sent</b>
            <span className="text-[10.5px] text-textDim">{quote.customer || "Your customer"} can view and accept it now</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SendPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-xs text-textDim">Loading…</div>}>
      <SendPageContent />
    </Suspense>
  );
}
