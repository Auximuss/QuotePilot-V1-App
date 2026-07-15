import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { stripePriceId, type Tier } from "@/lib/subscription";

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set in environment variables.");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
}

export async function POST(req: NextRequest) {
  try {
    // Cookie-based client to read the session
    const { data: { user } } = await createClient().auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Service client for DB writes
    const supabase = createServiceClient();

    const { tier, successUrl, cancelUrl } = await req.json() as {
      tier: Tier;
      successUrl: string;
      cancelUrl: string;
    };

    const priceId = stripePriceId(tier);
    if (!priceId) {
      return NextResponse.json({ error: `No Stripe price configured for tier: ${tier}` }, { status: 400 });
    }

    // Get or create Stripe customer
    const { data: biz } = await supabase
      .from("businesses")
      .select("id, stripe_customer_id, name")
      .eq("owner_id", user.id)
      .single();

    if (!biz) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    let customerId: string = (biz as any).stripe_customer_id;

    if (!customerId) {
      const customer = await stripe().customers.create({
        email: user.email,
        name: (biz as any).name ?? undefined,
        metadata: { supabase_user_id: user.id, business_id: biz.id },
      });
      customerId = customer.id;
      await supabase.from("businesses").update({ stripe_customer_id: customerId }).eq("id", biz.id);
    }

    const session = await stripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: 7,
        metadata: { supabase_user_id: user.id, business_id: biz.id, tier },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: err.message ?? "Checkout failed" }, { status: 500 });
  }
}
