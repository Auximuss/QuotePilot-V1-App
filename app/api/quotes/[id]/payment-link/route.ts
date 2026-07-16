import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

function stripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, businesses(name, vat_registered)")
    .eq("id", params.id)
    .single();

  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const total = quote.total ?? 0;
  const vat = quote.businesses?.vat_registered ? Math.round(total * 0.2) : 0;
  const amountPence = Math.round((total + vat) * 100);

  if (amountPence < 50) return NextResponse.json({ error: "Amount too small" }, { status: 400 });

  // Create a Stripe payment link
  const paymentLink = await stripe().paymentLinks.create({
    line_items: [{
      price_data: {
        currency: "gbp",
        product_data: {
          name: `Invoice: ${quote.job_title ?? "Job"}`,
          description: quote.address ? `Address: ${quote.address}` : undefined,
        },
        unit_amount: amountPence,
      },
      quantity: 1,
    }],
    after_completion: {
      type: "redirect",
      redirect: { url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://demand-pilot.vercel.app"}/payment-success` },
    },
    metadata: { quote_id: params.id },
  });

  // Save to quote
  await supabase.from("quotes").update({ stripe_payment_link: paymentLink.url }).eq("id", params.id);

  return NextResponse.json({ url: paymentLink.url });
}
