"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useQuote } from "@/lib/QuoteContext";
import { quoteTotal } from "@/lib/types";
import ScreenHeader from "@/components/ScreenHeader";

function sb() {
  return createClient();
}

function InvoiceContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { getQuote, businessName, logoUrl } = useQuote();
  const quote = getQuote(id);

  const [paid, setPaid] = useState(false);
  const [paidLoading, setPaidLoading] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankSort, setBankSort] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Payment due within 14 days.");

  useEffect(() => {
    // Load business settings + paid status from DB
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      const { data: biz } = await sb()
        .from("businesses")
        .select("bank_name, bank_sort_code, bank_account, vat_registered, vat_number, payment_terms, quote_prefix, quote_next_num")
        .eq("owner_id", user.id)
        .single();
      if (biz) {
        setBankName((biz as any).bank_name ?? "");
        setBankSort((biz as any).bank_sort_code ?? "");
        setBankAccount((biz as any).bank_account ?? "");
        setVatRegistered(!!(biz as any).vat_registered);
        setVatNumber((biz as any).vat_number ?? "");
        setPaymentTerms((biz as any).payment_terms || "Payment due within 14 days.");
      }
      // Check if already paid + load/generate invoice number
      const { data: q } = await sb().from("quotes").select("invoice_paid_at, invoice_number").eq("id", id).single();
      if (q) {
        setPaid(!!(q as any).invoice_paid_at);
        const num = (q as any).invoice_number;
        if (num) {
          setInvoiceNumber(num);
        } else {
          const prefix = (biz as any)?.quote_prefix || "";
          const next = (biz as any)?.quote_next_num ?? 1;
          const generated = `${prefix ? prefix + "-" : "INV-"}${String(next).padStart(4, "0")}`;
          setInvoiceNumber(generated);
          await sb().from("quotes").update({ invoice_number: generated }).eq("id", id);
        }
      }
    })();
  }, [id]);

  if (!quote) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs text-textDim">
        <div>Quote not found. <button onClick={() => router.push("/home")} className="text-hazard">Home</button></div>
      </div>
    );
  }

  const total = quoteTotal(quote);
  const displayName = businessName || "My Business";
  const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 14);

  async function markPaid() {
    setPaidLoading(true);
    await sb().from("quotes").update({ invoice_paid_at: new Date().toISOString() }).eq("id", id);
    setPaidLoading(false);
    setPaid(true);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="no-print">
        <ScreenHeader title="Invoice" back={`/quote/send?id=${id}`} />
      </div>

      <div className="flex flex-1 flex-col items-center bg-[#08090a] p-4 print:bg-white print:p-0">
        {/* Invoice document */}
        <div className="w-full overflow-hidden rounded bg-paper p-5 font-mono text-[#221d14] print:shadow-none">

          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-[#221d14] pb-3">
            <div>
              {logoUrl ? (
                <img src={logoUrl} alt={displayName} className="mb-1 h-10 max-w-[120px] object-contain" />
              ) : (
                <div className="font-archivo text-base font-bold">{displayName}</div>
              )}
              {vatRegistered && vatNumber && (
                <div className="mt-0.5 text-[8px] text-[#6b6252]">VAT No: {vatNumber}</div>
              )}
            </div>
            <div className="text-right">
              <div className="font-archivo text-[18px] font-bold uppercase tracking-widest text-[#221d14]">Invoice</div>
              <div className="mt-0.5 text-[9.5px] text-[#6b6252]">{invoiceNumber || "Loading…"}</div>
              <div className="text-[9px] text-[#6b6252]">Date: {new Date().toLocaleDateString("en-GB")}</div>
              <div className="text-[9px] text-[#6b6252]">Due: {dueDate.toLocaleDateString("en-GB")}</div>
            </div>
          </div>

          {/* Bill to */}
          <div className="mt-3">
            <div className="text-[8px] uppercase tracking-wider text-[#6b6252]">Bill to</div>
            <div className="font-work text-[10px] leading-relaxed">
              <b>{quote.customer || "Customer"}</b><br />
              {quote.address}
            </div>
          </div>

          {/* Reference */}
          <div className="mt-2 text-[8.5px] text-[#6b6252]">
            Re: {quote.quoteNumber ? `Quote ${quote.quoteNumber}` : quote.job}
          </div>

          {/* Items */}
          <div className="mt-3">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#221d14]">
                  <th className="pb-1 text-left text-[8px] uppercase tracking-wider text-[#6b6252]">Description</th>
                  <th className="pb-1 text-right text-[8px] uppercase tracking-wider text-[#6b6252]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {quote.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="border-b border-dashed border-[#c9c3b6] py-1.5 text-[9.5px]">{item.desc}</td>
                    <td className="border-b border-dashed border-[#c9c3b6] py-1.5 text-right text-[9.5px]">£{item.price.toLocaleString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="mt-3 flex justify-between border-t-2 border-[#221d14] pt-2">
            <span className="text-[12.5px] font-bold">Total due</span>
            <span className="text-[14px] font-bold">£{total.toLocaleString("en-GB")}</span>
          </div>

          {paid && (
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-ok/20">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="#3fae5c" strokeWidth={3} strokeLinecap="round" /></svg>
              </div>
              <span className="font-archivo text-[11px] font-bold uppercase tracking-wider text-ok">PAID</span>
            </div>
          )}

          {/* Bank details */}
          {(bankName || bankSort || bankAccount) && (
            <div className="mt-3 border-t border-dashed border-[#c9c3b6] pt-2">
              <div className="text-[8px] uppercase tracking-wider text-[#6b6252]">Payment details</div>
              {bankName && <div className="mt-0.5 text-[9px] text-[#221d14]">{bankName}</div>}
              {bankSort && <div className="text-[9px] text-[#6b6252]">Sort code: {bankSort}</div>}
              {bankAccount && <div className="text-[9px] text-[#6b6252]">Account: {bankAccount}</div>}
              <div className="mt-0.5 text-[8.5px] text-[#6b6252]">{paymentTerms}</div>
            </div>
          )}

          {/* Action buttons */}
          <div className="no-print mt-5 flex gap-2">
            <button onClick={() => window.print()} className="flex-1 rounded-lg border-[1.5px] border-[#221d14] py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide">
              PDF
            </button>
            {!paid && (
              <button onClick={markPaid} disabled={paidLoading} className="flex-1 rounded-lg bg-ok py-2.5 font-barlow text-[13px] font-bold uppercase tracking-wide text-[#0d1a10] disabled:opacity-50">
                {paidLoading ? "Saving…" : "Mark as paid"}
              </button>
            )}
          </div>
        </div>

        {/* Bank details missing hint */}
        {!bankSort && !bankAccount && (
          <div className="no-print mt-3 w-full rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5 text-[11px] text-[#e0c26b]">
            Add your bank details in <button onClick={() => router.push("/settings")} className="underline">Settings → Business</button> so they appear on invoices.
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-xs text-textDim">Loading…</div>}>
      <InvoiceContent />
    </Suspense>
  );
}
