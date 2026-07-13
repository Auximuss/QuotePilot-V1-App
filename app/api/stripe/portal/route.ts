import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, createServiceClient } from "@/lib/supabase/server";

function stripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
}

export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  const { returnUrl } = await req.json();

  const { data: biz } = await supabase
    .from("businesses")
    .select("stripe_customer_id")
    .eq("owner_id", user.id)
    .single();

  const customerId = (biz as any)?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 });
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl ?? `${process.env.NEXT_PUBLIC_SITE_URL}/settings`,
  });

  return NextResponse.json({ url: session.url });
}
