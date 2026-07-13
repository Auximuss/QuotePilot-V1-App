import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { parseTier, type Tier } from "@/lib/subscription";

function stripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
}

// Stripe needs the raw body to verify the signature — disable Next.js body parsing
export const config = { api: { bodyParser: false } };

async function getRawBody(req: NextRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = req.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Map Stripe price IDs → tier names
function tierFromPriceId(priceId: string): Tier {
  if (priceId === process.env.STRIPE_PRICE_TRADE)    return "trade";
  if (priceId === process.env.STRIPE_PRICE_PRO)      return "pro";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "business";
  return "free";
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  const rawBody = await getRawBody(req);
  let event: Stripe.Event;

  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  async function updateBusiness(businessId: string, updates: Record<string, unknown>) {
    const { error } = await supabase.from("businesses").update(updates).eq("id", businessId);
    if (error) console.error("Failed to update business:", error);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const sub = await stripe().subscriptions.retrieve(session.subscription as string);
      const priceId = sub.items.data[0]?.price.id ?? "";
      const tier = tierFromPriceId(priceId);
      const businessId = sub.metadata?.business_id ?? session.metadata?.business_id;
      if (!businessId) break;

      await updateBusiness(businessId, {
        subscription_tier: tier,
        subscription_status: sub.status,
        stripe_subscription_id: sub.id,
        stripe_customer_id: session.customer as string,
      });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id ?? "";
      const tier = tierFromPriceId(priceId);
      const businessId = sub.metadata?.business_id;
      if (!businessId) break;

      await updateBusiness(businessId, {
        subscription_tier: sub.status === "active" || sub.status === "trialing" ? tier : "free",
        subscription_status: sub.status,
        stripe_subscription_id: sub.id,
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const businessId = sub.metadata?.business_id;
      if (!businessId) break;

      await updateBusiness(businessId, {
        subscription_tier: "free",
        subscription_status: "cancelled",
        stripe_subscription_id: null,
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as any).subscription as string | null;
      if (!subId) break;
      const sub = await stripe().subscriptions.retrieve(subId);
      const businessId = sub.metadata?.business_id;
      if (!businessId) break;

      await updateBusiness(businessId, { subscription_status: "past_due" });

      // Email the owner about the payment failure
      try {
        const { data: biz } = await supabase.from("businesses").select("owner_id, name").eq("id", businessId).single();
        if (biz?.owner_id) {
          const { data: authUser } = await supabase.auth.admin.getUserById(biz.owner_id);
          const ownerEmail = authUser?.user?.email;
          const apiKey = process.env.RESEND_API_KEY;
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://demandpilot.app";
          if (ownerEmail && apiKey) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: process.env.RESEND_FROM_EMAIL || "hello@demandpilot.app",
                to: [ownerEmail],
                subject: "Action needed — your Demand Pilot payment failed",
                html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
                  <h2 style="margin:0 0 8px">Payment failed</h2>
                  <p style="color:#666;font-size:14px">We couldn't charge your card for your Demand Pilot subscription. Please update your payment details to keep sending quotes.</p>
                  <a href="${siteUrl}/settings" style="display:block;background:#ff6a1f;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin:24px 0">Update payment details →</a>
                  <p style="color:#999;font-size:12px;text-align:center">Reply to this email if you need help.</p>
                </div>`,
              }),
            });
          }
        }
      } catch (e) { console.error("[webhook] payment_failed email error:", e); }
      break;
    }

    case "customer.subscription.trial_will_end": {
      // Fires 3 days before trial ends
      const sub = event.data.object as Stripe.Subscription;
      const businessId = sub.metadata?.business_id;
      if (!businessId) break;

      try {
        const { data: biz } = await supabase.from("businesses").select("owner_id, name").eq("id", businessId).single();
        if (!biz?.owner_id) break;

        const { data: authUser } = await supabase.auth.admin.getUserById(biz.owner_id);
        const ownerEmail = authUser?.user?.email;
        const apiKey = process.env.RESEND_API_KEY;
        if (!ownerEmail || !apiKey) break;

        const trialEnd = new Date((sub as any).trial_end * 1000);
        const daysLeft = Math.max(1, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://demandpilot.app";

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "hello@demandpilot.app",
            to: [ownerEmail],
            subject: `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
            html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="margin:0 0 8px;font-size:22px">Your trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}</h2>
              <p style="color:#666;margin:0 0 16px;font-size:14px">
                Your Demand Pilot free trial ends on <strong>${trialEnd.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</strong>.
                If you have a card on file, you'll be charged automatically — no action needed.
              </p>
              <p style="color:#666;margin:0 0 24px;font-size:14px">
                Want to cancel or change your plan before then? You can do it in one click from settings.
              </p>
              <a href="${siteUrl}/settings" style="display:block;background:#ff6a1f;color:#fff;text-align:center;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:16px">
                Manage subscription →
              </a>
              <p style="color:#999;font-size:12px;text-align:center">Questions? Reply to this email — we're happy to help.</p>
            </div>`,
          }),
        });
      } catch (e) { console.error("[webhook] trial_will_end email error:", e); }
      break;
    }

    default:
      // Unhandled event — ignore
      break;
  }

  return NextResponse.json({ received: true });
}
