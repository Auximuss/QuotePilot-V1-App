"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PrimaryButton from "@/components/PrimaryButton";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="bp-grid flex min-h-screen flex-col justify-center px-6 py-10">
      <button onClick={() => router.push("/")} className="mb-8 text-xs text-textDim">
        ← Back to log in
      </button>

      <div className="font-barlow text-2xl font-bold leading-tight">Reset your password</div>
      <p className="mb-6 mt-1.5 text-xs leading-relaxed text-textDim">
        Enter the email on your account and we&apos;ll send you a reset link.
      </p>

      {sent ? (
        <div className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3.5 text-sm">
          Check <b>{email}</b> for a link to reset your password.
        </div>
      ) : (
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg border border-warn/40 bg-warn/15 px-3 py-2.5 text-[11.5px] text-[#e0c26b]">
              {error}
            </div>
          )}
          <label className="block rounded-xl border border-line bg-panel px-4 pb-2 pt-3.5 focus-within:border-hazard">
            <span className="mb-0.5 block font-mono text-[9.5px] uppercase tracking-wider text-textDim">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent text-sm text-paper"
            />
          </label>
          <PrimaryButton type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send Reset Link"}
          </PrimaryButton>
        </form>
      )}
    </div>
  );
}
