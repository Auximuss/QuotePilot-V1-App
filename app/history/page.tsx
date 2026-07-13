"use client";

import { useMemo, useState } from "react";
import { useQuote } from "@/lib/QuoteContext";
import { useTranslation } from "@/lib/LanguageContext";
import QuoteCard from "@/components/QuoteCard";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";

export default function HistoryPage() {
  const { quotes } = useQuote();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const sorted = [...quotes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter((quote) => {
      const dateStr = new Date(quote.createdAt).toLocaleDateString("en-GB");
      return (
        quote.customer.toLowerCase().includes(q) ||
        quote.address.toLowerCase().includes(q) ||
        quote.job.toLowerCase().includes(q) ||
        dateStr.includes(q)
      );
    });
  }, [quotes, query]);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        title={t.history.title}
        subtitle={`${quotes.length} quote${quotes.length === 1 ? "" : "s"} total`}
      />
      <div className="flex-1 px-5 pb-6 pt-2">

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.history.search}
          className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm text-paper placeholder:text-textDimmer focus:border-hazard"
        />

        <div className="mt-4">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-xs text-textDim">
              {quotes.length === 0 ? t.home.noQuotes : t.history.noResults}
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
