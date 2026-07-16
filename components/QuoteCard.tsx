"use client";

import { useRouter } from "next/navigation";
import { Quote, quoteTotal } from "@/lib/types";
import { useTranslation } from "@/lib/LanguageContext";

const STATUS_STYLES: Record<Quote["status"], string> = {
  sent: "bg-warn/15 text-warn",
  draft: "bg-white/10 text-textDim",
  accepted: "bg-ok/20 text-ok",
  declined: "bg-red-500/15 text-red-400",
};

export default function QuoteCard({ quote }: { quote: Quote }) {
  const router = useRouter();
  const { t } = useTranslation();
  const STATUS_LABEL: Record<Quote["status"], string> = {
    sent: t.status.sent,
    draft: t.status.draft,
    accepted: t.status.accepted,
    declined: t.status.declined,
  };
  const total = quoteTotal(quote);

  // Drafts go to review so the user can keep editing.
  // Everything else goes to the send/view page.
  const href =
    quote.status === "draft"
      ? `/quote/review?id=${quote.id}`
      : `/quote/send?id=${quote.id}`;

  return (
    <button
      onClick={() => router.push(href)}
      className="mb-2.5 w-full rounded-xl border border-line bg-panel px-3.5 py-3 text-left transition-colors active:bg-panelRaised"
    >
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">{quote.customer || "Unnamed customer"}</div>
        <div className="font-mono text-xs">£{total.toLocaleString("en-GB")}</div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <div className="text-xs text-textDim">
          {quote.job}
          {quote.address ? ` — ${quote.address}` : ""}
        </div>
        <div
          className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
            STATUS_STYLES[quote.status]
          }`}
        >
          {STATUS_LABEL[quote.status]}
        </div>
      </div>
    </button>
  );
}
