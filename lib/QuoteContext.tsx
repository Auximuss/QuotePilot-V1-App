"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

import { createClient } from "./supabase/client";
import { LineItem, PriceBookItem, Quote, QuoteStatus, quoteTotal, depositAmountFor } from "./types";

/* ----------------------------- AI RESULT TYPE ----------------------------- */

export type AiQuoteResult = {
  job_title: string;
  customer_summary: string;
  scope_of_work: string[];
  line_items: {
    category: "material" | "labour";
    description: string;
    quantity: number;
    unit: string;
    estimated_unit_price: number | null;
  }[];
  suggested_exclusions: string[];
  clarifications_needed: string[];
  confidence: number;
};

/* ----------------------------- CONTEXT TYPES ----------------------------- */

type Stats = {
  hasAnyQuotes: boolean;
  totalQuoted: number;
  averageQuote: number | null;
  acceptanceRate: number | null;
  revenueThisMonth: number;
  outstandingCount: number;
  depositsWaiting: number;
};

export type BusinessSettings = {
  defaultValidDays: number;
  depositByDefault: boolean;
  depositPercent: number;
  vatRegistered: boolean;
  vatNumber: string;
  quotePrefix: string;
  quoteNextNum: number;
  paymentTerms: string;
  exclusions: string;
  paymentLink: string;
};

type QuoteContextValue = {
  quotes: Quote[];
  isLoading: boolean;
  businessName: string;
  logoUrl: string;
  priceBookItems: PriceBookItem[];
  settings: BusinessSettings;
  updateSettings: (updates: Partial<BusinessSettings>, localOnly?: boolean) => Promise<void>;
  getQuote: (id: string) => Quote | undefined;
  createDraftFromAi: (result: AiQuoteResult) => string;
  updateLineItemPrice: (quoteId: string, itemId: string, price: number) => void;
  updateCustomerField: (
    quoteId: string,
    field: "customer" | "address" | "notes" | "customerEmail",
    value: string
  ) => void;
  toggleDeposit: (quoteId: string) => void;
  setValidDays: (quoteId: string, days: number) => void;
  markSent: (quoteId: string) => void;
  acceptQuote: (quoteId: string) => void;
  declineQuote: (quoteId: string) => void;
  unseenAcceptedQuotes: Quote[];
  dismissAcceptanceBanner: (quoteId: string) => void;
  stats: Stats;
  addLineItem: (quoteId: string, category: "material" | "labour") => void;
  removeLineItem: (quoteId: string, itemId: string) => void;
  updateLineItemDesc: (quoteId: string, itemId: string, desc: string) => void;
  duplicateQuote: (quoteId: string) => Promise<string>;
};

const QuoteContext = createContext<QuoteContextValue | null>(null);
const supabase = createClient();

/* ----------------------------- DB <-> APP MAPPING ----------------------------- */

type DbQuoteRow = {
  id: string;
  business_id: string;
  job_title: string | null;
  customer_name: string | null;
  customer_address: string | null;
  notes: string | null;
  status: QuoteStatus;
  ai_confidence: number | null;
  clarifications_needed: string[] | null;
  deposit_requested: boolean;
  valid_days: number | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  customer_email: string | null;
};

type DbLineItemRow = {
  id: string;
  quote_id: string;
  category: "material" | "labour";
  description: string;
  meta: string | null;
  unit_price: number;
};

type DbPriceBookRow = {
  id: string;
  description: string;
  category: "material" | "labour";
  unit: string | null;
  unit_price: number;
};

function rowsToQuote(row: DbQuoteRow, items: DbLineItemRow[]): Quote {
  return {
    id: row.id,
    job: row.job_title ?? "",
    customer: row.customer_name ?? "",
    address: row.customer_address ?? "",
    customerEmail: row.customer_email ?? "",
    notes: row.notes ?? "",
    lineItems: items.map((li) => ({
      id: li.id,
      category: li.category,
      desc: li.description,
      meta: li.meta ?? "",
      price: li.unit_price,
    })),
    depositOn: row.deposit_requested,
    status: row.status,
    confidence: row.ai_confidence ?? 0,
    checks: row.clarifications_needed ?? [],
    createdAt: row.created_at,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    seenByBuilder: true,
    validDays: row.valid_days ?? 30,
  };
}

/* ----------------------------- PROVIDER ----------------------------- */

