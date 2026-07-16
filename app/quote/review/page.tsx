"use client";

import { useState, useRef, Suspense, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useQuote } from "@/lib/QuoteContext";
import { useTranslation } from "@/lib/LanguageContext";
import { quoteTotal } from "@/lib/types";
import ScreenHeader from "@/components/ScreenHeader";
import PrimaryButton from "@/components/PrimaryButton";

function sb() { return createClient(); }

type PhotoItem = { url: string; uploading?: boolean; id?: string };
type UpsellSuggestion = { description: string; reason: string; estimatedPrice: number };
type Benchmark = { rating: "low" | "fair" | "high"; marketLow: number; marketHigh: number; summary: string };
type Template = { id: string; name: string; job_title: string; line_items: any[] };
type PastCustomer = { customer_name: string; address: string; customer_email: string };

function ReviewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const id = searchParams.get("id") ?? "";
  const { getQuote, updateLineItemPrice, updateCustomerField, toggleDeposit, setValidDays,
    addLineItem, removeLineItem, updateLineItemDesc, createDraftFromAi } = useQuote();

  const [savedChip, setSavedChip] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // New feature states
  const [wastageOn, setWastageOn] = useState(false);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [upsells, setUpsells] = useState<UpsellSuggestion[]>([]);
  const [upsellLoading, setUpsellLoading] = useState(false);
  const [upsellDone, setUpsellDone] = useState(false);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [pastCustomers, setPastCustomers] = useState<PastCustomer[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<PastCustomer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const quote = getQuote(id);

  // Load settings, photos, templates, past customers
  useEffect(() => {
    if (!id) return;

    // Photos
    fetch(`/api/quotes/${id}/photos`)
      .then(r => r.json())
      .then(d => { if (d.photos?.length) setPhotos(d.photos.map((url: string) => ({ url }))); })
      .catch(() => {});

    // VAT setting
    sb().from("businesses").select("vat_registered, vat_number").eq("owner_id", (async () => {
      const { data: { user } } = await sb().auth.getUser();
      return user?.id ?? "";
    })()).single().then(({ data }) => {
      if (data) { setVatRegistered(!!data.vat_registered); setVatNumber(data.vat_number ?? ""); }
    });

    // Templates
    fetch("/api/templates").then(r => r.json()).then(d => setTemplates(d.templates ?? [])).catch(() => {});

    // Past customers
    sb().from("quotes").select("customer_name, address, customer_email")
      .not("customer_name", "is", null).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => {
        if (data) {
          const seen = new Set<string>();
          const unique = data.filter((c: any) => {
            if (!c.customer_name || seen.has(c.customer_name)) return false;
            seen.add(c.customer_name);
            return true;
          });
          setPastCustomers(unique as PastCustomer[]);
        }
      });
  }, [id]);

  // Load VAT using auth properly
  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      const { data } = await sb().from("businesses").select("vat_registered, vat_number").eq("owner_id", user.id).single();
      if (data) { setVatRegistered(!!data.vat_registered); setVatNumber(data.vat_number ?? ""); }
    })();
  }, []);

  // Fetch upsells + benchmark once quote loads
  useEffect(() => {
    if (!quote || upsellDone) return;
    setUpsellDone(true);

    const fetchAI = async () => {
      const total = quoteTotal(quote);
      setUpsellLoading(true);
      setBenchmarkLoading(true);

      const [upsellRes, benchRes] = await Promise.allSettled([
        fetch("/api/quotes/upsell", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobTitle: quote.job, lineItems: quote.lineItems, trade: "" }),
        }).then(r => r.json()),
        fetch("/api/quotes/benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobTitle: quote.job, total, lineItems: quote.lineItems }),
        }).then(r => r.json()),
      ]);

      if (upsellRes.status === "fulfilled") setUpsells(upsellRes.value.suggestions ?? []);
      if (benchRes.status === "fulfilled") setBenchmark(benchRes.value.benchmark ?? null);
      setUpsellLoading(false);
      setBenchmarkLoading(false);
    };

    fetchAI();
  }, [quote, upsellDone]);

  // Customer autocomplete
  const handleCustomerInput = useCallback((val: string) => {
    updateCustomerField(quote!.id, "customer", val);
    if (val.length < 2) { setCustomerSuggestions([]); setShowCustomerDropdown(false); return; }
    const matches = pastCustomers.filter(c =>
      c.customer_name.toLowerCase().includes(val.toLowerCase())
    );
    setCustomerSuggestions(matches);
    setShowCustomerDropdown(matches.length > 0);
  }, [pastCustomers, quote, updateCustomerField]);

  function selectCustomer(c: PastCustomer) {
    updateCustomerField(quote!.id, "customer", c.customer_name);
    updateCustomerField(quote!.id, "address", c.address ?? "");
    updateCustomerField(quote!.id, "customerEmail", c.customer_email ?? "");
    setShowCustomerDropdown(false);
  }

  if (!quote) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <div className="font-barlow text-lg font-semibold">Quote not found</div>
        <button onClick={() => router.push("/home")} className="mt-4 text-xs font-semibold text-hazard">Back to dashboard</button>
      </div>
    );
  }

  const total = quoteTotal(quote);
  const materials = quote.lineItems.filter(l => l.category === "material");
  const labour = quote.lineItems.filter(l => l.category === "labour");
  const materialTotal = materials.reduce((s, l) => s + l.price, 0);
  const labourTotal = labour.reduce((s, l) => s + l.price, 0);
  const labourPct = total > 0 ? Math.round((labourTotal / total) * 100) : 0;
  const vatAmount = vatRegistered ? Math.round(total * 0.2) : 0;
  const totalIncVat = total + vatAmount;

  const confidenceColor = quote.confidence >= 85 ? "text-ok" : quote.confidence >= 60 ? "text-warn" : "text-hazard";

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const placeholders = files.map(f => ({ url: URL.createObjectURL(f), uploading: true }));
    setPhotos(prev => [...prev, ...placeholders]);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `${quote!.id}/${Date.now()}-${file.name}`;
      const { error } = await sb().storage.from("quote-photos").upload(path, file, { contentType: file.type });
      if (!error) {
        const { data: { publicUrl } } = sb().storage.from("quote-photos").getPublicUrl(path);
        setPhotos(prev => { const next = [...prev]; const idx = next.findIndex(p => p.uploading && p.url === placeholders[i].url); if (idx !== -1) next[idx] = { url: publicUrl, uploading: false, id: path }; return next; });
      }
    }
    e.target.value = "";
  }

  function removePhoto(index: number) {
    const photo = photos[index];
    setPhotos(prev => prev.filter((_, i) => i !== index));
    if (photo?.id) sb().storage.from("quote-photos").remove([photo.id]).catch(() => {});
  }

  function handlePriceSave(itemId: string, value: number) {
    updateLineItemPrice(quote!.id, itemId, value);
    setSavedChip(true);
    setTimeout(() => setSavedChip(false), 1600);
  }

  async function addUpsellItem(u: UpsellSuggestion) {
    addLineItem(quote!.id, "labour");
    setUpsells(prev => prev.filter(x => x.description !== u.description));
  }

  async function saveTemplate() {
    if (!saveTemplateName.trim()) return;
    setSavingTemplate(true);
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: saveTemplateName,
        jobTitle: quote.job,
        lineItems: quote.lineItems,
        suggestedExclusions: quote.checks,
      }),
    });
    setSavingTemplate(false);
    setShowSaveTemplate(false);
    setSaveTemplateName("");
    fetch("/api/templates").then(r => r.json()).then(d => setTemplates(d.templates ?? []));
  }

  async function deleteTemplate(templateId: string) {
    await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
    setTemplates(prev => prev.filter(t => t.id !== templateId));
  }

  function loadTemplate(tpl: Template) {
    createDraftFromAi({
      job_title: tpl.job_title,
      customer_summary: "",
      scope_of_work: [],
      line_items: tpl.line_items.map((li: any) => ({
        category: li.category,
        description: li.desc,
        quantity: null,
        unit: "",
        estimated_unit_price: li.price,
      })),
      suggested_exclusions: [],
      clarifications_needed: [],
      confidence: 100,
    });
    setShowTemplates(false);
  }

  const benchmarkColour = benchmark?.rating === "low" ? "text-ok" : benchmark?.rating === "fair" ? "text-blue-400" : "text-warn";
  const benchmarkBg = benchmark?.rating === "low" ? "bg-ok/10 border-ok/30" : benchmark?.rating === "fair" ? "bg-blue-500/10 border-blue-500/30" : "bg-warn/10 border-warn/30";
  const benchmarkLabel = benchmark?.rating === "low" ? "Below market" : benchmark?.rating === "fair" ? "Fair market rate" : "Above market";

  return (
    <div className="relative flex min-h-screen flex-col">
      <ScreenHeader title={t.quote.reviewTitle} back="/quote/new" />

      <div className="flex-1 overflow-y-auto px-4.5 pb-6">

        {/* Top bar: confidence + benchmark pill */}
        <div className="my-2.5 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-hazardDim px-2 py-1 font-mono text-[9.5px] uppercase tracking-wider text-hazard">
            ✦ Generated from voice note
          </div>
          <div className={`font-mono text-[11px] font-semibold ${confidenceColor}`}>
            Confidence {quote.confidence}%
          </div>
        </div>

        {/* Benchmark pill */}
        {benchmarkLoading && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-[11px] text-textDim">
            <div className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/60" />
            Analysing market rates…
          </div>
        )}
        {benchmark && !benchmarkLoading && (
          <div className={`mb-2 flex items-center justify-between rounded-lg border px-3 py-2 ${benchmarkBg}`}>
            <span className={`text-[11px] font-semibold ${benchmarkColour}`}>{benchmarkLabel}</span>
            <span className="text-[10px] text-textDim">
              Typical: £{benchmark.marketLow.toLocaleString()}–£{benchmark.marketHigh.toLocaleString()}
            </span>
          </div>
        )}
        {benchmark?.summary && (
          <div className="mb-3 text-[10.5px] text-textDim">{benchmark.summary}</div>
        )}

        <div className="font-barlow text-xl font-bold">{quote.job}</div>

        {/* Templates row */}
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[11px] text-textDim transition-colors hover:border-hazard hover:text-hazard"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Templates
          </button>
          <button
            onClick={() => setShowSaveTemplate(!showSaveTemplate)}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[11px] text-textDim transition-colors hover:border-hazard hover:text-hazard"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save as template
          </button>
        </div>

        {/* Save template input */}
        {showSaveTemplate && (
          <div className="mt-2 flex gap-2">
            <input
              value={saveTemplateName}
              onChange={e => setSaveTemplateName(e.target.value)}
              placeholder="Template name (e.g. Bathroom retile)"
              className="flex-1 rounded-lg border border-hazard bg-panel px-3 py-2 text-xs text-paper placeholder:text-textDimmer focus:outline-none"
              onKeyDown={e => { if (e.key === "Enter") saveTemplate(); }}
            />
            <button
              onClick={saveTemplate}
              disabled={savingTemplate || !saveTemplateName.trim()}
              className="rounded-lg bg-hazard px-3 py-2 text-[11px] font-bold text-[#161006] disabled:opacity-50"
            >
              {savingTemplate ? "…" : "Save"}
            </button>
          </div>
        )}

        {/* Templates list */}
        {showTemplates && (
          <div className="mt-2 rounded-xl border border-line bg-panel p-3">
            {templates.length === 0 ? (
              <div className="text-center text-[11px] text-textDim py-3">No templates saved yet. Use "Save as template" after building a quote.</div>
            ) : (
              <div className="space-y-2">
                {templates.map(tpl => (
                  <div key={tpl.id} className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => loadTemplate(tpl)}
                      className="flex-1 text-left text-[12px] font-medium text-paper hover:text-hazard transition-colors"
                    >
                      {tpl.name}
                      <span className="ml-2 text-[10px] text-textDim">({tpl.line_items?.length ?? 0} items)</span>
                    </button>
                    <button
                      onClick={() => deleteTemplate(tpl.id)}
                      className="text-textDimmer hover:text-red-400 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Customer section */}
        <SectionLabel>{t.quote.customer}</SectionLabel>
        <div className="flex flex-col gap-2">
          {/* Customer name with autocomplete */}
          <div className="relative">
            <input
              value={quote.customer}
              onChange={e => handleCustomerInput(e.target.value)}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
              placeholder="Customer name"
              className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-paper placeholder:text-textDimmer focus:border-hazard focus:outline-none"
            />
            {showCustomerDropdown && (
              <div className="absolute left-0 right-0 top-full z-20 mt-0.5 rounded-lg border border-line bg-panelRaised shadow-lg">
                {customerSuggestions.map((c, i) => (
                  <button
                    key={i}
                    onMouseDown={() => selectCustomer(c)}
                    className="flex w-full flex-col px-3 py-2 text-left hover:bg-hazard/10"
                  >
                    <span className="text-[12px] font-medium text-paper">{c.customer_name}</span>
                    {c.address && <span className="text-[10px] text-textDim">{c.address}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <EditableField placeholder="Job address" value={quote.address} onChange={v => updateCustomerField(quote.id, "address", v)} />
          <EditableField placeholder="Customer email (for payment requests)" value={quote.customerEmail ?? ""} onChange={v => updateCustomerField(quote.id, "customerEmail", v)} />
          <EditableField placeholder="Notes for this job (optional)" value={quote.notes} onChange={v => updateCustomerField(quote.id, "notes", v)} textarea />
        </div>

        {/* Materials with wastage toggle */}
        <div className="mb-2 mt-4 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-textDim">{t.quote.materials}</span>
          <button
            onClick={() => setWastageOn(!wastageOn)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors ${wastageOn ? "bg-hazard/20 text-hazard" : "border border-line text-textDimmer hover:border-hazard hover:text-hazard"}`}
          >
            +10% wastage {wastageOn ? "ON" : "OFF"}
          </button>
        </div>
        {materials.map(item => (
          <LineRow
            key={item.id}
            item={wastageOn ? { ...item, meta: item.meta ? `${item.meta} (+10% wastage)` : "+10% wastage", price: Math.ceil(item.price * 1.1) } : item}
            onSavePrice={handlePriceSave}
            onSaveDesc={(id, d) => updateLineItemDesc(quote.id, id, d)}
            onDelete={id => removeLineItem(quote.id, id)}
          />
        ))}
        <button onClick={() => addLineItem(quote.id, "material")} className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-2 text-[11px] text-textDimmer transition-colors hover:border-hazard hover:text-hazard">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          {t.quote.addItem}
        </button>

        <SectionLabel>{t.quote.labour}</SectionLabel>
        {labour.map(item => (
          <LineRow
            key={item.id}
            item={item}
            onSavePrice={handlePriceSave}
            onSaveDesc={(id, d) => updateLineItemDesc(quote.id, id, d)}
            onDelete={id => removeLineItem(quote.id, id)}
          />
        ))}
        <button onClick={() => addLineItem(quote.id, "labour")} className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-2 text-[11px] text-textDimmer transition-colors hover:border-hazard hover:text-hazard">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          {t.quote.addItem}
        </button>

        {/* Totals + VAT */}
        <div className="mt-4 space-y-1.5 border-t border-line pt-3.5">
          {vatRegistered && (
            <>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-textDim">Subtotal (exc VAT)</span>
                <span className="font-mono text-[13px] text-paper">£{total.toLocaleString("en-GB")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-textDim">VAT 20%{vatNumber ? ` · ${vatNumber}` : ""}</span>
                <span className="font-mono text-[13px] text-paper">£{vatAmount.toLocaleString("en-GB")}</span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-textDim">
              {vatRegistered ? "Total (inc VAT)" : t.quote.total}
            </span>
            <span className="font-barlow text-2xl font-bold text-hazard">
              £{(vatRegistered ? totalIncVat : total).toLocaleString("en-GB")}
            </span>
          </div>
        </div>

        {/* Profit margin bar */}
        {total > 0 && (
          <div className="mt-3 rounded-xl border border-line bg-panel px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-textDim">Quote breakdown</span>
              <span className="font-mono text-[10px] text-textDim">{labourPct}% labour</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-line">
              <div className="bg-hazard transition-all" style={{ width: `${labourPct}%` }} />
              <div className="bg-blue-500/60 transition-all" style={{ width: `${100 - labourPct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9px] text-textDimmer">
              <span>Labour £{labourTotal.toLocaleString("en-GB")}</span>
              <span>Materials £{materialTotal.toLocaleString("en-GB")}</span>
            </div>
          </div>
        )}

        {/* AI Upsell suggestions */}
        {upsellLoading && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-[11px] text-textDim">
            <div className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-hazard" />
            Finding add-on opportunities…
          </div>
        )}
        {upsells.length > 0 && (
          <div className="mt-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-textDim">💡 Suggested add-ons</div>
            <div className="space-y-2">
              {upsells.map((u, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
                  <div className="flex-1">
                    <div className="text-[12px] font-semibold text-paper">{u.description}</div>
                    <div className="mt-0.5 text-[10px] text-textDim">{u.reason}</div>
                    <div className="mt-1 font-mono text-[11px] text-blue-400">~£{u.estimatedPrice.toLocaleString("en-GB")}</div>
                  </div>
                  <button
                    onClick={() => addUpsellItem(u)}
                    className="mt-0.5 flex-none rounded-md bg-blue-500/20 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-blue-400 transition-colors hover:bg-blue-500/30"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clarifications */}
        {quote.checks.length > 0 && (
          <div className="mt-3.5 rounded-lg border border-warn/40 bg-warn/15 px-3 py-2.5 text-[11px] leading-relaxed text-[#e0c26b]">
            <b className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider">Things to check</b>
            <ul className="list-disc space-y-1 pl-4">
              {quote.checks.map(c => <li key={c}>{c}</li>)}
            </ul>
          </div>
        )}

        {/* Deposit toggle */}
        <button
          onClick={() => toggleDeposit(quote.id)}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line bg-panel p-3 text-left"
        >
          <span className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${quote.depositOn ? "bg-hazard" : "bg-line"}`}>
            <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-paper transition-transform ${quote.depositOn ? "translate-x-4" : "translate-x-0.5"}`} />
          </span>
          <span>
            <b className="block text-[12.5px]">{t.quote.deposit}</b>
            <span className="text-[10.5px] text-textDim">{t.quote.priceUpdated}</span>
          </span>
        </button>

        {/* Quote validity */}
        <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
          <span className="flex-1">
            <b className="block text-[12.5px]">{t.quote.validFor}</b>
            <span className="text-[10.5px] text-textDim">{t.quote.days}</span>
          </span>
          <select
            value={quote.validDays}
            onChange={e => setValidDays(quote.id, parseInt(e.target.value))}
            className="rounded-lg border border-line bg-panelRaised px-2 py-1.5 text-xs text-paper focus:border-hazard focus:outline-none"
          >
            <option value={14}>14 {t.quote.days}</option>
            <option value={30}>30 {t.quote.days}</option>
            <option value={60}>60 {t.quote.days}</option>
            <option value={90}>90 {t.quote.days}</option>
          </select>
        </div>

        {/* Photo attachments */}
        <div className="mt-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-textDim">Site photos (optional)</div>
          <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                {p.uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /></div>}
                {!p.uploading && (
                  <button onClick={() => removePhoto(i)} className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                    <svg width="8" height="8" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} fill="none"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => photoInputRef.current?.click()} className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-textDimmer transition-colors hover:border-hazard hover:text-hazard">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span className="text-[9px]">Add</span>
            </button>
          </div>
          {photos.length > 0 && <div className="mt-1.5 text-[10px] text-textDimmer">{photos.filter(p => !p.uploading).length} photo{photos.length !== 1 ? "s" : ""} attached</div>}
        </div>

        <PrimaryButton className="mt-4 w-full" onClick={() => router.push(`/quote/send?id=${quote.id}`)}
          icon={<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#161006" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/></svg>}>
          {t.quote.generate}
        </PrimaryButton>
      </div>

      <div className={`pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-ok px-3 py-1.5 font-mono text-[10px] font-semibold text-[#0d1a10] shadow-lg transition-all ${savedChip ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}>
        ✓ Price updated
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-wider text-textDim">{children}</div>;
}

function EditableField({ value, onChange, placeholder, textarea }: { value: string; onChange: (v: string) => void; placeholder: string; textarea?: boolean }) {
  const cls = "w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-paper placeholder:text-textDimmer focus:border-hazard focus:outline-none";
  return textarea
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} className={`${cls} resize-none`} />
    : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />;
}

function LineRow({ item, onSavePrice, onSaveDesc, onDelete }: { item: { id: string; desc: string; meta: string; price: number }; onSavePrice: (id: string, value: number) => void; onSaveDesc: (id: string, desc: string) => void; onDelete: (id: string) => void }) {
  const [priceVal, setPriceVal] = useState(String(item.price));
  const [descVal, setDescVal] = useState(item.desc);
  const [priceFocused, setPriceFocused] = useState(false);

  useEffect(() => { if (!priceFocused) setPriceVal(String(item.price)); }, [item.price, priceFocused]);
  useEffect(() => { setDescVal(item.desc); }, [item.desc]);

  function commitPrice() {
    const n = Math.max(0, parseInt(priceVal.replace(/[^0-9]/g, ""), 10) || 0);
    setPriceVal(String(n)); setPriceFocused(false); onSavePrice(item.id, n);
  }

  return (
    <div className="mb-1.5 rounded-xl border border-line bg-panel px-3 py-2.5">
      <div className="flex items-start gap-2">
        <input value={descVal} onChange={e => setDescVal(e.target.value)} onBlur={() => onSaveDesc(item.id, descVal)} className="flex-1 bg-transparent text-[12.5px] font-medium text-paper outline-none placeholder:text-textDimmer" placeholder="Item description" />
        <button onClick={() => onDelete(item.id)} className="mt-0.5 flex-none text-textDimmer transition-colors hover:text-red-400">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
      {item.meta && <div className="mt-0.5 font-mono text-[10px] text-textDim">{item.meta}</div>}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-textDimmer">£</span>
        <div className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 transition-colors ${priceFocused ? "border-hazard bg-hazard/5" : "border-line bg-panelRaised"}`}>
          <span className="font-mono text-[11px] text-textDim">£</span>
          <input
            inputMode="numeric" pattern="[0-9]*"
            value={priceFocused ? priceVal : Number(priceVal || 0).toLocaleString("en-GB")}
            onFocus={e => { setPriceFocused(true); setPriceVal(String(item.price)); setTimeout(() => e.target.select(), 0); }}
            onChange={e => setPriceVal(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commitPrice}
            onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="w-16 bg-transparent text-right font-mono text-[13px] font-semibold text-paper outline-none"
          />
        </div>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-xs text-textDim">Loading…</div>}>
      <ReviewPageContent />
    </Suspense>
  );
}
