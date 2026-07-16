"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type CustomerQuote = { id: string; job_title: string; address: string; status: string; total: number; sent_at: string; businesses: { name: string } };

const STATUS_COLOURS: Record<string, string> = {
  draft: "bg-line text-textDim",
  sent: "bg-blue-500/15 text-blue-400",
  accepted: "bg-ok/15 text-ok",
  declined: "bg-red-500/15 text-red-400",
  expired: "bg-warn/15 text-warn",
  complete: "bg-purple-500/15 text-purple-400",
};

function CustomerDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [quotes, setQuotes] = useState<CustomerQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setError("Invalid link"); setLoading(false); return; }
    fetch(`/api/customer/quotes?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); } else { setEmail(d.email); setQuotes(d.quotes ?? []); }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load"); setLoading(false); });
  }, [token]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0e0e0e] text-white text-sm">Loading your quotes…</div>;

  if (error) return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0e0e0e] px-6 text-center">
      <div className="text-4xl mb-4">🔗</div>
      <div className="text-white font-semibold">{error === "Invalid or expired link" ? "This link has expired" : "Something went wrong"}</div>
      <div className="text-white/50 text-sm mt-2">Request a new link from your tradesperson.</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      <div className="border-b border-white/10 px-6 py-6">
        <div className="mx-auto max-w-lg">
          <div className="font-mono text-xs uppercase tracking-widest text-[#ff6a1f]">Your Portal</div>
          <h1 className="mt-1 text-2xl font-bold">Quotes & Invoices</h1>
          <div className="mt-1 text-sm text-white/40">{email}</div>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-6 py-6">
        {quotes.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center">
            <div className="text-3xl">📋</div>
            <div className="mt-3 font-semibold">No quotes yet</div>
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map(q => (
              <button
                key={q.id}
                onClick={() => router.push(`/q/${q.id}`)}
                className="flex w-full items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left hover:border-[#ff6a1f]/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{q.job_title ?? "Job"}</span>
                    <span className={`rounded-md px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${STATUS_COLOURS[q.status] ?? "bg-white/10 text-white/50"}`}>
                      {q.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-white/40">{q.businesses?.name}{q.address ? ` · ${q.address}` : ""}</div>
                  {q.sent_at && <div className="mt-0.5 text-[10px] text-white/30">{new Date(q.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>}
                </div>
                <div className="flex-none font-bold text-[#ff6a1f]">£{(q.total ?? 0).toLocaleString("en-GB")}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CustomerDashboard() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0e0e0e] text-white text-sm">Loading…</div>}>
      <CustomerDashboardContent />
    </Suspense>
  );
}
