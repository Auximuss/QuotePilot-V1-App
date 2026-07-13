"use client";

import { useState, useRef, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useQuote } from "@/lib/QuoteContext";
import { useTranslation } from "@/lib/LanguageContext";
import { quoteTotal } from "@/lib/types";
import ScreenHeader from "@/components/ScreenHeader";
import PrimaryButton from "@/components/PrimaryButton";

function sb() {
  return createClient();
}

type PhotoItem = { url: string; uploading?: boolean; id?: string };

function ReviewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const id = searchParams.get("id") ?? "";
  const { getQuote, updateLineItemPrice, updateCustomerField, toggleDeposit, setValidDays, addLineItem, removeLineItem, updateLineItemDesc } =
    useQuote();
  const [savedChip, setSavedChip] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const quote = getQuote(id);

  if (!quote) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <div className="font-barlow text-lg font-semibold">Quote not found</div>
        <p className="mt-2 text-xs text-textDim">
          Head back and record a new one — this demo keeps quotes in memory, so a refresh clears
          them until Supabase is wired in.
        </p>
        <button
          onClick={() => router.push("/home")}
          className="mt-4 text-xs font-semibold text-hazard"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const total = quoteTotal(quote);
  const materials = quote.lineItems.filter((l) => l.category === "material");
  const labour = quote.lineItems.filter((l) => l.category === "labour");

  const confidenceColor =
    quote.confidence >= 85
      ? "text-ok"
      : quote.confidence >= 60
      ? "text-warn"
      : "text-hazard";

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const placeholders = files.map((f) => ({ url: URL.createObjectURL(f), uploading: true }));
    setPhotos((prev) => [...prev, ...placeholders]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `${quote!.id}/${Date.now()}-${file.name}`;
      const { error } = await sb().storage.from("quote-photos").upload(path, file, { contentType: file.type });
      if (!error) {
        const { data: { publicUrl } } = sb().storage.from("quote-photos").getPublicUrl(path);
        setPhotos((prev) => {
          const next = [...prev];
          const idx = next.findIndex((p) => p.uploading && p.url === placeholders[i].url);
          if (idx !== -1) next[idx] = { url: publicUrl, uploading: false, id: path };
          return next;
        });
      }
    }
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function handlePriceSave(itemId: string, value: number) {
    updateLineItemPrice(quote!.id, itemId, value);
    setSavedChip(true);
    setTimeout(() => setSavedChip(false), 1600);
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <ScreenHeader title={t.quote.reviewTitle} back="/quote/new" />

      <div className="flex-1 overflow-y-auto px-4.5 pb-6">
        <div className="my-2.5 flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-hazardDim px-2 py-1 font-mono text-[9.5px] uppercase tracking-wider text-hazard">
            ✦ Generated from voice note
          </div>
          <div className={`font-mono text-[11px] font-semibold ${confidenceColor}`}>
            Confidence {quote.confidence}%
          </div>
        </div>

        <div className="font-barlow text-xl font-bold">{quote.job}</div>

        <SectionLabel>{t.quote.customer}</SectionLabel>
        <div className="flex flex-col gap-2">
          <EditableField
            placeholder="Customer name"
            value={quote.customer}
            onChange={(v) => updateCustomerField(quote.id, "customer", v)}
          />
          <EditableField
            placeholder="Job address"
            value={quote.address}
            onChange={(v) => updateCustomerField(quote.id, "address", v)}
          />
          <EditableField
            placeholder="Customer email (for payment requests)"
            value={quote.customerEmail ?? ""}
            onChange={(v) => updateCustomerField(quote.id, "customerEmail", v)}
          />
          <EditableField
            placeholder="Notes for this job (optional)"
            value={quote.notes}
            onChange={(v) => updateCustomerField(quote.id, "notes", v)}
            textarea
          />
        </div>

        <SectionLabel>{t.quote.materials}</SectionLabel>
        {materials.map((item) => (
          <LineRow
            key={item.id}
            item={item}
            onSavePrice={handlePriceSave}
            onSaveDesc={(id, d) => updateLineItemDesc(quote.id, id, d)}
            onDelete={(id) => removeLineItem(quote.id, id)}
          />
        ))}
        <button
          onClick={() => addLineItem(quote.id, "material")}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-2 text-[11px] text-textDimmer transition-colors hover:border-hazard hover:text-hazard"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          {t.quote.addItem}
        </button>

        <SectionLabel>{t.quote.labour}</SectionLabel>
        {labour.map((item) => (
          <LineRow
            key={item.id}
            item={item}
            onSavePrice={handlePriceSave}
            onSaveDesc={(id, d) => updateLineItemDesc(quote.id, id, d)}
            onDelete={(id) => removeLineItem(quote.id, id)}
          />
        ))}
        <button
          onClick={() => addLineItem(quote.id, "labour")}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-2 text-[11px] text-textDimmer transition-colors hover:border-hazard hover:text-hazard"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          {t.quote.addItem}
        </button>

        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3.5">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-textDim">
            {t.quote.total}
          </span>
          <span className="font-barlow text-2xl font-bold text-hazard">
            £{total.toLocaleString("en-GB")}
          </span>
        </div>

        {quote.checks.length > 0 && (
          <div className="mt-3.5 rounded-lg border border-warn/40 bg-warn/15 px-3 py-2.5 text-[11px] leading-relaxed text-[#e0c26b]">
            <b className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider">
              Things to check
            </b>
            <ul className="list-disc space-y-1 pl-4">
              {quote.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Deposit toggle */}
        <button
          onClick={() => toggleDeposit(quote.id)}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line bg-panel p-3 text-left"
        >
          <span
            className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${
              quote.depositOn ? "bg-hazard" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-paper transition-transform ${
                quote.depositOn ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
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
            <span className="text-[10.5px] text-textDim">
              {t.quote.days}
            </span>
          </span>
          <select
            value={quote.validDays}
            onChange={(e) => setValidDays(quote.id, parseInt(e.target.value))}
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
                {p.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  </div>
                )}
                {!p.uploading && (
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} fill="none"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-textDimmer transition-colors hover:border-hazard hover:text-hazard"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span className="text-[9px]">Add</span>
            </button>
          </div>
          {photos.length > 0 && (
            <div className="mt-1.5 text-[10px] text-textDimmer">{photos.filter(p => !p.uploading).length} photo{photos.length !== 1 ? "s" : ""} attached to this quote</div>
          )}
        </div>

        <PrimaryButton
          className="mt-4 w-full"
          onClick={() => router.push(`/quote/send?id=${quote.id}`)}
          icon={
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="#161006"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
        >
          {t.quote.generate}
        </PrimaryButton>
      </div>

      <div
        className={`pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-ok px-3 py-1.5 font-mono text-[10px] font-semibold text-[#0d1a10] shadow-lg transition-all ${
          savedChip ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        ✓ Price updated
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-wider text-textDim">
      {children}
    </div>
  );
}

function EditableField({
  value,
  onChange,
  placeholder,
  textarea,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  textarea?: boolean;
}) {
  const cls =
    "w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-paper placeholder:text-textDimmer focus:border-hazard focus:outline-none";
  return textarea ? (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className={`${cls} resize-none`}
    />
  ) : (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cls}
    />
  );
}

function LineRow({
  item,
  onSavePrice,
  onSaveDesc,
  onDelete,
}: {
  item: { id: string; desc: string; meta: string; price: number };
  onSavePrice: (id: string, value: number) => void;
  onSaveDesc: (id: string, desc: string) => void;
  onDelete: (id: string) => void;
}) {
  const [priceVal, setPriceVal] = useState(String(item.price));
  const [descVal, setDescVal] = useState(item.desc);
  const [priceFocused, setPriceFocused] = useState(false);

  useEffect(() => {
    if (!priceFocused) setPriceVal(String(item.price));
  }, [item.price, priceFocused]);

  useEffect(() => {
    setDescVal(item.desc);
  }, [item.desc]);

  function commitPrice() {
    const n = Math.max(0, parseInt(priceVal.replace(/[^0-9]/g, ""), 10) || 0);
    setPriceVal(String(n));
    setPriceFocused(false);
    onSavePrice(item.id, n);
  }

  return (
    <div className="mb-1.5 rounded-xl border border-line bg-panel px-3 py-2.5">
      <div className="flex items-start gap-2">
        {/* Description */}
        <input
          value={descVal}
          onChange={(e) => setDescVal(e.target.value)}
          onBlur={() => onSaveDesc(item.id, descVal)}
          className="flex-1 bg-transparent text-[12.5px] font-medium text-paper outline-none placeholder:text-textDimmer"
          placeholder="Item description"
        />
        {/* Delete */}
        <button
          onClick={() => onDelete(item.id)}
          className="mt-0.5 flex-none text-textDimmer transition-colors hover:text-red-400"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
      {item.meta && <div className="mt-0.5 font-mono text-[10px] text-textDim">{item.meta}</div>}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-textDimmer">{item.id.startsWith("new") ? "price" : "£"}</span>
        <div className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 transition-colors ${priceFocused ? "border-hazard bg-hazard/5" : "border-line bg-panelRaised"}`}>
          <span className="font-mono text-[11px] text-textDim">£</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={priceFocused ? priceVal : Number(priceVal || 0).toLocaleString("en-GB")}
            onFocus={(e) => { setPriceFocused(true); setPriceVal(String(item.price)); setTimeout(() => e.target.select(), 0); }}
            onChange={(e) => setPriceVal(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commitPrice}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="w-16 bg-transparent text-right font-mono text-[13px] font-semibold text-paper outline-none"
          />
        </div>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-xs text-textDim">
          Loading…
        </div>
      }
    >
      <ReviewPageContent />
    </Suspense>
  );
}
