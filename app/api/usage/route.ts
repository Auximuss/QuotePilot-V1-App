import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseTier } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";

/**
 * GET /api/usage
 * Returns { tier, sentThisMonth, limit } for the authenticated user.
 */
export async function GET() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admin account gets unlimited everything
  if (isAdmin(user.email)) {
    return NextResponse.json({ tier: "admin", sentThisMonth: 0, limit: null, subscriptionStatus: "active" });
  }

  const supabase = createServiceClient();

  // Get subscription tier
  const { data: biz } = await supabase
    .from("businesses")
    .select("id, subscription_tier, subscription_status")
    .eq("owner_id", user.id)
    .single();

  if (!biz) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const tier = parseTier((biz as any).subscription_tier);
  const status = (biz as any).subscription_status ?? null;

  // Count quotes sent this calendar month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("business_id", biz.id)
    .in("status", ["sent", "accepted", "declined"])
    .gte("sent_at", monthStart.toISOString());

  const sentThisMonth = count ?? 0;

  const limits: Record<string, number | null> = {
    free: 3,
    trade: 50,
    pro: null,
    business: null,
  };

  return NextResponse.json({
    tier,
    subscriptionStatus: status,
    sentThisMonth,
    limit: limits[tier] ?? 3,
  });
}
