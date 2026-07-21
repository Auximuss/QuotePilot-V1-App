"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme, ThemeMode } from "@/lib/ThemeContext";
import { useTranslation } from "@/lib/LanguageContext";
import { LANGUAGES, type LangCode } from "@/lib/i18n";
import { useQuote } from "@/lib/QuoteContext";
import { quoteTotal } from "@/lib/types";
import TopBar from "@/components/TopBar";

function sb() { return createClient(); }

const LS = {
  validDays: "dp_defaultValidDays", deposit: "dp_depositByDefault",
  depositPct: "dp_depositPercent", vat: "dp_vatRegistered",
  vatNum: "dp_vatNumber", notif: "dp_notifAccepted",
  prefix: "dp_quotePrefix", nextNum: "dp_quoteNextNum",
  payTerms: "dp_paymentTerms", exclusions: "dp_exclusions",
};
function ls(key: string) { return localStorage.getItem(key); }
function lsSet(key: string, val: string) { localStorage.setItem(key, val); }

type PBItem = { id: string; description: string; category: "material" | "labour"; unit: string; unitPrice: number };
type Tab = "business" | "quotes" | "pricebook" | "account";

export default function SettingsPage() {
  return <Suspense><SettingsPageInner /></Suspense>;
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSetupRedirect = searchParams.get("setup") === "1";
  const showUpgraded = searchParams.get("upgraded") === "1";
  const { mode, setMode } = useTheme();
  const { lang, setLang, t: i18n } = useTranslation();
  const { quotes, settings, updateSettings } = useQuote();

  const [tab, setTab] = useState<Tab>("business");

  // DB state
  const [userId, setUserId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [phone, setPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankSort, setBankSort] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [googleReviewLink, setGoogleReviewLink] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  // Subscription
  const [subTier, setSubTier] = useState("free");
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [sentThisMo, setSentThisMo] = useState(0);
  const [monthLimit, setMonthLimit] = useState<number | null>(3);
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null);

  // Logo
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Quote settings
  const [validDays, setValidDays] = useState(settings.defaultValidDays);
  const [depDefault, setDepDefault] = useState(settings.depositByDefault);
  const [depPct, setDepPct] = useState(settings.depositPercent);
  const [vatOn, setVatOn] = useState(settings.vatRegistered);
  const [vatNum, setVatNum] = useState(settings.vatNumber);
  const [prefix, setPrefix] = useState(settings.quotePrefix);
  const [nextNum, setNextNum] = useState(settings.quoteNextNum);
  const [notif, setNotif] = useState(true);
  const [payTerms, setPayTerms] = useState(settings.paymentTerms);
  const [exclusions, setExclusions] = useState(settings.exclusions);

  // Price book
  const [pbItems, setPbItems] = useState<PBItem[]>([]);
  const [pbLoading, setPbLoading] = useState(false);
  const [newItem, setNewItem] = useState<Omit<PBItem, "id">>({ description: "", category: "labour", unit: "", unitPrice: 0 });
  const [pbAddLoading, setPbAddLoading] = useState(false);

  useEffect(() => {
    setValidDays(settings.defaultValidDays); setDepDefault(settings.depositByDefault);
    setDepPct(settings.depositPercent); setVatOn(settings.vatRegistered);
    setVatNum(settings.vatNumber); setPrefix(settings.quotePrefix);
    setNextNum(settings.quoteNextNum); setPayTerms(settings.paymentTerms);
    setExclusions(settings.exclusions);
  }, [settings]);

  useEffect(() => {
    setNotif(ls(LS.notif) !== "false");
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      setUserId(user.id); setEmail(user.email ?? "");
      const { data } = await sb().from("businesses")
        .select("id, name, trade, phone, logo_url, bank_name, bank_sort_code, bank_account, payment_link, google_review_link")
        .eq("owner_id", user.id).single();
      if (data) {
        setBusinessId(data.id ?? ""); setName(data.name ?? "");
        setTrade((data as any).trade ?? ""); setPhone((data as any).phone ?? "");
        setLogoUrl((data as any).logo_url ?? ""); setBankName((data as any).bank_name ?? "");
        setBankSort((data as any).bank_sort_code ?? ""); setBankAccount((data as any).bank_account ?? "");
        setPaymentLink((data as any).payment_link ?? ""); setGoogleReviewLink((data as any).google_review_link ?? "");
      }
      fetch("/api/usage").then(r => r.json()).then(d => {
        if (!d.error) { setSubTier(d.tier ?? "free"); setSubStatus(d.subscriptionStatus ?? null); setSentThisMo(d.sentThisMonth ?? 0); setMonthLimit(d.limit); }
      });
      if (data?.id) {
        setPbLoading(true);
        const { data: items } = await sb().from("price_book_items").select("*").eq("business_id", data.id).order("description");
        if (items) setPbItems(items.map((i: any) => ({ id: i.id, description: i.description, category: i.category, unit: i.unit ?? "", unitPrice: i.unit_price })));
        setPbLoading(false);
      }
    })();
  }, []);

  function initials() {
    if (name) return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return email[0]?.toUpperCase() ?? "?";
  }

  async function saveAll() {
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, trade, phone, bank_name: bankName, bank_sort_code: bankSort,
          bank_account: bankAccount, payment_link: paymentLink,
          google_review_link: googleReviewLink, default_valid_days: validDays,
          deposit_by_default: depDefault, deposit_percent: depPct, vat_registered: vatOn,
          vat_number: vatNum, quote_prefix: prefix, quote_next_num: nextNum,
          payment_terms: payTerms, exclusions,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      updateSettings({ defaultValidDays: validDays, depositByDefault: depDefault, depositPercent: depPct, vatRegistered: vatOn, vatNumber: vatNum, quotePrefix: prefix, quoteNextNum: nextNum, paymentTerms: payTerms, exclusions }, true);
      lsSet(LS.notif, String(notif));
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (err: any) { setSaveError(err?.message ?? "Save failed — please try again."); }
    finally { setSaving(false); }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !userId) return;
    setLogoUploading(true);
    try {
      const path = `${userId}/logo`;
      const { error: upErr } = await sb().storage.from("logos").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = sb().storage.from("logos").getPublicUrl(path);
      await sb().from("businesses").update({ logo_url: publicUrl }).eq("owner_id", userId);
      setLogoUrl(publicUrl);
    } catch (err) { console.error("Logo upload failed:", err); }
    finally { setLogoUploading(false); }
  }

  async function removeLogo() {
    if (!userId) return;
    await sb().storage.from("logos").remove([`${userId}/logo`]);
    await sb().from("businesses").update({ logo_url: null }).eq("owner_id", userId);
    setLogoUrl("");
  }

  function getShareLink() {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/request/${businessId}`;
  }
  function copyShareLink() { navigator.clipboard.writeText(getShareLink()); setShareLinkCopied(true); setTimeout(() => setShareLinkCopied(false), 2000); }

  async function changePassword() {
    if (newPassword.length < 8) { setPwError("Must be at least 8 characters."); return; }
    setPwLoading(true); setPwError(null);
    const { error } = await sb().auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (error) setPwError(error.message);
    else { setNewPassword(""); setPwSaved(true); setTimeout(() => setPwSaved(false), 1800); }
  }

  async function addPriceBookItem() {
    if (!newItem.description.trim() || !businessId) return;
    setPbAddLoading(true);
    const { data, error } = await sb().from("price_book_items").insert({ business_id: businessId, description: newItem.description, category: newItem.category, unit: newItem.unit || null, unit_price: newItem.unitPrice }).select().single();
    if (!error && data) { setPbItems(prev => [...prev, { id: data.id, description: data.description, category: data.category, unit: data.unit ?? "", unitPrice: data.unit_price }]); setNewItem({ description: "", category: "labour", unit: "", unitPrice: 0 }); }
    setPbAddLoading(false);
  }

  async function deletePriceBookItem(id: string) {
    await sb().from("price_book_items").delete().eq("id", id);
    setPbItems(prev => prev.filter(i => i.id !== id));
  }

  function exportQuotesCSV() {
    const headers = ["Quote #", "Customer", "Job", "Address", "Status", "Total (£)", "Created", "Sent", "Accepted"];
    const rows = quotes.map(q => [q.quoteNumber ?? q.id.slice(0, 8).toUpperCase(), q.customer, q.job, q.address, q.status, quoteTotal(q).toFixed(2), new Date(q.createdAt).toLocaleDateString("en-GB"), q.sentAt ? new Date(q.sentAt).toLocaleDateString("en-GB") : "", q.acceptedAt ? new Date(q.acceptedAt).toLocaleDateString("en-GB") : ""]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `demand-pilot-quotes-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    const res = await fetch("/api/stripe/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnUrl: window.location.origin + "/settings" }) });
    const data = await res.json();
    if (data.url) window.location.href = data.url; else setPortalLoading(false);
  }

  async function startUpgrade(tier: string) {
    setUpgradeLoading(tier);
    try {
      const origin = window.location.origin;
      const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier, successUrl: `${origin}/settings?upgraded=1`, cancelUrl: `${origin}/settings` }) });
      const data = await res.json();
      if (data.url) window.location.href = data.url; else { alert("Checkout error: " + (data.error || "Unknown")); setUpgradeLoading(null); }
    } catch (err: any) { alert("Failed: " + err.message); setUpgradeLoading(null); }
  }

  async function signOut() { await sb().auth.signOut(); router.push("/login"); }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "business", label: "Business", icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" },
    { id: "quotes", label: "Quotes", icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8" },
    { id: "pricebook", label: "Rates", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
    { id: "account", label: "Account", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 110 8 4 4 0 010-8z" },
  ];

  const needsSave = tab === "business" || tab === "quotes";

  return (
    <div className="flex min-h-screen flex-col bg-[#08090a]">
      <TopBar title={i18n.settings.title} back="/home" />

      {isSetupRedirect && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-hazard/40 bg-hazard/10 px-4 py-3.5">
          <svg width="18" height="18" className="mt-0.5 flex-none text-hazard" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <div>
            <div className="font-barlow text-[13px] font-bold text-hazard">Add your business name first</div>
            <div className="mt-0.5 text-[11px] text-textDim">It appears on every quote — takes 10 seconds.</div>
          </div>
        </div>
      )}

      {/* ── Profile card ──────────────────────────────────────────────────── */}
      <div className="mx-4 mt-4 flex items-center gap-4 rounded-2xl border border-line bg-panel px-4 py-4">
        <div className="relative flex-none">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="h-14 w-14 rounded-2xl object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-hazard2 to-hazard font-barlow text-xl font-bold text-[#161006] shadow-[0_4px_14px_-2px_rgba(255,106,31,0.4)]">
              {initials()}
            </div>
          )}
          <button
            onClick={() => logoInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-panelRaised text-textDim"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-barlow text-[17px] font-bold leading-tight">{name || "Your business"}</div>
          {trade && <div className="mt-0.5 text-[11px] text-hazard">{trade}</div>}
          <div className="mt-0.5 truncate text-[11px] text-textDim">{email}</div>
        </div>
        {logoUrl && (
          <button onClick={removeLogo} className="flex-none text-[10px] text-textDimmer underline">Remove</button>
        )}
      </div>
      {logoUploading && <div className="mx-4 mt-1 text-center text-[10px] text-textDim">Uploading logo…</div>}

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="mx-4 mt-4 grid grid-cols-4 gap-1 rounded-2xl border border-line bg-panel p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 transition-all ${tab === t.id ? "bg-hazard/15 text-hazard" : "text-textDimmer"}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              {t.icon.split(" M").map((p, i) => <path key={i} d={i === 0 ? p : "M" + p} />)}
            </svg>
            <span className="font-mono text-[9px] font-semibold uppercase tracking-wide">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 pb-28 pt-3">

        {/* BUSINESS TAB */}
        {tab === "business" && (
          <div className="space-y-3">

            {/* Business info */}
            <Card title="Your details">
              <Field label="Business name">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Smith Plumbing Ltd" className="field" />
              </Field>
              <Field label="Trade" className="mt-3">
                <input value={trade} onChange={e => setTrade(e.target.value)} placeholder="e.g. General builder, Electrician" className="field" />
              </Field>
              <Field label="Phone" className="mt-3">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 900 123" className="field" />
              </Field>
            </Card>

            {/* Payment */}
            <Card title="Where customers pay">
              <Field label="Bank name">
                <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Starling Bank" className="field" />
              </Field>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Sort code">
                  <input value={bankSort} onChange={e => setBankSort(e.target.value)} placeholder="60-00-00" className="field" />
                </Field>
                <Field label="Account number">
                  <input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="12345678" className="field" />
                </Field>
              </div>
              <div className="my-3 h-px bg-line" />
              <Field label="Online payment link">
                <input value={paymentLink} onChange={e => setPaymentLink(e.target.value)} placeholder="https://buy.stripe.com/your-link" className="field" />
                <p className="mt-1 text-[10.5px] text-textDimmer">Stripe, PayPal or GoCardless link — adds a "Pay online" button to quotes.</p>
              </Field>
              <Field label="Google review link" className="mt-3">
                <input value={googleReviewLink} onChange={e => setGoogleReviewLink(e.target.value)} placeholder="https://g.page/r/your-review-link" className="field" />
                <p className="mt-1 text-[10.5px] text-textDimmer">Used in the "Ask for Review" button after jobs complete.</p>
              </Field>
            </Card>

            {/* Share link */}
            {businessId && (
              <Card title="Your quote request link">
                <p className="mb-3 text-[11px] text-textDim">Share this with customers so they can request a quote — you'll see it on your dashboard.</p>
                <div className="flex items-center gap-2 rounded-xl border border-line bg-panelRaised px-3 py-2.5">
                  <span className="flex-1 truncate font-mono text-[10.5px] text-textDim">{getShareLink()}</span>
                  <button onClick={copyShareLink} className={`flex-none rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${shareLinkCopied ? "bg-ok/15 text-ok" : "bg-line text-paper"}`}>
                    {shareLinkCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </Card>
            )}

          </div>
        )}

        {/* QUOTES TAB */}
        {tab === "quotes" && (
          <div className="space-y-3">

            <Card title="Defaults">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium">Quote valid for</div>
                  <div className="text-[11px] text-textDim">How long quotes stay open</div>
                </div>
                <select value={validDays} onChange={e => setValidDays(parseInt(e.target.value))} className="select">
                  {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
              <div className="my-3 h-px bg-line" />
              <Toggle label="Request deposit by default" sub="Pre-ticked on every new quote" value={depDefault} onChange={v => setDepDefault(v)} />
              {depDefault && (
                <div className="mt-3 flex items-center gap-2 pl-0.5">
                  <span className="text-[11px] text-textDim">Deposit</span>
                  <select value={depPct} onChange={e => setDepPct(parseInt(e.target.value))} className="select">
                    {[10, 15, 20, 25, 30, 33, 50].map(p => <option key={p} value={p}>{p}%</option>)}
                  </select>
                  <span className="text-[11px] text-textDim">of total</span>
                </div>
              )}
              <div className="my-3 h-px bg-line" />
              <Toggle label="VAT registered" sub="Adds VAT breakdown + your number to quotes" value={vatOn} onChange={v => { setVatOn(v); if (!v) setVatNum(""); }} />
              {vatOn && (
                <input value={vatNum} onChange={e => setVatNum(e.target.value)} placeholder="GB123456789" className="field mt-3" />
              )}
            </Card>

            <Card title="Quote numbering">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prefix">
                  <input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="e.g. SP-" className="field" />
                </Field>
                <Field label="Starting number">
                  <input type="number" min={1} value={nextNum} onChange={e => setNextNum(parseInt(e.target.value) || 1)} className="field" />
                </Field>
              </div>
              <div className="mt-2.5 rounded-xl bg-panelRaised px-3 py-2 font-mono text-[11px] text-textDim">
                Preview: <span className="text-hazard">{prefix ? `${prefix}${String(nextNum).padStart(4, "0")}` : "QUOTE-0001 (default)"}</span>
              </div>
            </Card>

            <Card title="Quote text">
              <Field label="Payment terms">
                <textarea value={payTerms} onChange={e => setPayTerms(e.target.value)} rows={3} placeholder="e.g. Payment due within 14 days of invoice…" className="field resize-none" />
              </Field>
              <Field label="Exclusions" className="mt-3">
                <textarea value={exclusions} onChange={e => setExclusions(e.target.value)} rows={2} placeholder="e.g. Excludes skip hire, scaffolding…" className="field resize-none" />
              </Field>
            </Card>

            <Card title="Notifications">
              <Toggle label="Alert when a quote is accepted" sub="In-app banner on your dashboard" value={notif} onChange={v => { setNotif(v); lsSet(LS.notif, String(v)); }} />
            </Card>

          </div>
        )}

        {/* PRICE BOOK TAB */}
        {tab === "pricebook" && (
          <div className="space-y-3">
            <Card title="Your standard rates">
              <p className="mb-3 text-[11px] text-textDim">The AI uses these to price jobs automatically. Add your day rates, materials, and common line items.</p>

              {pbLoading ? (
                <div className="py-6 text-center text-xs text-textDim">Loading…</div>
              ) : pbItems.length === 0 ? (
                <div className="mb-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-textDim">
                  No rates yet — add your first one below.
                </div>
              ) : (
                <div className="mb-3 space-y-1.5">
                  {pbItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-line bg-panelRaised px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{item.description}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-textDim">
                          {item.category} · {item.unit || "each"} · £{item.unitPrice}
                        </div>
                      </div>
                      <button onClick={() => deletePriceBookItem(item.id)} className="flex-none text-textDimmer transition-colors hover:text-red-400">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-dashed border-line p-3">
                <div className="mb-2.5 font-mono text-[10px] uppercase tracking-wider text-textDimmer">Add new rate</div>
                <input value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} placeholder="Description (e.g. Day rate labour)" className="field mb-2.5" />
                <div className="grid grid-cols-3 gap-2">
                  <select value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value as any }))} className="select">
                    <option value="labour">Labour</option>
                    <option value="material">Material</option>
                  </select>
                  <input value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))} placeholder="Unit (day, m²)" className="field" />
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-textDimmer">£</span>
                    <input type="number" min={0} value={newItem.unitPrice || ""} onChange={e => setNewItem(p => ({ ...p, unitPrice: parseFloat(e.target.value) || 0 }))} placeholder="0" className="field pl-6" />
                  </div>
                </div>
                <button onClick={addPriceBookItem} disabled={!newItem.description.trim() || pbAddLoading} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-hazard2 to-hazard py-2.5 text-xs font-bold text-[#161006] disabled:opacity-40">
                  {pbAddLoading ? "Adding…" : "+ Add rate"}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ACCOUNT TAB */}
        {tab === "account" && (
          <div className="space-y-3">

            {/* Appearance */}
            <Card title="Appearance">
              <div className="grid grid-cols-3 gap-2">
                {(["dark", "system", "light"] as ThemeMode[]).map(m => (
                  <ThemeOption key={m} mode={m} active={mode === m} onSelect={() => setMode(m)} />
                ))}
              </div>
            </Card>

            {/* Language */}
            <Card title="Language">
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(LANGUAGES) as [LangCode, string][]).map(([code, lname]) => (
                  <button key={code} onClick={() => setLang(code)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${lang === code ? "border-hazard/50 bg-hazard/10 text-paper" : "border-line bg-panelRaised text-textDim"}`}>
                    <span className="text-base leading-none">{langFlag(code)}</span>
                    <span className="text-[12px] font-medium">{lname}</span>
                    {lang === code && <svg className="ml-auto flex-none text-hazard" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                ))}
              </div>
            </Card>

            {/* Billing */}
            <Card title="Plan & billing">
              {showUpgraded && (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-ok/40 bg-ok/10 px-3 py-2.5 text-[12px] font-semibold text-ok">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Plan upgraded successfully!
                </div>
              )}
              <div className="mb-3 flex items-center justify-between rounded-xl border border-line bg-panelRaised px-3.5 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-barlow text-[15px] font-bold capitalize">{subTier}</span>
                    {subStatus === "past_due" && <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[9.5px] font-bold text-warn">Payment issue</span>}
                    {(subStatus === "active" || subStatus === "trialing") && subTier !== "free" && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[9.5px] font-bold text-ok">Active</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-textDim">
                    {monthLimit === null ? "Unlimited sent quotes" : `${sentThisMo} / ${monthLimit} quotes sent this month`}
                  </div>
                </div>
                {monthLimit !== null && (
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                    <div className={`h-full rounded-full ${sentThisMo >= monthLimit ? "bg-warn" : "bg-hazard"}`} style={{ width: `${Math.min(100, (sentThisMo / monthLimit) * 100)}%` }} />
                  </div>
                )}
              </div>
              {subTier === "free" ? (
                <div className="space-y-2">
                  {(["trade", "pro", "business"] as const).map(t => {
                    const prices: Record<string, string> = { trade: "£7.99", pro: "£14.99", business: "£24.99" };
                    const limits: Record<string, string> = { trade: "50 quotes/mo", pro: "Unlimited", business: "Unlimited + team" };
                    return (
                      <button key={t} onClick={() => startUpgrade(t)} disabled={upgradeLoading !== null} className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 transition-all active:scale-[0.98] disabled:opacity-60 ${t === "pro" ? "border-hazard/50 bg-hazard/8" : "border-line bg-panelRaised"}`}>
                        <div className="text-left">
                          <span className="font-barlow text-[13.5px] font-bold capitalize">{t}</span>
                          <span className="ml-2 font-mono text-[11px] text-textDim">{prices[t]}/mo · {limits[t]}</span>
                        </div>
                        {upgradeLoading === t ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-textDim border-t-paper" /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t === "pro" ? "#ff6a1f" : "currentColor"} strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6"/></svg>}
                      </button>
                    );
                  })}
                  <button onClick={() => router.push("/pricing")} className="w-full text-center text-[11px] text-textDim underline">Compare all plans</button>
                </div>
              ) : (
                <button onClick={openBillingPortal} disabled={portalLoading} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-panelRaised py-2.5 text-[13px] font-semibold disabled:opacity-50">
                  {portalLoading ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-textDim border-t-paper" /> Opening…</> : "Manage subscription & billing →"}
                </button>
              )}
            </Card>

            {/* Password */}
            <Card title="Change password">
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (8+ characters)" className="field pr-10" />
                <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-textDimmer" tabIndex={-1}>
                  {showPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {pwError && <div className="mt-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] text-[#e0c26b]">{pwError}</div>}
              <button onClick={changePassword} disabled={pwLoading || !newPassword} className={`mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 ${pwSaved ? "border border-ok/40 bg-ok/10 text-ok" : "bg-gradient-to-br from-hazard2 to-hazard text-[#161006]"}`}>
                {pwLoading ? "Updating…" : pwSaved ? "✓ Password updated" : "Update password"}
              </button>
            </Card>

            {/* Data export */}
            <Card title="Export data">
              <p className="mb-3 text-[11px] text-textDim">Download all your quotes as a CSV — handy for your accountant.</p>
              <button onClick={exportQuotesCSV} disabled={quotes.length === 0} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-panelRaised py-2.5 text-sm font-semibold disabled:opacity-40">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                Export {quotes.length} quote{quotes.length !== 1 ? "s" : ""} as CSV
              </button>
            </Card>

            {/* About */}
            <Card title="About">
              {[["App", "Demand Pilot"], ["Version", "1.0.0"], ["Built for", "UK tradespeople"], ["Quotes created", String(quotes.length)]].map(([l, v]) => (
                <div key={l} className="flex items-center justify-between py-1.5">
                  <span className="text-[12px] text-textDim">{l}</span>
                  <span className="text-[12px] font-medium">{v}</span>
                </div>
              ))}
            </Card>

            {/* Sign out */}
            <button onClick={signOut} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/8 py-3.5 text-sm font-semibold text-red-400 transition-colors active:bg-red-500/15">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              {i18n.common.signOut}
            </button>
          </div>
        )}

      </div>

      {/* ── Sticky save bar (Business + Quotes tabs only) ──────────────── */}
      {needsSave && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-line bg-[#0e1012]/90 px-4 pb-6 pt-3 backdrop-blur-md">
          {saveError && <div className="mb-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] text-[#e0c26b]">{saveError}</div>}
          <button onClick={saveAll} disabled={saving} className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold transition-all disabled:opacity-40 ${saved ? "border border-ok/40 bg-ok/10 text-ok" : "bg-gradient-to-br from-hazard2 to-hazard text-[#161006] shadow-[0_3px_10px_-2px_rgba(255,106,31,0.3)]"}`}>
            {saving ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#161006]/30 border-t-[#161006]" /> Saving…</> : saved ? <>✓ Saved</> : i18n.settings.saveChanges}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Components ──────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 pb-4 pt-3.5">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-textDim">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1.5 text-[11px] font-semibold text-textDim">{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, sub, value, onChange }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex w-full items-center gap-3 text-left">
      <span className="flex-1">
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[11px] text-textDim">{sub}</span>
      </span>
      <span className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors duration-200 ${value ? "bg-hazard" : "bg-line"}`}>
        <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-paper shadow-sm transition-transform duration-200 ${value ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
      </span>
    </button>
  );
}

