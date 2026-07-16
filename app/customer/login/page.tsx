"use client";

import { useState } from "react";

export default function CustomerLoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    await fetch("/api/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0e0e0e] px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-mono text-xs uppercase tracking-widest text-[#ff6a1f]">Customer Portal</div>
          <h1 className="mt-2 text-2xl font-bold text-white">View Your Quotes</h1>
          <p className="mt-2 text-sm text-white/40">Enter your email to receive a secure link to all your quotes and invoices.</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center">
            <div className="text-4xl">📧</div>
            <div className="mt-3 font-semibold text-white">Check your inbox</div>
            <div className="mt-2 text-sm text-white/50">We sent a secure link to <span className="text-white">{email}</span>. It expires in 1 hour.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-[#ff6a1f] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full rounded-xl bg-gradient-to-br from-[#ff8c4b] to-[#ff6a1f] py-3 font-bold text-sm text-[#161006] disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send me a link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
