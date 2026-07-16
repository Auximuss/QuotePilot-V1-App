export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

export type LineItem = {
  id: string;
  category: "material" | "labour";
  desc: string;
  meta: string;
  price: number;
};

export type Quote = {
  id: string;
  quoteNumber?: string;        // e.g. "SP-0001" — set from user's prefix setting
  job: string;
  customer: string;
  address: string;
  customerEmail?: string;
  notes: string;
  lineItems: LineItem[];
  depositOn: boolean;
  depositPercent?: number;     // defaults to 25 if unset
  status: QuoteStatus;
  confidence: number;
  checks: string[];
  createdAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  seenByBuilder: boolean;
  validDays: number;
};

export type PriceBookItem = {
  id: string;
  description: string;
  category: "material" | "labour";
  unit: string;
  unitPrice: number;
};

export function quoteTotal(q: Pick<Quote, "lineItems">): number {
  return q.lineItems.reduce((sum, item) => sum + item.price, 0);
}

export function depositAmountFor(
  q: Pick<Quote, "lineItems" | "depositOn" | "depositPercent">,
  overridePercent?: number
): number {
  if (!q.depositOn) return 0;
  const pct = overridePercent ?? q.depositPercent ?? 25;
  return Math.round(quoteTotal(q) * (pct / 100));
}

export function quoteExpiryDate(q: Pick<Quote, "createdAt" | "validDays">): Date {
  const d = new Date(q.createdAt);
  d.setDate(d.getDate() + (q.validDays ?? 30));
  return d;
}
