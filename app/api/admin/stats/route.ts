import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();

  // All businesses (one per user)
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, trade, owner_id, subscription_tier, subscription_status, created_at")
    .order("created_at", { ascending: false });

  const all = businesses ?? [];

  // Get auth users for emails
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const userMap: Record<string, string> = {};
  for (const u of authData?.users ?? []) {
    userMap[u.id] = u.email ?? "";
  }

  const users = all.map((b: any) => ({
    businessId: b.id,
    ownerId: b.owner_id,
    businessName: b.name ?? "—",
    trade: b.trade ?? "—",
    email: userMap[b.owner_id] ?? "—",
    plan: b.subscription_tier ?? "free",
    status: b.subscription_status ?? "—",
    joinedAt: b.created_at,
  }));

  // Subscription counts + revenue estimate
  const tierPrices: Record<string, number> = { trade: 7.99, pro: 14.99, business: 24.99 };
  let activeSubscriptions = 0;
  let monthlyRevenue = 0;
  for (const u of users) {
    const price = tierPrices[u.plan];
    if (price && u.status === "active") {
      activeSubscriptions++;
      monthlyRevenue += price;
    }
  }

  // Quotes sent this month
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const { count: quotesThisMonth } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", monthStart.toISOString());

  return NextResponse.json({
    totalUsers: users.length,
    activeSubscriptions,
    monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
    quotesThisMonth: quotesThisMonth ?? 0,
    users,
  });
}