function ThemeOption({ mode, active, onSelect }: { mode: ThemeMode; active: boolean; onSelect: () => void }) {
  const labels: Record<ThemeMode, string> = { dark: "Dark", system: "Auto", light: "Light" };
  const dark = mode === "dark";
  const isSystem = mode === "system";
  return (
    <button onClick={onSelect} className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${active ? "border-hazard bg-hazard/10" : "border-line bg-panelRaised"}`}>
      {isSystem ? (
        <div className="h-10 w-full overflow-hidden rounded-lg border border-line">
          <div className="flex h-full">
            <div className="flex w-1/2 flex-col gap-1 bg-[#1b1e23] p-1.5"><div className="h-1.5 w-full rounded bg-hazard" /><div className="h-1 w-3/4 rounded bg-[#2e333a]" /></div>
            <div className="flex w-1/2 flex-col gap-1 bg-white p-1.5"><div className="h-1.5 w-full rounded bg-hazard" /><div className="h-1 w-3/4 rounded bg-[#e4dfd8]" /></div>
          </div>
        </div>
      ) : (
        <div className="h-10 w-full overflow-hidden rounded-lg border border-line p-1.5" style={{ background: dark ? "#1b1e23" : "#ffffff" }}>
          <div className="mb-1 flex items-center gap-1"><div className="h-1.5 w-4 rounded bg-hazard" /><div className="h-1.5 flex-1 rounded" style={{ background: dark ? "#2e333a" : "#e4dfd8" }} /></div>
          <div className="mb-1 h-1 w-full rounded" style={{ background: dark ? "#2e333a" : "#e4dfd8" }} />
          <div className="h-1 w-3/4 rounded" style={{ background: dark ? "#3a3f47" : "#d5cfc8" }} />
        </div>
      )}
      <span className={`text-[11px] font-semibold ${active ? "text-hazard" : "text-textDim"}`}>{labels[mode]}</span>
      {active && <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-hazard"><svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="#161006" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"/></svg></span>}
    </button>
  );
}

function langFlag(code: LangCode): string {
  const flags: Record<LangCode, string> = { en: "🇬🇧", pl: "🇵🇱", cy: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", ro: "🇷🇴", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", pt: "🇵🇹", it: "🇮🇹", lt: "🇱🇹", lv: "🇱🇻", uk: "🇺🇦" };
  return flags[code] ?? "🌐";
}

function EyeIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>; }
function EyeOffIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>; }
