"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function QuoteRequestPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const [businessName, setBusinessName] = useState("");
  const [trade, setTrade] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/request/${businessId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setNotFound(true); }
        else { setBusinessName(d.businessName); setTrade(d.trade ?? ""); }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [businessId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/request/${businessId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: name, customerPhone: phone, customerEmail: email, description }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Something went wrong"); setSubmitting(false); }
    else { setSubmitted(true); }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08090a]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2e333a] border-t-[#ff6a1f]" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#08090a] px-6 text-center">
        <div className="text-4xl mb-4">🔧</div>
        <div className="font-barlow text-lg font-bold text-[#f0ece5]">Link not found</div>
        <div className="mt-2 text-sm text-[#6b7280]">This quote request link is not valid.</div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#08090a] px-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#1a3c2a]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M4 12l5 5L20 6" stroke="#3fae5c" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="font-barlow text-xl font-bold text-[#f0ece5]">Request sent!</div>
        <div className="mt-2 text-sm text-[#6b7280] leading-relaxed">
          {businessName} will be in touch with your quote soon.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090a] px-5 pb-12 pt-10">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff8c42] to-[#ff6a1f] shadow-[0_4px_20px_-2px_rgba(255,106,31,0.5)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#161006" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h1 className="font-barlow text-2xl font-bold text-[#f0ece5]">{businessName}</h1>
          {trade && <p className="mt-1 text-sm text-[#ff6a1f]">{trade}</p>}
          <p className="mt-2 text-sm text-[#6b7280]">Fill in the form and we'll get back to you with a quote.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Your name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="John Smith"
              className="w-full rounded-xl border border-[#2e333a] bg-[#111316] px-4 py-3 text-sm text-[#f0ece5] placeholder:text-[#4b5563] focus:border-[#ff6a1f] focus:outline-none" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Phone number</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900 123"
              className="w-full rounded-xl border border-[#2e333a] bg-[#111316] px-4 py-3 text-sm text-[#f0ece5] placeholder:text-[#4b5563] focus:border-[#ff6a1f] focus:outline-none" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Email address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@email.com"
              className="w-full rounded-xl border border-[#2e333a] bg-[#111316] px-4 py-3 text-sm text-[#f0ece5] placeholder:text-[#4b5563] focus:border-[#ff6a1f] focus:outline-none" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Describe the job *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={5}
              placeholder="e.g. New bathroom — remove old suite, tile walls and floor, fit new toilet, basin and shower. Property in Manchester."
              className="w-full resize-none rounded-xl border border-[#2e333a] bg-[#111316] px-4 py-3 text-sm text-[#f0ece5] placeholder:text-[#4b5563] focus:border-[#ff6a1f] focus:outline-none" />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          <button type="submit" disabled={submitting || !name.trim() || !description.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#ff8c42] to-[#ff6a1f] py-3.5 font-barlow text-[15px] font-bold uppercase tracking-wide text-[#161006] shadow-[0_4px_14px_-2px_rgba(255,106,31,0.4)] disabled:opacity-50">
            {submitting
              ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#161006]/30 border-t-[#161006]" /> Sending…</>
              : "Request a quote →"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-[#4b5563]">Powered by Demand Pilot</p>
      </div>
    </div>
  );
}
