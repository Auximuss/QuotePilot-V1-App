"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { quoteTotal, depositAmountFor, quoteExpiryDate } from "@/lib/types";
import type { Quote } from "@/lib/types";

type CustomerQuoteData = {
  quote: Quote;
  businessName: string;
  paymentLink: string | null;
  bankName: string | null;
  bankSortCode: string | null;
  bankAccount: string | null;
  depositPercent: number;
  paymentTerms: string | null;
  exclusions: string | null;
  depositPaid: boolean;
  finalPaymentRequested: boolean;
  finalPaymentPaid: boolean;
};

export default function CustomerPortalPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<CustomerQuoteData | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [sigName, setSigName] = useState("");
  const [sigAgreed, setSigAgreed] = useState(false);
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [question, setQuestion] = useState("");
  const [questionSent, setQuestionSent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/quotes/public/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setFetchError(d.error);
        } else {
          setData(d);
          setQuoteStatus(d.quote.status);
        }
        setLoading(false);
      })
      .catch(() => {
        setFetchError("Failed to load quote.");
        setLoading(false);
      });
  }, [id]);

  async function handleAccept() {
    setProcessing(true);
    setActionError(null);
    const res = await fetch(`/api/quotes/public/${id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureName: sigName }),
    });
    if (res.ok) {
      setQuoteStatus("accepted");
      setShowSignature(false);
    } else {
      setActionError("Couldn't accept the quote right now — please try again.");
    }
    setProcessing(false);
  }

  async function handleDecline() {
    setActionError(null);
    const res = await fetch(`/api/quotes/public/${id}/decline`, { method: "POST" });
    if (res.ok) {
      setQuoteStatus("declined");
    } else {
      setActionError("Couldn't decline the quote right now — please try again.");
    }
  }

  async function handleSendQuestion() {
    await fetch(`/api/quotes/public/${id}/question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    setQuestionSent(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xs text-textDim">Loading quote…</div>
      </div>
    );
  }

  if (fetchError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <div className="font-barlow text-lg font-semibold">Quote not found</div>
        <p className="mt-2 text-xs text-textDim">
          This link may have expired or the quote may have been removed.
        </p>
      </div>
    );
  }

  const { quote, businessName, paymentLink, bankName, bankSortCode, bankAccount, depositPercent, paymentTerms, exclusions, depositPaid, finalPaymentRequested, finalPaymentPaid } = data;
  const hasPaymentOptions = paymentLink || bankAccount;
  const displayStatus = quoteStatus ?? quote.status;
  const total = quoteTotal(quote);
  const deposit = depositAmountFor(quote, depositPercent);
  const expiry = quoteExpiryDate(quote);
  const isExpired = expiry < new Date() && displayStatus === "sent";

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#141519] to-ink px-5 py-8">
      <div className="mb-1.5 flex items-center justify-center gap-2">
        <div className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-gradient-to-br from-hazard2 to-hazard">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" fill="#161006" />
            <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="#161006" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </div>
        <div className="font-archivo text-[13px]">{businessName || "Your Builder"}</div>
      </div>
      <div className="mb-5 text-center font-mono text-[9.5px] uppercase tracking-wider text-textDim">
        Quote #{quote.id.slice(0, 8)} · for {quote.customer || "you"}
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4.5">
        <div className="text-center font-barlow text-xl font-bold">{quote.job}</div>
        {quote.address && (
          <div className="mt-0.5 text-center text-[11.5px] text-textDim">{quote.address}</div>
        )}

        <div className="my-4.5 text-center font-mono text-4xl text-hazard">
          £{total.toLocaleString("en-GB")}
        </div>
        <div className="-mt-3 mb-4 text-center text-[10px] uppercase tracking-wider text-textDimmer">
          Total inc. VAT
        </div>

        <div className="h-px bg-line" />

        {quote.lineItems.map((item) => (
          <div key={item.id} className="flex justify-between py-1.5 text-xs text-textDim">
            <span>{item.desc}</span>
            <b className="font-normal text-paper">£{item.price.toLocaleString("en-GB")}</b>
          </div>
        ))}

        {quote.notes && (
          <div className="mt-2 rounded-lg border border-line bg-panelRaised px-3 py-2 text-[11px] text-textDim">
            {quote.notes}
          </div>
        )}

        {/* Expiry date */}
        {displayStatus === "sent" && !isExpired && (
          <div className="mt-2 text-center text-[10px] text-textDimmer">
            Valid until {expiry.toLocaleDateString("en-GB")}
          </div>
        )}
        {isExpired && (
          <div className="mt-2 text-center text-[10.5px] text-warn">
            This quote has expired. Contact {businessName || "the builder"} for an updated one.
          </div>
        )}

        {quote.depositOn && displayStatus !== "accepted" && (
          <div className="mt-3.5 rounded-lg border border-hazardDim bg-hazardDim px-3 py-2.5 text-[11px] leading-relaxed text-hazard2">
            {depositPercent}% deposit (£{deposit.toLocaleString("en-GB")}) is due to confirm this booking. The rest is due on completion.
          </div>
        )}

        {/* Payment terms & exclusions */}
        {(paymentTerms || exclusions) && displayStatus !== "accepted" && (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            {exclusions && (
              <div>
                <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-textDimmer">Exclusions</div>
                <div className="text-[11px] text-textDim">{exclusions}</div>
              </div>
            )}
            {paymentTerms && (
              <div>
                <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-textDimmer">Payment terms</div>
                <div className="text-[11px] text-textDim">{paymentTerms}</div>
              </div>
            )}
          </div>
        )}

        {actionError && (
          <div className="mt-3 rounded-lg border border-warn/40 bg-warn/15 px-3 py-2 text-[11px] text-warn">
            {actionError}
          </div>
        )}

        {displayStatus === "accepted" ? (
          <div className="mt-5 space-y-3">
            {/* Accepted confirmation */}
            <div className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3.5 text-center">
              <div className="font-barlow text-base font-bold text-ok">Quote accepted ✓</div>
              <div className="mt-1 text-[11.5px] text-textDim">
                {finalPaymentPaid
                  ? "All paid — thank you! Job complete."
                  : finalPaymentRequested
                  ? "Your job is complete. Please pay the final balance below."
                  : depositPaid
                  ? `Deposit received ✓ — ${businessName || "they"} will be in touch to schedule the work.`
                  : hasPaymentOptions
                  ? quote.depositOn
                    ? `Please pay your deposit of £${deposit.toLocaleString("en-GB")} to confirm the booking.`
                    : "Please arrange payment using one of the options below."
                  : `Thanks — ${businessName || "they"} will be in touch to schedule the work.`}
              </div>
            </div>

            {/* ── DEPOSIT payment options (shown until deposit is paid) ── */}
            {!depositPaid && !finalPaymentRequested && hasPaymentOptions && (
              <div className="space-y-2">
                <div className="text-center font-mono text-[10px] uppercase tracking-wider text-textDim">
                  {quote.depositOn ? `Pay deposit · £${deposit.toLocaleString("en-GB")}` : `Pay · £${total.toLocaleString("en-GB")}`}
                </div>
                <PaymentOptions
                  paymentLink={paymentLink}
                  bankName={bankName}
                  bankSortCode={bankSortCode}
                  bankAccount={bankAccount}
                  quoteId={quote.id}
                />
              </div>
            )}

            {/* ── Deposit paid badge ── */}
            {depositPaid && !finalPaymentRequested && (
              <div className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span className="text-[12px] font-semibold text-ok">Deposit of £{deposit.toLocaleString("en-GB")} received</span>
              </div>
            )}

            {/* ── FINAL PAYMENT section (shown when tradesperson requests it) ── */}
            {finalPaymentRequested && !finalPaymentPaid && (
              <div className="space-y-2">
                <div className="rounded-xl border border-hazard/40 bg-hazard/8 px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] text-textDim">Total quote</div>
                    <div className="font-mono text-[13px]">£{total.toLocaleString("en-GB")}</div>
                  </div>
                  {quote.depositOn && (
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-[12px] text-textDim">Deposit paid</div>
                      <div className="font-mono text-[13px] text-ok">− £{deposit.toLocaleString("en-GB")}</div>
                    </div>
                  )}
                  <div className="mt-2 border-t border-line pt-2 flex items-center justify-between">
                    <div className="text-[13px] font-semibold">Balance due</div>
                    <div className="font-barlow text-[20px] font-bold text-hazard">
                      £{(quote.depositOn ? total - deposit : total).toLocaleString("en-GB")}
                    </div>
                  </div>
                </div>
                <div className="text-center font-mono text-[10px] uppercase tracking-wider text-textDim">
                  Final payment · £{(quote.depositOn ? total - deposit : total).toLocaleString("en-GB")}
                </div>
                <PaymentOptions
                  paymentLink={paymentLink}
                  bankName={bankName}
                  bankSortCode={bankSortCode}
                  bankAccount={bankAccount}
                  quoteId={quote.id}
                />
              </div>
            )}

            {/* ── All paid ── */}
            {finalPaymentPaid && (
              <div className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span className="text-[12px] font-semibold text-ok">All payments complete — thank you!</span>
              </div>
            )}
          </div>
        ) : displayStatus === "declined" ? (
          <div className="mt-5 rounded-xl border border-line bg-panelRaised px-4 py-4 text-center">
            <div className="font-barlow text-base font-bold">Quote declined</div>
            <div className="mt-1 text-[11.5px] text-textDim">
              You&apos;ve let {businessName || "the builder"} know this quote isn&apos;t going ahead.
            </div>
          </div>
        ) : isExpired ? null : (
          <div className="mt-5 flex flex-col gap-2.5">
            {/* Signature panel */}
            {showSignature ? (
              <div className="rounded-2xl border border-[#635bff]/40 bg-[#635bff]/5 p-4">
                <div className="mb-3 text-center text-[13px] font-semibold">Confirm acceptance</div>
                <div className="mb-1.5 text-[11px] text-textDim">Type your full name to sign</div>
                <input
                  value={sigName}
                  onChange={(e) => setSigName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-paper placeholder:text-textDimmer focus:border-[#635bff] focus:outline-none mb-3"
                />
                <label className="flex items-start gap-2.5 cursor-pointer mb-4">
                  <input type="checkbox" checked={sigAgreed} onChange={(e) => setSigAgreed(e.target.checked)} className="mt-0.5 flex-none accent-[#635bff]" />
                  <span className="text-[11px] text-textDim leading-relaxed">
                    I agree to proceed with the work described in this quote and accept the terms and conditions set out above.
                  </span>
                </label>
                <button
                  onClick={handleAccept}
                  disabled={processing || !sigName.trim() || !sigAgreed}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#635bff] py-3.5 font-barlow text-[15px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
                >
                  {processing ? "Confirming…" : "Confirm & Accept"}
                </button>
                <button onClick={() => setShowSignature(false)} className="mt-2 w-full text-center text-[11px] text-textDim">
                  Go back
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSignature(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#635bff] py-3.5 font-barlow text-[15.5px] font-bold uppercase tracking-wide text-white transition-transform active:scale-[0.97]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12l5 5L20 6" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {quote.depositOn ? "Accept & Pay Deposit" : "Accept Quote"}
              </button>
            )}

            <div className="flex gap-2.5">
              <button
                onClick={handleDecline}
                className="flex-1 rounded-xl border border-line py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide text-textDim"
              >
                Decline
              </button>
              <button
                onClick={() => setAskingQuestion((v) => !v)}
                className="flex-1 rounded-xl border border-line py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide text-textDim"
              >
                Ask a question
              </button>
            </div>

            {askingQuestion && (
              <div className="rounded-xl border border-line bg-panelRaised p-3">
                {questionSent ? (
                  <div className="text-center text-[12px] text-ok">
                    ✓ Your question has been sent to {businessName || "the builder"} — they&apos;ll
                    reply by email.
                  </div>
                ) : (
                  <>
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="e.g. Can the worktop colour be changed?"
                      rows={3}
                      className="w-full resize-none rounded-lg bg-transparent text-xs text-paper placeholder:text-textDimmer focus:outline-none"
                    />
                    <button
                      onClick={handleSendQuestion}
                      disabled={!question.trim()}
                      className="mt-2 w-full rounded-lg bg-hazard py-2 font-barlow text-xs font-bold uppercase tracking-wide text-[#161006] disabled:opacity-50"
                    >
                      Send
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable payment options block ─────────────────────────────────────────
function PaymentOptions({ paymentLink, bankName, bankSortCode, bankAccount, quoteId }: {
  paymentLink: string | null;
  bankName: string | null;
  bankSortCode: string | null;
  bankAccount: string | null;
  quoteId: string;
}) {
  const [copiedAccount, setCopiedAccount] = useState(false);

  function copyAccount() {
    if (!bankAccount) return;
    navigator.clipboard.writeText(bankAccount);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  }

  return (
    <div className="space-y-2">
      {paymentLink && (
        <a
          href={paymentLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl bg-[#635bff] px-4 py-3.5 transition-transform active:scale-[0.97]"
        >
          <div>
            <div className="font-barlow text-[14px] font-bold text-white">Pay online →</div>
            <div className="text-[11px] text-white/70">Card, Apple Pay, Google Pay</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
      )}
      {bankAccount && (
        <div className="rounded-xl border border-line bg-panelRaised px-4 py-3.5">
          <div className="mb-2.5 font-barlow text-[13px] font-bold">Bank transfer</div>
          <div className="space-y-1.5">
            {bankName && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-textDim">Bank</span>
                <span className="font-mono text-[12px]">{bankName}</span>
              </div>
            )}
            {bankSortCode && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-textDim">Sort code</span>
                <span className="font-mono text-[12px] tracking-wider">{bankSortCode}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-textDim">Account</span>
              <span className="font-mono text-[12px] tracking-wider">{bankAccount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-textDim">Reference</span>
              <span className="font-mono text-[12px] text-hazard">{quoteId.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>
          <button
            onClick={copyAccount}
            className={`mt-3 w-full rounded-lg border py-2 text-[11.5px] font-semibold transition-colors ${copiedAccount ? "border-ok/40 bg-ok/10 text-ok" : "border-line text-textDim active:bg-line"}`}
          >
            {copiedAccount ? "Copied!" : "Copy account number"}
          </button>
        </div>
      )}
    </div>
  );
}