const DEFAULT_SETTINGS: BusinessSettings = {
  defaultValidDays: 30,
  depositByDefault: false,
  depositPercent: 25,
  vatRegistered: false,
  vatNumber: "",
  quotePrefix: "",
  quoteNextNum: 1,
  paymentTerms: "Payment due within 14 days of completion. We accept BACS transfer and cash.",
  exclusions: "Price excludes skips, building control fees, and any works not specified above.",
  paymentLink: "",
};

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setBusinessId(null);
          setBusinessName("");
          setPriceBookItems([]);
          setQuotes([]);
          setIsLoading(false);
        }
        return;
      }

      const { data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, logo_url, default_valid_days, deposit_by_default, deposit_percent, vat_registered, vat_number, quote_prefix, quote_next_num, payment_terms, exclusions")
        .eq("owner_id", user.id)
        .single();

      if (businessError || !business) {
        console.error("No business row found for this user yet:", businessError);
        if (!cancelled) {
          setBusinessId(null);
          setQuotes([]);
          setIsLoading(false);
        }
        return;
      }

      if (cancelled) return;
      setBusinessId(business.id);
      setBusinessName(business.name ?? "");
      setLogoUrl((business as any).logo_url ?? "");

      const biz = business as any;
      setSettings({
        defaultValidDays: biz.default_valid_days ?? 30,
        depositByDefault: biz.deposit_by_default ?? false,
        depositPercent: biz.deposit_percent ?? 25,
        vatRegistered: biz.vat_registered ?? false,
        vatNumber: biz.vat_number ?? "",
        quotePrefix: biz.quote_prefix ?? "",
        quoteNextNum: biz.quote_next_num ?? 1,
        paymentTerms: biz.payment_terms ?? DEFAULT_SETTINGS.paymentTerms,
        exclusions: biz.exclusions ?? DEFAULT_SETTINGS.exclusions,
        paymentLink: biz.payment_link ?? "",
      });

      // Load quotes and price book in parallel
      const [quotesResult, priceBookResult] = await Promise.all([
        supabase
          .from("quotes")
          .select("*")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("price_book_items")
          .select("*")
          .eq("business_id", business.id),
      ]);

      if (quotesResult.error || !quotesResult.data) {
        console.error("Failed to load quotes:", quotesResult.error);
        if (!cancelled) setIsLoading(false);
        return;
      }

      const quoteIds = quotesResult.data.map((r) => r.id);
      const { data: lineItemRows, error: lineItemsError } = quoteIds.length
        ? await supabase.from("quote_line_items").select("*").in("quote_id", quoteIds)
        : { data: [], error: null };

      if (lineItemsError) console.error("Failed to load line items:", lineItemsError);

      const mapped = quotesResult.data.map((row: DbQuoteRow) =>
        rowsToQuote(
          row,
          (lineItemRows ?? []).filter((li: DbLineItemRow) => li.quote_id === row.id)
        )
      );

      if (!priceBookResult.error && priceBookResult.data) {
        const items: PriceBookItem[] = (priceBookResult.data as DbPriceBookRow[]).map((r) => ({
          id: r.id,
          description: r.description,
          category: r.category,
          unit: r.unit ?? "",
          unitPrice: r.unit_price,
        }));
        if (!cancelled) setPriceBookItems(items);
      }

      if (!cancelled) {
        setQuotes(mapped);
        setIsLoading(false);
      }
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // TOKEN_REFRESHED fires every hour — don't reload data for that
      if (event !== "TOKEN_REFRESHED") load();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Real-time subscription: when a customer accepts/declines a quote, update
  // local state immediately so the builder sees the notification without refresh.
  useEffect(() => {
    if (!businessId) return;

    const channel = supabase
      .channel(`quotes:${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quotes",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const updated = payload.new as DbQuoteRow;
          setQuotes((prev) =>
            prev.map((q) => {
              if (q.id !== updated.id) return q;
              const justAccepted = updated.status === "accepted" && q.status !== "accepted";
              return {
                ...q,
                status: updated.status,
                acceptedAt: updated.accepted_at,
                sentAt: updated.sent_at,
                // Show the acceptance banner for quotes that just flipped to accepted
                seenByBuilder: justAccepted ? false : q.seenByBuilder,
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId]);

  function getQuote(id: string) {
    return quotes.find((q) => q.id === id);
  }

  function createDraftFromAi(result: AiQuoteResult): string {
    const id = crypto.randomUUID();

    const lineItems: LineItem[] = result.line_items.map((li) => ({
      id: crypto.randomUUID(),
      category: li.category,
      desc: li.description,
      meta: li.quantity != null && li.unit ? `${li.quantity} ${li.unit}` : li.quantity != null ? `${li.quantity}` : "",
      price: li.estimated_unit_price ?? 0,
    }));

    // Read from context settings (Supabase-backed)
    const defaultValidDays = settings.defaultValidDays;
    const depositByDefault = settings.depositByDefault;
    const depositPercent   = settings.depositPercent;
    const prefix           = settings.quotePrefix;
    const nextNum          = settings.quoteNextNum;
    const quoteNumber      = prefix ? `${prefix}${String(nextNum).padStart(4, "0")}` : undefined;
    // Increment the quote number in Supabase
    if (prefix) updateSettings({ quoteNextNum: nextNum + 1 });

    const newQuote: Quote = {
      id,
      quoteNumber,
      job: result.job_title,
      customer: "",
      address: "",
      notes: "",
      lineItems,
      depositOn: depositByDefault,
      depositPercent,
      status: "draft",
      confidence: result.confidence,
      checks: result.clarifications_needed,
      createdAt: new Date().toISOString(),
      sentAt: null,
      acceptedAt: null,
      seenByBuilder: true,
      validDays: defaultValidDays,
    };

    // Optimistic local update — navigation never waits on the network.
    setQuotes((prev) => [newQuote, ...prev]);

    if (businessId) {
      (async () => {
        const { error: quoteError } = await supabase.from("quotes").insert({
          id,
          business_id: businessId,
          job_title: result.job_title,
          clarifications_needed: result.clarifications_needed,
          ai_confidence: result.confidence,
          status: "draft",
          deposit_requested: depositByDefault,
          valid_days: defaultValidDays,
        });

        if (quoteError) {
          console.error("Failed to save quote to Supabase:", quoteError);
          return;
        }

        const { error: itemsError } = await supabase.from("quote_line_items").insert(
          lineItems.map((li, idx) => ({
            id: li.id,
            quote_id: id,
            category: li.category,
            description: li.desc,
            meta: li.meta,
            unit_price: li.price,
            total_price: li.price,
            sort_order: idx,
          }))
        );

        if (itemsError) console.error("Failed to save line items to Supabase:", itemsError);
      })();
    } else {
      console.warn(
        "No business_id yet — quote created locally only and will not survive a refresh."
      );
    }

    return id;
  }

  function updateLineItemPrice(quoteId: string, itemId: string, price: number) {
    // Update local state AND compute the new total inside the same callback
    // so we always have the correct accumulated sum — never stale state.
    let newTotal = 0;
    let lineItemDesc = "";
    let lineItemCategory: "material" | "labour" = "labour";

    setQuotes((prev) => {
      return prev.map((q) => {
        if (q.id !== quoteId) return q;
        const updatedItems = q.lineItems.map((li) =>
          li.id === itemId ? { ...li, price } : li
        );
        newTotal = updatedItems.reduce((sum, li) => sum + li.price, 0);
        const target = q.lineItems.find((li) => li.id === itemId);
        if (target) {
          lineItemDesc = target.desc;
          lineItemCategory = target.category;
        }
        return { ...q, lineItems: updatedItems };
      });
    });

    // Update line item price in DB
    supabase
      .from("quote_line_items")
      .update({ unit_price: price, total_price: price })
      .eq("id", itemId)
      .then(({ error }) => {
        if (error) console.error("Failed to save price edit:", error);
      });

    // Update quote total in DB using the correctly accumulated newTotal
    supabase
      .from("quotes")
      .update({ subtotal: newTotal, total: newTotal })
      .eq("id", quoteId)
      .then(({ error }) => {
        if (error) console.error("Failed to save updated total:", error);
      });

    // Upsert into price book so future AI quotes use real numbers
    if (lineItemDesc && businessId) {
      supabase
        .from("price_book_items")
        .upsert(
          {
            business_id: businessId,
            description: lineItemDesc,
            category: lineItemCategory,
            unit_price: price,
          },
          { onConflict: "business_id,description" }
        )
        .then(({ error }) => {
          if (error) console.error("Failed to upsert price book:", error);
        });
    }
  }

  function updateCustomerField(
    quoteId: string,
    field: "customer" | "address" | "notes" | "customerEmail",
    value: string
  ) {
    setQuotes((prev) => prev.map((q) => (q.id === quoteId ? { ...q, [field]: value } : q)));

    const columnMap = {
      customer: "customer_name",
      address: "customer_address",
      notes: "notes",
      customerEmail: "customer_email",
    } as const;

    supabase
      .from("quotes")
      .update({ [columnMap[field]]: value })
      .eq("id", quoteId)
      .then(({ error }) => {
        if (error) console.error(`Failed to save ${field}:`, error);
      });
  }

  function toggleDeposit(quoteId: string) {
    const quote = getQuote(quoteId);
    const next = quote ? !quote.depositOn : true;

    setQuotes((prev) => prev.map((q) => (q.id === quoteId ? { ...q, depositOn: next } : q)));

    supabase
      .from("quotes")
      .update({ deposit_requested: next })
      .eq("id", quoteId)
      .then(({ error }) => {
        if (error) console.error("Failed to save deposit toggle:", error);
      });
  }

  function setValidDays(quoteId: string, days: number) {
    setQuotes((prev) => prev.map((q) => (q.id === quoteId ? { ...q, validDays: days } : q)));

    // Requires valid_days column on quotes table — see README for SQL.
    supabase
      .from("quotes")
      .update({ valid_days: days })
      .eq("id", quoteId)
      .then(({ error }) => {
        if (error) console.error("Failed to save valid days:", error);
      });
  }

  function markSent(quoteId: string) {
    const sentAt = new Date().toISOString();
    setQuotes((prev) => prev.map((q) => (q.id === quoteId ? { ...q, status: "sent", sentAt } : q)));

    supabase
      .from("quotes")
      .update({ status: "sent", sent_at: sentAt })
      .eq("id", quoteId)
      .then(({ error }) => {
        if (error) console.error("Failed to save send:", error);
      });
  }

  function acceptQuote(quoteId: string) {
    const acceptedAt = new Date().toISOString();
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === quoteId ? { ...q, status: "accepted", acceptedAt, seenByBuilder: false } : q
      )
    );

    supabase
      .from("quotes")
      .update({ status: "accepted", accepted_at: acceptedAt })
      .eq("id", quoteId)
      .then(({ error }) => {
        if (error) console.error("Failed to save acceptance:", error);
      });
  }

  function declineQuote(quoteId: string) {
    setQuotes((prev) => prev.map((q) => (q.id === quoteId ? { ...q, status: "declined" } : q)));

    supabase
      .from("quotes")
      .update({ status: "declined" })
      .eq("id", quoteId)
      .then(({ error }) => {
        if (error) console.error("Failed to save decline:", error);
      });
  }

  function dismissAcceptanceBanner(quoteId: string) {
    setQuotes((prev) => prev.map((q) => (q.id === quoteId ? { ...q, seenByBuilder: true } : q)));
    // Intentionally local-only — no DB persist needed.
  }

  async function updateSettings(updates: Partial<BusinessSettings>, localOnly = false) {
    setSettings((prev) => ({ ...prev, ...updates }));
    if (localOnly || !businessId) return;

    const colMap: Record<keyof BusinessSettings, string> = {
      defaultValidDays: "default_valid_days",
      depositByDefault: "deposit_by_default",
      depositPercent: "deposit_percent",
      vatRegistered: "vat_registered",
      vatNumber: "vat_number",
      quotePrefix: "quote_prefix",
      quoteNextNum: "quote_next_num",
      paymentTerms: "payment_terms",
      exclusions: "exclusions",
      paymentLink: "payment_link",
    };

    const dbUpdates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      dbUpdates[colMap[k as keyof BusinessSettings]] = v;
    }

    const { error } = await supabase.from("businesses").update(dbUpdates).eq("id", businessId);
    if (error) console.error("Failed to save settings:", error);
  }

  function addLineItem(quoteId: string, category: "material" | "labour") {
    const itemId = crypto.randomUUID();
    const newItem: LineItem = { id: itemId, category, desc: "New item", meta: "", price: 0 };
    setQuotes((prev) =>
      prev.map((q) => q.id !== quoteId ? q : { ...q, lineItems: [...q.lineItems, newItem] })
    );
    supabase.from("quote_line_items").insert({
      id: itemId, quote_id: quoteId, category,
      description: "New item", meta: "", unit_price: 0, total_price: 0,
      sort_order: 999,
    }).then(({ error }) => { if (error) console.error("addLineItem:", error); });
  }

  function removeLineItem(quoteId: string, itemId: string) {
    setQuotes((prev) =>
      prev.map((q) => q.id !== quoteId ? q : { ...q, lineItems: q.lineItems.filter((li) => li.id !== itemId) })
    );
    supabase.from("quote_line_items").delete().eq("id", itemId)
      .then(({ error }) => { if (error) console.error("removeLineItem:", error); });
  }

  function updateLineItemDesc(quoteId: string, itemId: string, desc: string) {
    setQuotes((prev) =>
      prev.map((q) => q.id !== quoteId ? q : { ...q, lineItems: q.lineItems.map((li) => li.id === itemId ? { ...li, desc } : li) })
    );
    supabase.from("quote_line_items").update({ description: desc }).eq("id", itemId)
      .then(({ error }) => { if (error) console.error("updateLineItemDesc:", error); });
  }

  async function duplicateQuote(quoteId: string): Promise<string> {
    const original = getQuote(quoteId);
    if (!original || !businessId) return "";
    const newId = crypto.randomUUID();
    const newItems: LineItem[] = original.lineItems.map((li) => ({ ...li, id: crypto.randomUUID() }));
    const newQuote: Quote = {
      ...original, id: newId, status: "draft", sentAt: null, acceptedAt: null,
      seenByBuilder: true, createdAt: new Date().toISOString(), lineItems: newItems,
      job: original.job + " (copy)",
    };
    setQuotes((prev) => [newQuote, ...prev]);
    await supabase.from("quotes").insert({
      id: newId, business_id: businessId, job_title: newQuote.job,
      customer_name: original.customer, customer_address: original.address,
      customer_email: original.customerEmail ?? null, notes: original.notes,
      clarifications_needed: original.checks, ai_confidence: original.confidence,
      status: "draft", deposit_requested: original.depositOn,
      valid_days: original.validDays,
    });
    await supabase.from("quote_line_items").insert(
      newItems.map((li, idx) => ({
        id: li.id, quote_id: newId, category: li.category,
        description: li.desc, meta: li.meta, unit_price: li.price,
        total_price: li.price, sort_order: idx,
      }))
    );
    return newId;
  }

  const unseenAcceptedQuotes = quotes.filter((q) => q.status === "accepted" && !q.seenByBuilder);

  const stats: Stats = useMemo(() => {
    const hasAnyQuotes = quotes.length > 0;
    const totalQuoted = quotes.reduce((sum, q) => sum + quoteTotal(q), 0);
    const responded = quotes.filter((q) => q.status === "accepted" || q.status === "declined");
    const accepted = quotes.filter((q) => q.status === "accepted");

    const now = new Date();
    const revenueThisMonth = accepted
      .filter((q) => q.acceptedAt && sameMonth(new Date(q.acceptedAt), now))
      .reduce((sum, q) => sum + quoteTotal(q), 0);

    const depositsWaiting = quotes
      .filter((q) => q.depositOn && q.status === "sent")
      .reduce((sum, q) => sum + depositAmountFor(q), 0);

    return {
      hasAnyQuotes,
      totalQuoted,
      averageQuote: hasAnyQuotes ? Math.round(totalQuoted / quotes.length) : null,
      acceptanceRate:
        responded.length > 0 ? Math.round((accepted.length / responded.length) * 100) : null,
      revenueThisMonth,
      outstandingCount: quotes.filter((q) => q.status === "sent").length,
      depositsWaiting,
    };
  }, [quotes]);

  const value: QuoteContextValue = {
    quotes,
    isLoading,
    businessName,
    logoUrl,
    priceBookItems,
    settings,
    updateSettings,
    getQuote,
    createDraftFromAi,
    updateLineItemPrice,
    updateCustomerField,
    toggleDeposit,
    setValidDays,
    markSent,
    acceptQuote,
    declineQuote,
    unseenAcceptedQuotes,
    dismissAcceptanceBanner,
    stats,
    addLineItem,
    removeLineItem,
    updateLineItemDesc,
    duplicateQuote,
  };

  return <QuoteContext.Provider value={value}>{children}</QuoteContext.Provider>;
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function useQuote() {
  const ctx = useContext(QuoteContext);
  if (!ctx) throw new Error("useQuote must be used inside QuoteProvider");
  return ctx;
}
