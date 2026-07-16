// ── Demand Pilot subscription tiers ────────────────────────────────────────
//
// Set these env vars in .env.local after creating products in Stripe:
//   STRIPE_PRICE_TRADE=price_xxx
//   STRIPE_PRICE_PRO=price_xxx
//   STRIPE_PRICE_BUSINESS=price_xxx

export type Tier = "free" | "trade" | "pro" | "business";

export type TierConfig = {
  name: string;
  monthlyLimit: number | null; // null = unlimited
  priceMonthly: number | null; // null = free
  stripePriceEnvKey: string | null;
  features: string[];
  highlight?: boolean;
};

export const TIERS: Record<Tier, TierConfig> = {
  free: {
    name: "Free",
    monthlyLimit: 3,
    priceMonthly: null,
    stripePriceEnvKey: null,
    features: [
      "3 sent quotes per month",
      "Voice-to-quote AI",
      "Customer portal + e-signature",
      "PDF & WhatsApp share",
    ],
  },
  trade: {
    name: "Trade",
    monthlyLimit: 50,
    priceMonthly: 7.99,
    stripePriceEnvKey: "STRIPE_PRICE_TRADE",
    features: [
      "50 sent quotes per month",
      "Everything in Free",
      "Invoice generation",
      "Job costing & variation orders",
      "Follow-up reminders",
      "Price book",
    ],
  },
  pro: {
    name: "Pro",
    monthlyLimit: null,
    priceMonthly: 14.99,
    stripePriceEnvKey: "STRIPE_PRICE_PRO",
    highlight: true,
    features: [
      "Unlimited quotes",
      "Everything in Trade",
      "HMRC tax estimator",
      "Inbound quote requests page",
      "Quote analytics",
      "Priority support",
    ],
  },
  business: {
    name: "Business",
    monthlyLimit: null,
    priceMonthly: 24.99,
    stripePriceEnvKey: "STRIPE_PRICE_BUSINESS",
    features: [
      "Unlimited quotes",
      "Everything in Pro",
      "Team members (coming soon)",
      "White-label customer portal (coming soon)",
      "API access (coming soon)",
      "Dedicated account manager",
    ],
  },
};

export const TIER_ORDER: Tier[] = ["free", "trade", "pro", "business"];

/** How many quotes this tier allows per month (null = unlimited) */
export function tierLimit(tier: Tier): number | null {
  return TIERS[tier].monthlyLimit;
}

/** Whether the user can send another quote given their tier + current month count */
export function canSend(tier: Tier, sentThisMonth: number): boolean {
  const limit = tierLimit(tier);
  if (limit === null) return true;
  return sentThisMonth < limit;
}

/** Remaining sends for this month (null = unlimited) */
export function remaining(tier: Tier, sentThisMonth: number): number | null {
  const limit = tierLimit(tier);
  if (limit === null) return null;
  return Math.max(0, limit - sentThisMonth);
}

/** The Stripe price ID for a paid tier (read from env at call time) */
export function stripePriceId(tier: Tier): string | null {
  const key = TIERS[tier].stripePriceEnvKey;
  if (!key) return null;
  return process.env[key] ?? null;
}

/** Parse tier string from Supabase safely */
export function parseTier(raw: string | null | undefined): Tier {
  if (raw === "trade" || raw === "pro" || raw === "business") return raw;
  return "free";
}
