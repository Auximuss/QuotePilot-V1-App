"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PrimaryButton from "@/components/PrimaryButton";

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [trade, setTrade] = useState("General Building");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/home");
    router.refresh();
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { business_name: businessName, trade } },
    });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    if (!data.session) {
      setLoading(false);
      setError("Check your email to confirm your account, then log in.");
      setTab("login");
      return;
    }

    await supabase.from("businesses").insert({
      owner_id: data.user!.id,
      name: businessName || "My Business",
      trade,
    });

    setLoading(false);
    router.push("/home");
    router.refresh();
  }

  return (
    <div className="bp-grid flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <span className="font-barlow text-2xl font-bold tracking-tight">Demand <span className="text-hazard">Pilot</span></span>
      </div>

      <div className="mb-6 flex rounded-xl border border-line bg-panel p-1">
        <button
          onClick={() => setTab("login")}
          className={`flex-1 rounded-lg py-2 font-barlow text-sm font-semibold transition-colors ${
            tab === "login" ? "bg-gradient-to-br from-hazard2 to-hazard text-[#161006]" : "text-textDim"
          }`}
        >
          Log In
        </button>
        <button
          onClick={() => setTab("signup")}
          className={`flex-1 rounded-lg py-2 font-barlow text-sm font-semibold transition-colors ${
            tab === "signup" ? "bg-gradient-to-br from-hazard2 to-hazard text-[#161006]" : "text-textDim"
          }`}
        >
          Create Account
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-warn/40 bg-warn/15 px-3 py-2.5 text-[11.5px] leading-relaxed text-[#e0c26b]">
          {error}
        </div>
      )}

      {tab === "login" ? (
        <form className="flex flex-col gap-3.5" onSubmit={handleLogin}>
          <div className="font-barlow text-2xl font-bold leading-tight">Welcome back</div>
          <p className="mb-1 text-xs text-textDim">Log in to pick up where you left off</p>

          <Field label="Email" type="email" value={email} onChange={setEmail} />
          <Field label="Password" type="password" value={password} onChange={setPassword} />

          <button
            type="button"
            onClick={() => router.push("/forgot-password")}
            className="-mt-1 text-right text-[11px] text-textDim underline decoration-textDimmer"
          >
            Forgot password?
          </button>

          <PrimaryButton
            type="submit"
            disabled={loading}
            icon={
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#161006" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          >
            {loading ? "Logging in…" : "Log In"}
          </PrimaryButton>
        </form>
      ) : (
        <form className="flex flex-col gap-3.5" onSubmit={handleSignup}>
          <div className="font-barlow text-2xl font-bold leading-tight">Set up your business</div>
          <p className="mb-1 text-xs text-textDim">Takes about a minute</p>

          <Field label="Business name" value={businessName} onChange={setBusinessName} placeholder="e.g. Dan P. Interiors" />
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@business.com" />
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" />

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-textDim">
              What&apos;s your trade?
            </label>
            <div className="flex flex-wrap gap-2">
              {["General Building", "Electrical", "Plumbing", "Painting", "Other"].map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTrade(t)}
                  className={`rounded-full border px-3.5 py-2 text-xs ${
                    trade === t
                      ? "border-hazard bg-gradient-to-br from-hazard2 to-hazard font-semibold text-[#161006]"
                      : "border-line text-textDim"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <PrimaryButton
            type="submit"
            disabled={loading}
            icon={
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#161006" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          >
            {loading ? "Creating account…" : "Create Account"}
          </PrimaryButton>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-textDim">
        {tab === "login" ? (
          <>
            New here?{" "}
            <button className="font-semibold text-hazard" onClick={() => setTab("signup")}>
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button className="font-semibold text-hazard" onClick={() => setTab("login")}>
              Log in
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-xl border border-line bg-panel px-4 pb-2 pt-3.5 focus-within:border-hazard focus-within:bg-panelRaised focus-within:shadow-[0_0_0_4px_#ff6a1f1f]">
      <span className="mb-0.5 block font-mono text-[9.5px] uppercase tracking-wider text-textDim">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full bg-transparent text-sm text-paper placeholder:text-textDimmer"
      />
    </label>
  );
}
