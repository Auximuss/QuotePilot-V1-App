"use client";

import { useState } from "react";
import { useQuote } from "@/lib/QuoteContext";
import { useTranslation } from "@/lib/LanguageContext";
import { quoteTotal } from "@/lib/types";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";

// ── HMRC 2024/25 UK tax constants ───────────────────────────────────────────
const PERSONAL_ALLOWANCE = 12_570;
const BASIC_RATE_LIMIT   = 50_270;
const HIGHER_RATE_LIMIT  = 125_140;
const BASIC_RATE         = 0.20;
const HIGHER_RATE        = 0.40;
const ADDITIONAL_RATE    = 0.45;
const NI_LOWER_LIMIT     = 12_570;
const NI_UPPER_LIMIT     = 50_270;
const NI_CLASS4_LOWER    = 0.09; // 9% between limits
const NI_CLASS4_UPPER    = 0.02; // 2% above upper limit

function calcIncomeTax(profit: number): number {
  if (profit <= PERSONAL_ALLOWANCE) return 0;
  let tax = 0;
  const taxable = profit - PERSONAL_ALLOWANCE;
  if (taxable <= BASIC_RATE_LIMIT - PERSONAL_ALLOWANCE) {
    tax = taxable * BASIC_RATE;
  } else if (taxable <= HIGHER_RATE_LIMIT - PERSONAL_ALLOWANCE) {
    tax = (BASIC_RATE_LIMIT - PERSONAL_ALLOWANCE) * BASIC_RATE
        + (taxable - (BASIC_RATE_LIMIT - PERSONAL_ALLOWANCE)) * HIGHER_RATE;
  } else {
    tax = (BASIC_RATE_LIMIT - PERSONAL_ALLOWANCE) * BASIC_RATE
        + (HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT) * HIGHER_RATE
        + (taxable - (HIGHER_RATE_LIMIT - PERSONAL_ALLOWANCE)) * ADDITIONAL_RATE;
  }
  return Math.round(tax);
}

function calcNI(profit: number): number {
  if (profit <= NI_LOWER_LIMIT) return 0;
  let ni = 0;
  if (profit <= NI_UPPER_LIMIT) {
    ni = (profit - NI_LOWER_LIMIT) * NI_CLASS4_LOWER;
  } else {
    ni = (NI_UPPER_LIMIT - NI_LOWER_LIMIT) * NI_CLASS4_LOWER
       + (profit - NI_UPPER_LIMIT) * NI_CLASS4_UPPER;
  }
  return Math.round(ni);
}

