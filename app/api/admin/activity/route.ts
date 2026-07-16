import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createServiceClient();

  // Recent quotes across all businesses (last 100)
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, job_title, status, created_at, sent_at, accepted_at, business_id")
    .order("created_at", { ascending: false })
    .limit(100);

  // Business names map
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name");
  const bizMap: Record<string, string> = {};
  for (const b of businesses ?? []) bizMap[b.id] = b.name ?? "Unknown";

  // Build activity events (one per status transition, newest first)
  const events: any[] = [];
  for (const q of quotes ?? []) {
    const biz = bizMap[q.business_id] ?? "Unknown";
    if (q.accepted_at) {
      events.push({ type: "accepted", label: `${biz} — quote accepted`, sub: q.job_title ?? "Untitled", at: q.accepted_at, quoteId: q.id });
    }
    if (q.sent_at) {
      events.push({ type: "sent", label: `${biz} — quote sent`, sub: q.job_title ?? "Untitled", at: q.sent_at, quoteId: q.id });
    }
    events.push({ type: "created", label: `${biz} — quote created`, sub: q.job_title ?? "Untitled", at: q.created_at, quoteId: q.id });
  }

  // Sort by time desc, take top 60
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Weekly signups (last 10 weeks)
  const { data: allBiz } = await supabase
    .from("businesses")
    .select("created_at")
    .order("created_at", { ascending: true });

  const weeks: { label: string; signups: number; quotes: number }[] = [];
  const now = new Date();
  for (let i = 9; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(now.getDate() - i * 7 - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const label = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const signups = (allBiz ?? []).filter((b: any) => {
      const d = new Date(b.created_at);
      return d >= start && d < end;
    }).length;
    const weekQuotes = (quotes ?? []).filter((q: any) => {
      const d = new Date(q.created_at);
      return d >= start && d < end;
    }).length;
    weeks.push({ label, signups, quotes: weekQuotes });
  }

  return NextResponse.json({ events: events.slice(0, 60), weeks });
}
