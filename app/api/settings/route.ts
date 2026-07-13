import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** PUT /api/settings — save business settings for the authenticated user */
export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const { error, count } = await supabase
    .from("businesses")
    .update({
      name:                body.name,
      trade:               body.trade,
      phone:               body.phone,
      bank_name:           body.bank_name,
      bank_sort_code:      body.bank_sort_code,
      bank_account:        body.bank_account,
      payment_link:        body.payment_link,
      google_review_link:  body.google_review_link,
      default_valid_days:  body.default_valid_days,
      deposit_by_default:  body.deposit_by_default,
      deposit_percent:     body.deposit_percent,
      vat_registered:      body.vat_registered,
      vat_number:          body.vat_number,
      quote_prefix:        body.quote_prefix,
      quote_next_num:      body.quote_next_num,
      payment_terms:       body.payment_terms,
      exclusions:          body.exclusions,
    }, { count: "exact" })
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (count === 0) return NextResponse.json({ error: "No business row found for this account" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
