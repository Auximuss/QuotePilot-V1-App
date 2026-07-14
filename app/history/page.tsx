"use client";

import { useMemo, useState } from "react";
import { useQuote } from "@/lib/QuoteContext";
import { useTranslation } from "@/lib/LanguageContext";
import QuoteCard from "@/components/QuoteCard";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Declined" },
  { value: "expired", label: "Expired" },
] as const;

const STATUS_COLOURS: Record<string, string> = {
  all: "bg-line text-textDim border-line",
  draft: "bg-line/60 text-textDim border-line",
  sent: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  accepted: "bg-ok/15 text-ok border-ok/30",
  rejected: "bg-warn/15 text-warn border-warn/30",
  expired: "bg-textDimmer/15 text-textDimmer border-textDimmer/20",
};

const STATUS_ACTIVE: Record<string, string> = {
  all: "bg-paper/10 text-paper border-paper/30",
  draft: "bg-paper/10 text-paper border-paper/30",
  sent: "bg-blue-500/25 text-blue-300 border-blue-400/50",
  accepted: "bg-ok/25 text-ok border-ok/50",
  rejected: "bg-warn/25 text-warn border-warn/50",
  expired: "bg-textDim/25 text-textDim border-textDim/40",
};

export default function HistoryPage() {
  const { quotes } = useQuote();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: quotes.length };
    for (const q of quotes) {
      counts[q.status] = (counts[q.status] ?? 0) + 1;
    }
    return counts;
  }, [quotes]);

  const filtered = useMemo(() => {
    const sorted = [...quotes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.filter((quote) => {
      const matchStatus = statusFilter === "all" || quote.status === statusFilter;
      if (!matchStatus) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const dateStr = new Date(quote.createdAt).toLocaleDateString("en-GB");
      return (
        quote.customer.toLowerCase().includes(q) ||
        quote.address.toLowerCase().includes(q) ||
        quote.job.toLowerCase().includes(q) ||
        dateStr.includes(q)
      );
    });
  }, [quotes, query, statusFilter]);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        title={t.history.title}
        subtitle={`${quotes.length} quote${quotes.length === 1 ? "" : "s"} total`}
      />
      <div className="flex-1 px-5 pb-6 pt-2">
        {/* Search */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.history.search}
          className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm text-paper placeholder:text-textDimmer focus:border-hazard focus:outline-none"
        />

        {/* Status filter chips */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {STATUS_FILTERS.map(({ value, label }) => {
            const count = statusCounts[value] ?? 0;
            if (value !== "all" && count === 0) return null;
            const isActive = statusFilter === value;
            return (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`flex-none rounded-full border px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide transition-all ${
                  isActive ? STATUS_ACTIVE[value] : STATUS_COLOURS[value]
                }`}
              >
                {label}
                {value !== "all" && count > 0 && (
                  <span className="ml-1 opacity-60">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-xs text-textDim">
              {quotes.length === 0 ? t.home.noQuotes : "No quotes match your filters"}
            </div>
          ) : (
            filtered.map((q) => <QuoteCard key={q.id} quote={q} />)
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
