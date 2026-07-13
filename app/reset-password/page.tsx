"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PrimaryButton from "@/components/PrimaryButton";

// Reached via the link Supabase emails from resetPasswordForEmail().
// The auth/callback route exchanges the code for a session before the
// user lands here, so supabase.auth.updateUser() below has a valid session
// to act on.
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/home"), 1200);
  }

  return (
    <div className="bp-grid flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="font-barlow text-2xl font-bold leading-tight">Set a new password</div>
      <p className="mb-6 mt-1.5 text-xs leading-relaxed text-textDim">
        Choose something you haven&apos;t used before on this account.
      </p>

      {done ? (
        <div className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3.5 text-sm">
          Password updated — taking you to your dashboard…
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
              New password
            </span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent text-sm text-paper"
            />
          </label>
          <PrimaryButton type="submit" disabled={loading}>
            {loading ? "Updating…" : "Update Password"}
          </PrimaryButton>
        </form>
      )}
    </div>
  );
}