export default function AnalyticsPage() {
  const { quotes, stats } = useQuote();
  const { t } = useTranslation();

  const accepted = quotes.filter((q) => q.status === "accepted");
  const totalRevenue = accepted.reduce((sum, q) => sum + quoteTotal(q), 0);

  // HMRC estimate state
  const [expenses, setExpenses]   = useState("");
  const [taxYear,  setTaxYear]    = useState<"ytd" | "projected">("ytd");
  const [open,     setOpen]       = useState(false);

  const grossRevenue   = totalRevenue;
  const expensesNum    = parseFloat(expenses) || 0;
  const profit         = Math.max(0, grossRevenue - expensesNum);
  const incomeTax      = calcIncomeTax(profit);
  const ni             = calcNI(profit);
  const totalTax       = incomeTax + ni;
  const effectiveRate  = profit > 0 ? Math.round((totalTax / profit) * 100) : 0;
  const quarterly      = Math.round(totalTax / 4);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        title={t.analytics.title}
        subtitle={stats.hasAnyQuotes ? t.analytics.taxSub : "—"}
      />
      <div className="flex-1 px-5 pb-6 pt-2">

        {/* Top row — the two numbers that matter most */}
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label={t.analytics.totalRevenue} value={`£${totalRevenue.toLocaleString("en-GB")}`} highlight />
          <Metric label={t.analytics.accepted} value={stats.acceptanceRate === null ? "—" : `${stats.acceptanceRate}%`} highlight />
        </div>
        {/* Second row */}
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Metric label={t.analytics.totalQuoted} value={`£${stats.totalQuoted.toLocaleString("en-GB")}`} />
          <Metric label={t.analytics.averageQuote} value={stats.averageQuote === null ? "—" : `£${stats.averageQuote.toLocaleString("en-GB")}`} />
        </div>
        {/* Deposits — least critical, sits below */}
        <div className="mt-2.5">
          <Metric label={t.analytics.depositsWaiting} value={`£${stats.depositsWaiting.toLocaleString("en-GB")}`} wide />
        </div>

        {!stats.hasAnyQuotes && (
          <div className="mt-5 rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-textDim">
            These numbers fill in automatically as you send and close quotes — nothing here is simulated.
          </div>
        )}

        <div className="mb-2.5 mt-6 font-mono text-[10.5px] uppercase tracking-wider text-textDim">
          {t.analytics.byStatus}
        </div>
        <div className="space-y-2">
          {(() => {
            const total = quotes.length || 1;
            const rows = [
              { label: t.status.accepted, count: accepted.length, color: "bg-ok" },
              { label: t.status.sent,     count: quotes.filter((q) => q.status === "sent").length,     color: "bg-warn" },
              { label: t.status.draft,    count: quotes.filter((q) => q.status === "draft").length,    color: "bg-textDimmer" },
              { label: t.status.declined, count: quotes.filter((q) => q.status === "declined").length, color: "bg-red-500" },
            ];
            return rows.map((r) => (
              <StatusRow key={r.label} label={r.label} count={r.count} pct={Math.round((r.count / total) * 100)} color={r.color} />
            ));
          })()}
        </div>

        {/* ── HMRC Tax Estimate ──────────────────────────────────────────── */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-6 flex w-full items-center justify-between rounded-2xl border border-line bg-panel px-4 py-3.5"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a3c2a]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fae5c" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-[13px] font-semibold">{t.analytics.taxEstimate}</div>
              <div className="text-[10.5px] text-textDim">{t.analytics.taxSub} · {new Date().getFullYear()}/{String(new Date().getFullYear() + 1).slice(2)}</div>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={`text-textDim transition-transform ${open ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div className="rounded-b-2xl border border-t-0 border-line bg-panel px-4 pb-4">
            {/* Disclaimer */}
            <div className="mb-3.5 rounded-lg bg-warn/10 border border-warn/30 px-3 py-2 text-[10.5px] text-warn leading-relaxed">
              ⚠️ {t.analytics.disclaimer}
            </div>

            {/* Expenses input */}
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-textDim">{t.analytics.expenses}</label>
            <div className="relative mb-3.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-textDimmer">£</span>
              <input
                type="number"
                min={0}
                value={expenses}
                onChange={(e) => setExpenses(e.target.value)}
                placeholder="e.g. tools, fuel, materials…"
                className="w-full rounded-xl border border-line bg-panelRaised py-2.5 pl-7 pr-3 text-sm text-paper placeholder:text-textDimmer focus:border-ok focus:outline-none"
              />
            </div>

            {/* Results */}
            <div className="space-y-2 rounded-xl border border-line bg-panelRaised p-3.5">
              <TaxRow label={t.analytics.grossRevenue} value={`£${grossRevenue.toLocaleString("en-GB")}`} />
              <TaxRow label={t.analytics.lessExpenses} value={`-£${expensesNum.toLocaleString("en-GB")}`} dim />
              <div className="border-t border-line my-1" />
              <TaxRow label={t.analytics.taxableProfit} value={`£${profit.toLocaleString("en-GB")}`} bold />
              <div className="border-t border-dashed border-line my-1" />
              <TaxRow label={t.analytics.incomeTax} value={`£${incomeTax.toLocaleString("en-GB")}`} />
              <TaxRow label={t.analytics.classNI} value={`£${ni.toLocaleString("en-GB")}`} />
              <div className="border-t border-line my-1" />
              <TaxRow label={t.analytics.totalTax} value={`£${totalTax.toLocaleString("en-GB")}`} bold accent />
              <TaxRow label={t.analytics.effectiveRate} value={`${effectiveRate}%`} dim />
            </div>

            {/* Quarterly payment on account */}
            {totalTax > 1_000 && (
              <div className="mt-3 rounded-xl border border-[#635bff]/30 bg-[#635bff]/8 px-3.5 py-3">
                <div className="text-[11.5px] font-semibold text-[#9d97ff]">{t.analytics.paymentsOnAccount}</div>
                <div className="mt-0.5 text-[11px] text-textDim leading-relaxed">
                  HMRC typically requires 2 payments on account of ~<span className="text-paper font-mono">£{(Math.round(totalTax / 2)).toLocaleString("en-GB")}</span> each (Jan & Jul).
                  Set aside <span className="text-paper font-mono">£{quarterly.toLocaleString("en-GB")}/quarter</span> to stay on top.
                </div>
              </div>
            )}

            {/* Set aside CTA */}
            <div className="mt-3 rounded-xl bg-panelRaised border border-line px-3.5 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11.5px] font-semibold">{t.analytics.setAside}</div>
                <div className="text-[10.5px] text-textDim mt-0.5">
                  {profit > 0
                    ? `${effectiveRate}% of every payment — about £${effectiveRate} per £100 earned`
                    : "Enter your revenue to see this"}
                </div>
              </div>
              <div className="text-right flex-none">
                <div className="font-mono text-lg text-ok">£{(Math.round(totalTax / 12)).toLocaleString("en-GB")}</div>
                <div className="text-[9.5px] text-textDim">{t.analytics.perMonth}</div>
              </div>
            </div>

            {/* 2024/25 bands info */}
            <div className="mt-3 text-[10px] text-textDimmer leading-relaxed">
              Using 2024/25 UK rates: Personal allowance £12,570 · Basic rate 20% (up to £50,270) · Higher rate 40% · Class 4 NI 9%/2%.
            </div>
          </div>
        )}

      </div>
      <BottomNav />
    </div>
  );
}

function Metric({ label, value, wide, highlight }: { label: string; value: string; wide?: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3.5 ${wide ? "col-span-2" : ""} ${highlight ? "border-hazard/30 bg-hazard/5" : "border-line bg-panel"}`}>
      <div className={`font-mono text-xl ${highlight ? "text-hazard" : "text-hazard"}`}>{value}</div>
      <div className="mt-1 text-[10.5px] text-textDim">{label}</div>
    </div>
  );
}

function StatusRow({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel px-3.5 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-textDim">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-textDimmer">{pct}%</span>
          <span className="font-mono text-sm">{count}</span>
        </div>
      </div>
      <div className="h-1 w-full rounded-full bg-white/5">
        <div
          className={`h-1 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function TaxRow({ label, value, bold, dim, accent }: { label: string; value: string; bold?: boolean; dim?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[12px] ${dim ? "text-textDim" : "text-paper"}`}>{label}</span>
      <span className={`font-mono text-[12px] ${accent ? "text-ok" : dim ? "text-textDim" : "text-paper"} ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
