"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────
type UserRow = { businessId: string; ownerId: string; businessName: string; trade: string; email: string; plan: string; status: string; joinedAt: string };
type Message = { id: string; business_id: string; user_email: string; business_name: string; message: string; from_admin: boolean; is_ai_reply?: boolean; read_by_admin: boolean; created_at: string };
type Conversation = { businessId: string; businessName: string; userEmail: string; lastMessage: string; lastAt: string; unread: number; messages: Message[] };
type Stats = { totalUsers: number; activeSubscriptions: number; monthlyRevenue: number; quotesThisMonth: number; users: UserRow[] };
type ActivityEvent = { type: string; label: string; sub: string; at: string; quoteId: string };
type WeekRow = { label: string; signups: number; quotes: number };
type AgentLog = { id: string; agent: string; message: string; type: string; created_at: string };
type Lead = { id: string; business_name: string; trade: string; email: string; location: string; phone: string; status: string; email_body?: string; email_subject?: string; email_sent_at?: string; created_at: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
const PLAN_COLOURS: Record<string, string> = {
  free: "bg-line text-textDim",
  trade: "bg-blue-500/15 text-blue-400",
  pro: "bg-hazard/15 text-hazard",
  business: "bg-purple-500/15 text-purple-400",
  admin: "bg-ok/15 text-ok",
};
const EVENT_COLOURS: Record<string, string> = {
  accepted: "bg-ok/20 text-ok",
  sent: "bg-blue-500/20 text-blue-400",
  created: "bg-line text-textDim",
};
const EVENT_ICONS: Record<string, string> = { accepted: "✓", sent: "→", created: "+" };

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Mini bar chart ─────────────────────────────────────────────────────────────
function BarChart({ data, dataKey, colour }: { data: WeekRow[]; dataKey: "signups" | "quotes"; colour: string }) {
  const max = Math.max(...data.map((d) => d[dataKey]), 1);
  return (
    <div className="flex h-24 items-end gap-1">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-t" style={{ height: `${(d[dataKey] / max) * 80}px`, minHeight: d[dataKey] > 0 ? 4 : 0, background: colour, opacity: i === data.length - 1 ? 1 : 0.5 }} />
          {i % 2 === 0 && <div className="text-center font-mono text-[7px] text-textDimmer truncate w-full">{d.label.split(" ")[0]}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "users" | "activity" | "analytics" | "support" | "broadcast">("overview");

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  // Agents tab state
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [agentResult, setAgentResult] = useState<string | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [newLead, setNewLead] = useState({ business_name: "", trade: "", email: "", location: "", phone: "" });
  const [addingLead, setAddingLead] = useState(false);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const detailTerminalEndRef = useRef<HTMLDivElement>(null);

  // Rename / delete tickets
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => { if (r.status === 403) throw new Error("forbidden"); return r.json(); })
      .then((d) => { if (d.error) throw new Error(d.error); setStats(d); setStatsLoading(false); })
      .catch((e) => { setStatsError(e.message === "forbidden" ? "Access denied." : e.message); setStatsLoading(false); });
  }, []);

  useEffect(() => {
    if (tab === "support") loadSupport();
    if (tab === "activity" || tab === "analytics") loadActivity();
    if (tab === "agents") loadAgents();
  }, [tab]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeConv?.messages.length]);

  // Live-poll logs every 2s while any agent is running
  useEffect(() => {
    if (!runningAgent) return;
    const id = setInterval(() => {
      fetch("/api/admin/agents/logs")
        .then(r => r.json())
        .then(d => setAgentLogs(d.logs ?? []));
    }, 2000);
    return () => clearInterval(id);
  }, [runningAgent]);

  // Auto-scroll both terminals when logs change
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    detailTerminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentLogs.length]);

  async function loadSupport() {
    setSupportLoading(true);
    const res = await fetch("/api/admin/support");
    const d = await res.json();
    setConversations(d.conversations ?? []);
    setSupportLoading(false);
  }

  async function loadActivity() {
    setActivityLoading(true);
    const res = await fetch("/api/admin/activity");
    const d = await res.json();
    setEvents(d.events ?? []);
    setWeeks(d.weeks ?? []);
    setActivityLoading(false);
  }

  async function sendReply() {
    if (!replyText.trim() || !activeConv) return;
    setReplySending(true);
    const res = await fetch("/api/admin/support/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId: activeConv.businessId, message: replyText }) });
    const d = await res.json();
    if (d.message) {
      const updated = { ...activeConv, messages: [...activeConv.messages, d.message], unread: 0 };
      setActiveConv(updated);
      setConversations((prev) => prev.map((c) => (c.businessId === activeConv.businessId ? updated : c)));
    }
    setReplyText(""); setReplySending(false);
  }

  async function sendBroadcast() {
    if (!broadcastText.trim()) return;
    setBroadcastSending(true);
    const res = await fetch("/api/admin/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: broadcastText }) });
    const d = await res.json();
    setBroadcastResult(d.error ? `Error: ${d.error}` : `✓ Sent to ${d.sent} users`);
    setBroadcastText(""); setBroadcastSending(false);
    setTimeout(() => setBroadcastResult(null), 4000);
  }

  function openConv(conv: Conversation) {
    setActiveConv({ ...conv, unread: 0 });
    setConversations((prev) => prev.map((c) => (c.businessId === conv.businessId ? { ...c, unread: 0 } : c)));
  }

  function startRename(conv: Conversation, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(conv.businessId);
    setRenameValue(conv.businessName);
  }

  async function saveRename(businessId: string) {
    if (!renameValue.trim()) return;
    setRenameSaving(true);
    await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, name: renameValue }),
    });
    const updated = (c: Conversation) =>
      c.businessId === businessId ? { ...c, businessName: renameValue.trim() } : c;
    setConversations((prev) => prev.map(updated));
    if (activeConv?.businessId === businessId) setActiveConv((prev) => prev ? { ...prev, businessName: renameValue.trim() } : prev);
    setRenamingId(null);
    setRenameSaving(false);
  }

  async function deleteTicket(businessId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Delete all messages in this ticket? This cannot be undone.")) return;
    setDeletingId(businessId);
    await fetch(`/api/admin/support?businessId=${businessId}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.businessId !== businessId));
    if (activeConv?.businessId === businessId) setActiveConv(null);
    setDeletingId(null);
  }

  async function loadAgents() {
    setAgentsLoading(true);
    const [logsRes, leadsRes] = await Promise.all([
      fetch("/api/admin/agents/logs"),
      fetch("/api/admin/agents/leads"),
    ]);
    const logsData = await logsRes.json();
    const leadsData = await leadsRes.json();
    setAgentLogs(logsData.logs ?? []);
    setLeads(leadsData.leads ?? []);
    setAgentsLoading(false);
  }

  async function runAgent(agent: string) {
    setRunningAgent(agent);
    setAgentResult(null);
    const res = await fetch("/api/admin/agents/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent }),
    });
    const d = await res.json();
    setRunningAgent(null);
    setAgentResult(d.message ?? d.error ?? "Done");
    setTimeout(() => setAgentResult(null), 5000);
    loadAgents();
  }

  async function addLead() {
    if (!newLead.email.trim() && !newLead.business_name.trim()) return;
    setAddingLead(true);
    await fetch("/api/admin/agents/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLead),
    });
    setNewLead({ business_name: "", trade: "", email: "", location: "", phone: "" });
    setAddingLead(false);
    setShowAddLead(false);
    loadAgents();
  }

  async function deleteLead(id: string) {
    await fetch(`/api/admin/agents/leads?id=${id}`, { method: "DELETE" });
    setLeads(prev => prev.filter(l => l.id !== id));
  }

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  const filteredUsers = (stats?.users ?? []).filter((u) => {
    const matchSearch = u.email.toLowerCase().includes(search.toLowerCase()) || u.businessName.toLowerCase().includes(search.toLowerCase()) || u.trade.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || u.plan === planFilter;
    return matchSearch && matchPlan;
  });

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "activity", label: "Activity" },
    { id: "analytics", label: "Analytics" },
    { id: "support", label: "Support", badge: totalUnread },
    { id: "broadcast", label: "Broadcast" },
    { id: "agents", label: "🤖 Agents" },
  ] as const;

  if (statsLoading) return <div className="flex min-h-screen items-center justify-center"><div className="text-xs text-textDim">Loading admin panel…</div></div>;
  if (statsError) return <div className="flex min-h-screen flex-col items-center justify-center gap-3"><div className="text-sm font-semibold text-warn">{statsError}</div><button onClick={() => router.push("/home")} className="text-xs text-hazard">← Back to app</button></div>;

  // Plan breakdown for charts
  const planCounts: Record<string, number> = {};
  for (const u of stats?.users ?? []) planCounts[u.plan] = (planCounts[u.plan] ?? 0) + 1;
  const paidUsers = (stats?.activeSubscriptions ?? 0);
  const freeUsers = (stats?.totalUsers ?? 0) - paidUsers;
  const conversionRate = stats?.totalUsers ? Math.round((paidUsers / stats.totalUsers) * 100) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      {/* Header */}
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-archivo text-[15px] font-bold">Demand Pilot Admin</div>
            <div className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-textDimmer">Master Control</div>
          </div>
          <button onClick={() => router.push("/home")} className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-textDim">← App</button>
        </div>

        {/* Tab bar */}
        <div className="mt-4 flex gap-0.5 overflow-x-auto pb-0.5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`relative flex-none rounded-lg px-3 py-1.5 font-mono text-[11px] transition-colors ${tab === t.id ? "bg-hazard/15 text-hazard" : "text-textDim hover:text-paper"}`}>
              {t.label}
              {"badge" in t && t.badge > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 font-mono text-[9px] font-bold text-white">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-5">

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        {tab === "overview" && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total Users", value: stats.totalUsers, colour: "text-paper" },
                { label: "Paying Subs", value: stats.activeSubscriptions, colour: "text-[#635bff]" },
                { label: "Monthly Revenue", value: `£${stats.monthlyRevenue.toFixed(2)}`, colour: "text-hazard" },
                { label: "Quotes This Month", value: stats.quotesThisMonth, colour: "text-ok" },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl border border-line bg-panel p-4">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-textDim">{c.label}</div>
                  <div className={`mt-1.5 font-barlow text-3xl font-bold ${c.colour}`}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Conversion rate */}
            <div className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-wider text-textDim">Free → Paid Conversion</div>
                <div className="font-barlow text-[18px] font-bold text-hazard">{conversionRate}%</div>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-gradient-to-r from-hazard2 to-hazard transition-all" style={{ width: `${conversionRate}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[10px] text-textDimmer">
                <span>{freeUsers} free</span><span>{paidUsers} paid</span>
              </div>
            </div>

            {/* Plan breakdown */}
            <div className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-textDim">Plan Breakdown</div>
              {Object.entries(planCounts).sort((a, b) => b[1] - a[1]).map(([plan, count]) => (
                <div key={plan} className="flex items-center gap-3 py-1.5">
                  <span className={`w-16 flex-none rounded-md px-2 py-0.5 text-center text-[9.5px] font-bold capitalize ${PLAN_COLOURS[plan] ?? "bg-line text-textDim"}`}>{plan}</span>
                  <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-hazard" style={{ width: `${(count / stats.totalUsers) * 100}%` }} />
                  </div>
                  <span className="w-6 flex-none text-right font-mono text-[11px] text-textDim">{count}</span>
                </div>
              ))}
            </div>

            {/* Recent signups */}
            <div className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-textDim">Recent Signups</div>
              <div className="space-y-3">
                {stats.users.slice(0, 6).map((u) => (
                  <div key={u.businessId} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold">{u.businessName || "—"}</div>
                      <div className="truncate text-[10px] text-textDim">{u.email} · {u.trade}</div>
                    </div>
                    <span className={`flex-none rounded-md px-2 py-0.5 text-[9px] font-bold capitalize ${PLAN_COLOURS[u.plan] ?? "bg-line text-textDim"}`}>{u.plan}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Users ─────────────────────────────────────────────────────────── */}
        {tab === "users" && stats && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, trade…"
                className="flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-paper placeholder:text-textDimmer focus:border-hazard focus:outline-none" />
              <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}
                className="rounded-xl border border-line bg-panel px-3 py-2.5 text-[12px] text-paper focus:border-hazard focus:outline-none">
                <option value="all">All plans</option>
                <option value="free">Free</option>
                <option value="trade">Trade</option>
                <option value="pro">Pro</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] text-textDimmer">{filteredUsers.length} users</div>
              <button
                onClick={() => {
                  const header = "Business Name,Email,Trade,Plan,Status,Joined";
                  const rows = filteredUsers.map((u) =>
                    [u.businessName, u.email, u.trade, u.plan, u.status, new Date(u.joinedAt).toLocaleDateString("en-GB")]
                      .map((v) => `"${(v || "").replace(/"/g, '""')}"`)
                      .join(",")
                  );
                  const csv = [header, ...rows].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 font-mono text-[10px] text-textDim transition-colors hover:border-hazard hover:text-hazard"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
            </div>
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <div key={u.businessId} className="rounded-2xl border border-line bg-panel px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="truncate text-[13px] font-semibold">{u.businessName || "—"}</div>
                        <span className={`flex-none rounded-md px-1.5 py-0.5 text-[9px] font-bold capitalize ${PLAN_COLOURS[u.plan] ?? "bg-line text-textDim"}`}>{u.plan}</span>
                        {u.status === "active" && <span className="rounded-full bg-ok/15 px-1.5 py-0.5 text-[9px] font-semibold text-ok">Active</span>}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-textDim">{u.email}</div>
                      <div className="mt-0.5 text-[10px] text-textDimmer">{u.trade || "—"} · joined {new Date(u.joinedAt).toLocaleDateString("en-GB")}</div>
                    </div>
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Delete ${u.email} and all their data? This cannot be undone.`)) return;
                        const res = await fetch("/api/admin/delete-user", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ userId: u.ownerId }),
                        });
                        const d = await res.json();
                        if (d.deleted) {
                          setStats((prev) => prev ? { ...prev, users: prev.users.filter((x) => x.businessId !== u.businessId), totalUsers: prev.totalUsers - 1 } : prev);
                        } else {
                          alert("Delete failed: " + (d.error ?? "Unknown error"));
                        }
                      }}
                      className="flex-none rounded-lg border border-warn/30 px-2.5 py-1.5 font-mono text-[10px] text-warn transition-colors hover:bg-warn/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        {tab === "activity" && (
          <div>
            {activityLoading ? (
              <div className="pt-8 text-center text-xs text-textDim">Loading…</div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-textDim">Live platform feed</div>
                  <button onClick={loadActivity} className="text-[10px] text-textDim border border-line rounded-lg px-2.5 py-1 hover:bg-panelRaised transition-colors">↻ Refresh</button>
                </div>
                {events.length === 0 && (
                  <div className="rounded-2xl border border-line bg-panel p-4 text-center text-[11px] text-textDim">No activity yet</div>
                )}
                {events.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
                    <div className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-bold ${EVENT_COLOURS[e.type] ?? "bg-line text-textDim"}`}>
                      {EVENT_ICONS[e.type]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold">{e.label}</div>
                      <div className="truncate text-[10.5px] text-textDim">{e.sub}</div>
                    </div>
                    <div className="flex-none text-right font-mono text-[9.5px] text-textDimmer">{timeAgo(e.at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Analytics ─────────────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div className="space-y-4">
            {activityLoading ? (
              <div className="pt-8 text-center text-xs text-textDim">Loading…</div>
            ) : (
              <>
                <div className="rounded-2xl border border-line bg-panel p-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-textDim">New Signups — Last 10 Weeks</div>
                  <div className="mb-3 font-barlow text-2xl font-bold">{weeks.reduce((s, w) => s + w.signups, 0)} total</div>
                  <BarChart data={weeks} dataKey="signups" colour="#ff6a1f" />
                </div>

                <div className="rounded-2xl border border-line bg-panel p-4">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-textDim">Quotes Created — Last 10 Weeks</div>
                  <div className="mb-3 font-barlow text-2xl font-bold">{weeks.reduce((s, w) => s + w.quotes, 0)} total</div>
                  <BarChart data={weeks} dataKey="quotes" colour="#635bff" />
                </div>

                {/* Key metrics */}
                <div className="rounded-2xl border border-line bg-panel p-4">
                  <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-textDim">Key Metrics</div>
                  <div className="space-y-3">
                    {[
                      { label: "Avg quotes per user", value: stats?.totalUsers ? (weeks.reduce((s, w) => s + w.quotes, 0) / stats.totalUsers).toFixed(1) : "—" },
                      { label: "Free → Paid conversion", value: `${conversionRate}%` },
                      { label: "MRR (estimated)", value: `£${stats?.monthlyRevenue.toFixed(2) ?? "0"}` },
                      { label: "ARPU (paying users)", value: stats?.activeSubscriptions ? `£${(stats.monthlyRevenue / stats.activeSubscriptions).toFixed(2)}` : "—" },
                    ].map((m) => (
                      <div key={m.label} className="flex items-center justify-between">
                        <span className="text-[12px] text-textDim">{m.label}</span>
                        <span className="font-barlow text-[15px] font-bold">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Support ───────────────────────────────────────────────────────── */}
        {tab === "support" && (
          <div className="flex gap-3" style={{ height: "calc(100vh - 200px)" }}>
            <div className="flex w-2/5 flex-col gap-1.5 overflow-y-auto pr-1">
              {supportLoading && <div className="pt-8 text-center text-xs text-textDim">Loading…</div>}
              {!supportLoading && conversations.length === 0 && (
                <div className="rounded-2xl border border-line bg-panel p-4 text-center text-[11px] text-textDim">No support messages yet</div>
              )}
              {conversations.map((c) => (
                <div key={c.businessId}
                  className={`group rounded-2xl border px-3 py-3 transition-colors cursor-pointer ${activeConv?.businessId === c.businessId ? "border-hazard/50 bg-hazard/5" : "border-line bg-panel hover:border-hazard/30"}`}
                  onClick={() => renamingId !== c.businessId && openConv(c)}>

                  {renamingId === c.businessId ? (
                    /* ── Inline rename input ── */
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRename(c.businessId); if (e.key === "Escape") setRenamingId(null); }}
                        className="flex-1 rounded-lg border border-hazard bg-panelRaised px-2 py-1 text-[12px] text-paper focus:outline-none"
                      />
                      <button onClick={() => saveRename(c.businessId)} disabled={renameSaving}
                        className="rounded-lg bg-hazard px-2 py-1 text-[11px] font-bold text-[#161006] disabled:opacity-50">
                        {renameSaving ? "…" : "Save"}
                      </button>
                      <button onClick={() => setRenamingId(null)} className="rounded-lg border border-line px-2 py-1 text-[11px] text-textDim">✕</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-semibold">{c.businessName}</div>
                          <div className="truncate text-[10px] text-textDim">{c.userEmail}</div>
                          <div className="mt-1 truncate text-[10.5px] text-textDimmer">{c.lastMessage}</div>
                        </div>
                        <div className="flex flex-none items-center gap-1">
                          {c.unread > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">{c.unread}</span>}
                          {/* Action icons — visible on hover */}
                          <button onClick={(e) => startRename(c, e)}
                            title="Rename ticket"
                            className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded-md text-textDim hover:bg-line hover:text-paper transition-colors">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={(e) => deleteTicket(c.businessId, e)}
                            title="Delete ticket"
                            disabled={deletingId === c.businessId}
                            className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded-md text-textDim hover:bg-red-500/15 hover:text-red-400 transition-colors disabled:opacity-40">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 text-right font-mono text-[9px] text-textDimmer">{new Date(c.lastAt).toLocaleDateString("en-GB")}</div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-1 flex-col rounded-2xl border border-line bg-panel overflow-hidden">
              {!activeConv ? (
                <div className="flex flex-1 items-center justify-center text-[11px] text-textDim">Select a conversation</div>
              ) : (
                <>
                  <div className="border-b border-line px-4 py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">{activeConv.businessName}</div>
                      <div className="text-[10.5px] text-textDim truncate">{activeConv.userEmail}</div>
                    </div>
                    <div className="flex flex-none items-center gap-1">
                      <button
                        onClick={(e) => startRename(conversations.find(c => c.businessId === activeConv.businessId)!, e)}
                        title="Rename ticket"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-textDim hover:bg-line hover:text-paper transition-colors">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        onClick={(e) => deleteTicket(activeConv.businessId, e)}
                        title="Delete ticket"
                        disabled={deletingId === activeConv.businessId}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-textDim hover:bg-red-500/15 hover:text-red-400 transition-colors disabled:opacity-40">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 p-4">
                    {activeConv.messages.map((m) => (
                      <div key={m.id} className={`flex ${m.from_admin ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${m.from_admin ? "bg-hazard text-[#161006]" : "bg-panelRaised text-paper border border-line"}`}>
                          {m.message}
                          <div className={`mt-1 text-[9px] ${m.from_admin ? "text-[#161006]/60" : "text-textDimmer"}`}>
                            {m.from_admin ? (m.is_ai_reply ? "🤖 Auto-reply" : "You") : activeConv.businessName} · {new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="border-t border-line p-3 flex gap-2">
                    <input value={replyText} onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                      placeholder="Reply…"
                      className="flex-1 rounded-xl border border-line bg-panelRaised px-3 py-2 text-[12px] text-paper placeholder:text-textDimmer focus:border-hazard focus:outline-none" />
                    <button onClick={sendReply} disabled={!replyText.trim() || replySending}
                      className="rounded-xl bg-hazard px-4 py-2 font-barlow text-[12px] font-bold text-[#161006] disabled:opacity-50">
                      {replySending ? "…" : "Send"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Broadcast ─────────────────────────────────────────────────────── */}
        {tab === "broadcast" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-1 font-barlow text-[16px] font-bold">Broadcast Message</div>
              <div className="mb-4 text-[11.5px] text-textDim">
                Send a message to every user's support inbox at once. Use for announcements, new features, or maintenance notices.
              </div>
              <textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="e.g. 🚀 New feature: You can now add a payment link to your quotes! Go to Settings → Bank details to set it up."
                rows={5}
                className="w-full resize-none rounded-xl border border-line bg-panelRaised px-3 py-3 text-[12.5px] text-paper placeholder:text-textDimmer focus:border-hazard focus:outline-none"
              />
              {broadcastResult && (
                <div className={`mt-2 rounded-lg px-3 py-2 text-[12px] font-semibold ${broadcastResult.startsWith("✓") ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
                  {broadcastResult}
                </div>
              )}
              <button
                onClick={sendBroadcast}
                disabled={!broadcastText.trim() || broadcastSending}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-hazard2 to-hazard py-3 font-barlow text-[14px] font-bold uppercase tracking-wide text-[#161006] disabled:opacity-50"
              >
                {broadcastSending ? "Sending…" : `Send to all ${stats?.totalUsers ?? "?"} users`}
              </button>
            </div>

            <div className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-textDim">Tips</div>
              <div className="space-y-2 text-[11.5px] text-textDim leading-relaxed">
                <p>• Users see your message in their support chat bubble (the orange chat icon)</p>
                <p>• A red unread dot appears on their chat button when you send something new</p>
                <p>• Keep messages short and actionable — one key point per broadcast</p>
                <p>• Use emoji to make important announcements stand out</p>
              </div>
            </div>
          </div>
        )}
        {/* ── Agents ────────────────────────────────────────────────────────── */}
        {tab === "agents" && (() => {
          const AGENTS = [
            {
              id: "scout", name: "Scout", role: "Lead Finder", accent: "#3b82f6", glow: "rgba(59,130,246,0.15)", icon: "⬡",
              desc: "Finds 10 real UK trade businesses daily — rotating cities, GPT discovery, live domain checks, Hunter.io emails.",
              steps: ["Pick today's city + trade", "GPT generates 20 candidates", "Verify each domain is live", "Hunter.io email lookup", "Store up to 10 new leads"],
            },
            {
              id: "writer", name: "Writer", role: "Email Crafter", accent: "#a855f7", glow: "rgba(168,85,247,0.15)", icon: "✦",
              desc: "GPT writes a personalised cold email for every new lead — trade-aware, location-specific, conversational.",
              steps: ["Load all 'new' leads", "GPT writes email per lead", "Save subject + body", "Mark lead as 'email_ready'"],
            },
            {
              id: "sender", name: "Sender", role: "Outreach Engine", accent: "#ff6a1f", glow: "rgba(255,106,31,0.15)", icon: "➤",
              desc: "Fires every ready email via Resend with paced delivery, timestamps each send, updates lead status.",
              steps: ["Load 'email_ready' leads", "Send via Resend", "Mark as 'email_sent'", "Pace sends to avoid filters"],
            },
            {
              id: "reporter", name: "Reporter", role: "Daily Briefing", accent: "#22c55e", glow: "rgba(34,197,94,0.15)", icon: "◈",
              desc: "Emails you a full pipeline summary every morning — leads, emails sent, replies, signups, conversion rate.",
              steps: ["Count leads at each stage", "Calculate reply + conversion rates", "Email report to your inbox"],
            },
          ] as const;

          const agentColours: Record<string, string> = { Scout: "#3b82f6", Writer: "#a855f7", Sender: "#ff6a1f", Reporter: "#22c55e", Pipeline: "#22c55e" };
          const statusColours: Record<string, string> = { new: "#6b7280", no_email: "#374151", email_ready: "#3b82f6", email_sent: "#ff6a1f", replied: "#22c55e", signed_up: "#a855f7" };
          const statusLabels: Record<string, string> = { new: "New", no_email: "No Email", email_ready: "Ready", email_sent: "Sent", replied: "Replied", signed_up: "Signed Up" };

          function guessStep(agentId: string, latestMsg: string): number {
            const msg = latestMsg.toLowerCase();
            if (agentId === "scout") {
              if (msg.includes("gpt") || msg.includes("candidates")) return 1;
              if (msg.includes("verif") || msg.includes("domain") || msg.includes("live")) return 2;
              if (msg.includes("hunter") || msg.includes("email")) return 3;
              if (msg.includes("✓") || msg.includes("◎") || msg.includes("stored")) return 4;
            }
            if (agentId === "writer") {
              if (msg.includes("writing") || msg.includes("leads")) return 0;
              if (msg.includes("gpt") || msg.includes("email ready") || msg.includes("ready for")) return 2;
            }
            if (agentId === "sender") {
              if (msg.includes("sending")) return 0;
              if (msg.includes("sent to")) return 2;
            }
            if (agentId === "reporter") {
              if (msg.includes("report sent")) return 2;
            }
            return 0;
          }

          // ── Detail view ────────────────────────────────────────────────────────
          if (selectedAgent) {
            const agent = AGENTS.find(a => a.id === selectedAgent)!;
            const isRunning = runningAgent === agent.id || runningAgent === "pipeline";
            const myLogs = agentLogs.filter(l => l.agent.toLowerCase() === agent.name.toLowerCase());
            const successCount = myLogs.filter(l => l.type === "success").length;
            const errorCount = myLogs.filter(l => l.type === "error").length;
            const lastRun = myLogs[0]?.created_at;
            const latestLog = myLogs[0];
            const currentStep = isRunning && latestLog ? guessStep(agent.id, latestLog.message) : -1;

            return (
              <div className="space-y-3">
                {/* Breadcrumb */}
                <button onClick={() => setSelectedAgent(null)}
                  className="flex items-center gap-1.5 font-mono text-[10px] text-textDimmer hover:text-paper transition-colors">
                  <span>←</span>
                  <span className="uppercase tracking-widest">Fleet</span>
                  <span className="opacity-30">/</span>
                  <span className="uppercase tracking-widest" style={{ color: agent.accent }}>{agent.name}</span>
                </button>

                {/* Hero card */}
                <div className="relative overflow-hidden rounded-2xl" style={{ background: "#09090b", border: `1px solid ${agent.accent}35` }}>
                  {/* Glow */}
                  <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at top left, ${agent.glow}, transparent 60%)` }} />
                  {/* Top color bar */}
                  <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${agent.accent}, ${agent.accent}40, transparent)` }} />

                  <div className="relative p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        {/* Big icon */}
                        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-[28px]"
                          style={{ backgroundColor: `${agent.accent}18`, border: `1px solid ${agent.accent}40`, boxShadow: isRunning ? `0 0 20px ${agent.accent}30` : "none" }}>
                          <span style={{ color: agent.accent }}>{agent.icon}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: agent.accent }}>{agent.role}</span>
                            <span className={`inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-full ${isRunning ? "animate-pulse" : ""}`}
                              style={{ color: isRunning ? "#22c55e" : "#4a4d56", backgroundColor: isRunning ? "#22c55e15" : "#1a1c21", border: `1px solid ${isRunning ? "#22c55e30" : "#2a2d35"}` }}>
                              <span className={`h-1 w-1 rounded-full inline-block ${isRunning ? "bg-[#22c55e]" : "bg-[#3a3d46]"}`} />
                              {isRunning ? "Running" : "Idle"}
                            </span>
                          </div>
                          <div className="font-barlow text-[26px] font-bold tracking-tight leading-none">{agent.name}</div>
                          <div className="mt-1.5 max-w-[260px] font-mono text-[10px] leading-relaxed text-textDimmer">{agent.desc}</div>
                        </div>
                      </div>
                      <button onClick={() => runAgent(agent.id)} disabled={runningAgent !== null}
                        className="flex-none flex items-center gap-2 rounded-xl px-5 py-2.5 font-barlow text-[13px] font-bold tracking-wide transition-all active:scale-95 disabled:opacity-30"
                        style={{ background: `linear-gradient(135deg, ${agent.accent}25, ${agent.accent}10)`, color: agent.accent, border: `1px solid ${agent.accent}45` }}>
                        {isRunning ? <><span className="animate-spin inline-block">◌</span> Running…</> : "▶ Run Now"}
                      </button>
                    </div>

                    {/* Live action */}
                    {isRunning && latestLog && (
                      <div className="mt-4 flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                        style={{ backgroundColor: `${agent.accent}0d`, border: `1px solid ${agent.accent}25` }}>
                        <span className="h-1.5 w-1.5 rounded-full animate-pulse flex-none" style={{ backgroundColor: agent.accent }} />
                        <span className="font-mono text-[10px] text-textDim flex-1 truncate">{latestLog.message}</span>
                      </div>
                    )}

                    {/* Stats row */}
                    <div className="mt-4 grid grid-cols-4 gap-2.5 border-t pt-4" style={{ borderColor: `${agent.accent}15` }}>
                      {[
                        { label: "Total Logs", value: myLogs.length, c: agent.accent },
                        { label: "Successes", value: successCount, c: "#22c55e" },
                        { label: "Errors", value: errorCount, c: "#ef4444" },
                        { label: "Last Run", value: lastRun ? timeAgo(lastRun) : "Never", c: "#6b7280", small: true },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: "#0d0f11", border: "1px solid #1e2025" }}>
                          <div className={`font-barlow font-bold leading-none ${s.small ? "text-[13px] mt-1" : "text-[22px]"}`} style={{ color: s.c }}>{s.value}</div>
                          <div className="mt-1 font-mono text-[7.5px] uppercase tracking-widest text-textDimmer">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Step timeline */}
                <div className="rounded-2xl overflow-hidden" style={{ background: "#09090b", border: "1px solid #1e2025" }}>
                  <div className="px-4 py-3 border-b border-[#1e2025] flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: agent.accent }} />
                    <span className="font-mono text-[9px] uppercase tracking-widest text-textDimmer">How {agent.name} works</span>
                  </div>
                  <div className="p-4 space-y-0">
                    {agent.steps.map((step, i) => {
                      const isCurrent = isRunning && i === currentStep;
                      const isDone = isRunning && i < currentStep;
                      const isLast = i === agent.steps.length - 1;
                      return (
                        <div key={i} className="flex gap-3">
                          {/* Spine */}
                          <div className="flex flex-col items-center flex-none w-7">
                            <div className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[9px] font-bold transition-all ${isCurrent ? "scale-110" : ""}`}
                              style={{
                                backgroundColor: isCurrent ? `${agent.accent}20` : isDone ? "#22c55e15" : "#131518",
                                color: isCurrent ? agent.accent : isDone ? "#22c55e" : "#3a3d46",
                                border: `1px solid ${isCurrent ? `${agent.accent}60` : isDone ? "#22c55e40" : "#252830"}`,
                                boxShadow: isCurrent ? `0 0 12px ${agent.accent}30` : "none",
                              }}>
                              {isDone ? "✓" : i + 1}
                            </div>
                            {!isLast && <div className="w-px flex-1 my-1" style={{ backgroundColor: isDone ? "#22c55e30" : "#1e2025" }} />}
                          </div>
                          {/* Content */}
                          <div className={`flex-1 pb-3 ${isLast ? "" : ""}`}>
                            <div className={`rounded-xl px-3 py-2.5 transition-all ${isCurrent ? "" : ""}`}
                              style={{ backgroundColor: isCurrent ? `${agent.accent}08` : "transparent" }}>
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-[11px] font-semibold ${isCurrent ? "text-paper" : isDone ? "text-textDim" : "text-textDimmer"}`}>{step}</span>
                                {isCurrent && <span className="h-1.5 w-1.5 rounded-full animate-pulse flex-none" style={{ backgroundColor: agent.accent }} />}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Log terminal */}
                <div className="overflow-hidden rounded-2xl" style={{ background: "#06080a", border: "1px solid #1a1c20" }}>
                  <div className="flex items-center justify-between border-b border-[#1a1c20] px-4 py-2.5" style={{ background: "#0a0c0e" }}>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                        <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                        <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                      </div>
                      <span className="font-mono text-[9px] text-[#4a4d56]">
                        {agent.name.toLowerCase()}.log
                        <span className="mx-1.5 text-[#2a2d35]">—</span>
                        <span className="text-[#3a3d46]">{myLogs.length} entries</span>
                        {isRunning && <span className="ml-2 animate-pulse" style={{ color: agent.accent }}>● live</span>}
                      </span>
                    </div>
                    <button onClick={loadAgents} className="font-mono text-[9px] text-[#3a3d46] hover:text-paper transition-colors">↻</button>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto p-3 space-y-0.5">
                    {myLogs.length === 0 ? (
                      <div className="py-12 text-center">
                        <div className="font-mono text-[11px] text-[#3a3d46]">$ awaiting input</div>
                        <div className="mt-1 font-mono text-[9px] text-[#2a2d35]">hit Run to start</div>
                      </div>
                    ) : [...myLogs].reverse().map((log) => (
                      <div key={log.id} className="flex items-start gap-2.5 rounded-lg px-3 py-1.5 hover:bg-white/[0.015]">
                        <span className="flex-none font-mono text-[9px] mt-0.5 w-3.5">
                          {log.type === "error" ? <span className="text-red-500">✗</span> : log.type === "success" ? <span className="text-emerald-500">✓</span> : <span className="text-[#3a3d46]">›</span>}
                        </span>
                        <span className={`flex-1 font-mono text-[10.5px] leading-relaxed ${log.type === "error" ? "text-red-400" : log.type === "success" ? "text-emerald-400" : "text-[#8a8d96]"}`}>
                          {log.message}
                        </span>
                        <span className="flex-none font-mono text-[8px] text-[#2a2d35] whitespace-nowrap">{timeAgo(log.created_at)}</span>
                      </div>
                    ))}
                    <div ref={detailTerminalEndRef} />
                  </div>
                </div>
              </div>
            );
          }

          // ── Fleet view ─────────────────────────────────────────────────────────
          const emailsSent   = leads.filter(l => l.status === "email_sent" || l.status === "replied" || l.status === "signed_up").length;
          const replies      = leads.filter(l => l.status === "replied" || l.status === "signed_up").length;
          const signups      = leads.filter(l => l.status === "signed_up").length;
          const readyToSend  = leads.filter(l => l.status === "email_ready").length;
          const currentRunningLog = runningAgent ? agentLogs.find(l => l.agent.toLowerCase() === (runningAgent === "pipeline" ? "scout" : runningAgent)) : null;

          return (
            <div className="space-y-5">

              {/* ─ Header ────────────────────────────────────────────────── */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-textDimmer mb-0.5">Demand Pilot</div>
                  <div className="font-barlow text-[24px] font-bold tracking-tight leading-none">Operations</div>
                </div>
                <button onClick={() => runAgent("pipeline")} disabled={runningAgent !== null}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-barlow text-[13px] font-bold tracking-wide transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: runningAgent ? "#0d1a0d" : "linear-gradient(135deg, #22c55e25, #22c55e10)", color: "#22c55e", border: "1px solid #22c55e35" }}>
                  {runningAgent ? (
                    <><span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />Running…</>
                  ) : (
                    <><span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]/60" />Run Full Pipeline</>
                  )}
                </button>
              </div>

              {/* ─ Live activity banner ──────────────────────────────────── */}
              {runningAgent && (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #22c55e25", background: "#070d07" }}>
                  <div className="h-[2px]" style={{ background: "linear-gradient(90deg, #22c55e, #22c55e40, transparent)" }} />
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-none">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                      <span className="font-mono text-[9px] uppercase tracking-widest text-[#22c55e]">{runningAgent}</span>
                    </div>
                    <div className="w-px h-3 bg-[#1e2025] flex-none" />
                    <span className="font-mono text-[10px] text-[#6b7280] truncate flex-1">
                      {currentRunningLog?.message ?? "Initialising…"}
                    </span>
                  </div>
                </div>
              )}

              {agentResult && (
                <div className="rounded-xl px-4 py-3 font-mono text-[11px]" style={{ color: "#22c55e", background: "#070d07", border: "1px solid #22c55e25" }}>
                  ✓ {agentResult}
                </div>
              )}

              {/* ─ Pipeline stats ────────────────────────────────────────── */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "#09090b", border: "1px solid #1e2025" }}>
                <div className="px-4 pt-4 pb-3">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-textDimmer mb-3">Pipeline</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Leads Found", value: leads.length, c: "#6b7280" },
                      { label: "Emails Ready", value: readyToSend, c: "#3b82f6" },
                      { label: "Sent", value: emailsSent, c: "#ff6a1f" },
                      { label: "Replied", value: replies, c: "#22c55e" },
                    ].map((s, i) => (
                      <div key={s.label} className="relative rounded-xl p-3 text-center overflow-hidden"
                        style={{ backgroundColor: `${s.c}08`, border: `1px solid ${s.c}20` }}>
                        <div className="font-barlow text-[26px] font-bold leading-none" style={{ color: s.c }}>{s.value}</div>
                        <div className="mt-1 font-mono text-[7.5px] uppercase tracking-widest text-textDimmer">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {leads.length > 0 && (
                    <div className="mt-3">
                      <div className="h-1 rounded-full bg-[#131518] overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, (emailsSent / leads.length) * 100)}%`, background: "linear-gradient(90deg, #3b82f6, #ff6a1f, #22c55e)" }} />
                      </div>
                      <div className="mt-1 flex justify-between font-mono text-[8px] text-textDimmer">
                        <span>0</span>
                        <span>{Math.round((emailsSent / leads.length) * 100)}% through pipeline</span>
                        <span>{leads.length}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ─ Agent cards ───────────────────────────────────────────── */}
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-textDimmer mb-2.5 px-0.5">Agents</div>
                <div className="space-y-2.5">
                  {AGENTS.map((agent) => {
                    const isRunning = runningAgent === agent.id || runningAgent === "pipeline";
                    const myLogs = agentLogs.filter(l => l.agent.toLowerCase() === agent.name.toLowerCase());
                    const latestLog = myLogs[0];
                    const errCount = myLogs.filter(l => l.type === "error").length;
                    const successCount = myLogs.filter(l => l.type === "success").length;
                    const currentStepIdx = isRunning && latestLog ? guessStep(agent.id, latestLog.message) : -1;

                    return (
                      <div key={agent.id}
                        className="relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-200 active:scale-[0.99]"
                        style={{
                          background: isRunning ? `linear-gradient(135deg, #0a0c0e, ${agent.accent}08)` : "#09090b",
                          border: `1px solid ${isRunning ? `${agent.accent}45` : "#1e2025"}`,
                          boxShadow: isRunning ? `0 0 30px ${agent.accent}15` : "none",
                        }}
                        onClick={() => setSelectedAgent(agent.id)}>

                        {/* Top accent bar */}
                        <div className="h-[2px] w-full transition-all" style={{ background: isRunning ? `linear-gradient(90deg, ${agent.accent}, ${agent.accent}40, transparent)` : `linear-gradient(90deg, ${agent.accent}40, transparent)` }} />

                        {/* Glow bg when running */}
                        {isRunning && <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 0% 50%, ${agent.glow}, transparent 70%)` }} />}

                        <div className="relative flex items-center gap-4 px-4 py-4">
                          {/* Icon */}
                          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl text-[22px] transition-all"
                            style={{
                              backgroundColor: `${agent.accent}15`,
                              border: `1px solid ${isRunning ? `${agent.accent}50` : `${agent.accent}25`}`,
                              boxShadow: isRunning ? `0 0 16px ${agent.accent}25` : "none",
                            }}>
                            <span style={{ color: agent.accent }}>{agent.icon}</span>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-barlow text-[15px] font-bold tracking-tight">{agent.name}</span>
                              <span className={`inline-flex items-center gap-1 font-mono text-[7.5px] uppercase tracking-wider px-2 py-0.5 rounded-full ${isRunning ? "animate-pulse" : ""}`}
                                style={{
                                  color: isRunning ? "#22c55e" : agent.accent,
                                  backgroundColor: isRunning ? "#22c55e10" : `${agent.accent}10`,
                                  border: `1px solid ${isRunning ? "#22c55e25" : `${agent.accent}25`}`,
                                }}>
                                <span className={`h-1 w-1 rounded-full inline-block ${isRunning ? "bg-[#22c55e]" : ""}`} style={{ backgroundColor: isRunning ? "#22c55e" : agent.accent }} />
                                {isRunning ? "Running" : "Idle"}
                              </span>
                              {errCount > 0 && (
                                <span className="font-mono text-[7.5px] px-1.5 py-0.5 rounded-full text-red-400 bg-red-500/10 border border-red-500/20">{errCount} err</span>
                              )}
                            </div>
                            <div className="font-mono text-[9px] text-textDimmer">{agent.role}</div>
                            <div className="mt-1 font-mono text-[9.5px] truncate" style={{ color: isRunning ? agent.accent : latestLog ? "#6b7280" : "#3a3d46" }}>
                              {isRunning && latestLog
                                ? `▸ ${latestLog.message}`
                                : latestLog
                                  ? `▸ ${latestLog.message}`
                                  : agent.desc.slice(0, 60) + "…"
                              }
                            </div>
                          </div>

                          {/* Right */}
                          <div className="flex flex-none items-center gap-3">
                            <div className="text-right">
                              <div className="font-barlow text-[18px] font-bold leading-none" style={{ color: agent.accent }}>{successCount}</div>
                              <div className="font-mono text-[7px] uppercase tracking-widest text-textDimmer mt-0.5">ok</div>
                            </div>
                            <button onClick={e => { e.stopPropagation(); runAgent(agent.id); }}
                              disabled={runningAgent !== null}
                              className="rounded-xl px-4 py-2 font-mono text-[9.5px] font-bold uppercase tracking-wider transition-all disabled:opacity-30 active:scale-95"
                              style={{ backgroundColor: `${agent.accent}18`, color: agent.accent, border: `1px solid ${agent.accent}35` }}>
                              {isRunning ? <span className="animate-pulse">···</span> : "Run"}
                            </button>
                            <span className="text-[#2a2d35]">›</span>
                          </div>
                        </div>

                        {/* Step progress strip when running */}
                        {isRunning && (
                          <div className="flex items-center gap-0 border-t overflow-x-auto" style={{ borderColor: `${agent.accent}15`, backgroundColor: `${agent.accent}05` }}>
                            {agent.steps.map((step, i) => {
                              const done = i < currentStepIdx;
                              const active = i === currentStepIdx;
                              return (
                                <div key={i} className={`flex items-center gap-1.5 px-3 py-2 flex-none border-r last:border-r-0`}
                                  style={{ borderColor: `${agent.accent}10`, backgroundColor: active ? `${agent.accent}10` : "transparent" }}>
                                  <div className={`h-1.5 w-1.5 rounded-full flex-none ${active ? "animate-pulse" : ""}`}
                                    style={{ backgroundColor: active ? agent.accent : done ? "#22c55e" : "#252830" }} />
                                  <span className="font-mono text-[8px] whitespace-nowrap"
                                    style={{ color: active ? agent.accent : done ? "#22c55e80" : "#3a3d46" }}>{step}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ─ Live terminal ─────────────────────────────────────────── */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "#06080a", border: "1px solid #18191d" }}>
                <div className="flex items-center justify-between border-b border-[#18191d] px-4 py-2.5" style={{ background: "#09090b" }}>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 rounded-full transition-colors ${runningAgent ? "bg-[#22c55e] animate-pulse" : agentLogs.length > 0 ? "bg-[#22c55e60]" : "bg-[#252830]"}`} />
                      <span className="font-mono text-[9px] text-[#3a3d46]">
                        operations.log{runningAgent && <span className="text-[#22c55e] ml-1.5">streaming</span>}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={loadAgents} className="font-mono text-[9px] text-[#3a3d46] hover:text-paper transition-colors">↻</button>
                    <button onClick={() => fetch("/api/admin/agents/logs", { method: "DELETE" }).then(loadAgents)}
                      className="font-mono text-[9px] text-[#3a3d46] hover:text-red-400 transition-colors">clear</button>
                  </div>
                </div>
                <div className="h-56 overflow-y-auto p-3 space-y-0.5">
                  {agentsLoading ? (
                    <div className="h-full flex items-center justify-center font-mono text-[10px] text-[#2a2d35]">$ initialising…</div>
                  ) : agentLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-1">
                      <div className="font-mono text-[10px] text-[#2a2d35]">$ no output — run an agent to start</div>
                    </div>
                  ) : [...agentLogs].reverse().map((log) => {
                    const c = agentColours[log.agent] ?? "#6b7280";
                    return (
                      <div key={log.id} className="flex items-start gap-2.5 rounded px-2.5 py-1 hover:bg-white/[0.015]">
                        <span className="flex-none font-mono text-[9px] font-bold" style={{ color: c }}>{log.agent.slice(0, 3).toUpperCase()}</span>
                        <span className="flex-none text-[#252830] text-[10px]">›</span>
                        <span className={`flex-1 font-mono text-[10px] leading-relaxed ${log.type === "error" ? "text-red-400" : log.type === "success" ? "text-emerald-400" : "text-[#7a7d86]"}`}>{log.message}</span>
                        <span className="flex-none font-mono text-[8px] text-[#2a2d35]">{timeAgo(log.created_at)}</span>
                      </div>
                    );
                  })}
                  <div ref={terminalEndRef} />
                </div>
              </div>

              {/* ─ Lead database ─────────────────────────────────────────── */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "#09090b", border: "1px solid #1e2025" }}>
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#1e2025]">
                  <div className="flex items-center gap-3">
                    <span className="font-barlow text-[15px] font-bold">Lead Database</span>
                    <span className="font-mono text-[8.5px] px-2 py-0.5 rounded-full text-textDimmer bg-[#131518] border border-[#1e2025]">{leads.length} total</span>
                  </div>
                  <button onClick={() => setShowAddLead(!showAddLead)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-all"
                    style={{ color: "#ff6a1f", backgroundColor: "#ff6a1f12", border: "1px solid #ff6a1f30" }}>
                    + Manual
                  </button>
                </div>

                {showAddLead && (
                  <div className="border-b border-[#1e2025] p-4 space-y-3" style={{ background: "#07080a" }}>
                    <div className="font-mono text-[8.5px] uppercase tracking-widest text-[#ff6a1f]">Add Lead Manually</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: "business_name", placeholder: "Business name" },
                        { key: "trade", placeholder: "Trade (e.g. plumber)" },
                        { key: "email", placeholder: "Email address *" },
                        { key: "location", placeholder: "City / location" },
                      ].map(({ key, placeholder }) => (
                        <input key={key}
                          value={newLead[key as keyof typeof newLead]}
                          onChange={e => setNewLead(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="rounded-xl px-3 py-2.5 font-mono text-[11px] text-paper placeholder:text-textDimmer focus:outline-none"
                          style={{ background: "#0d0f11", border: "1px solid #252830" }}
                          onFocus={e => e.target.style.borderColor = "#ff6a1f60"}
                          onBlur={e => e.target.style.borderColor = "#252830"} />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addLead} disabled={addingLead || (!newLead.email.trim() && !newLead.business_name.trim())}
                        className="flex-1 rounded-xl py-2.5 font-barlow text-[13px] font-bold text-[#161006] disabled:opacity-50 transition-all"
                        style={{ background: "linear-gradient(135deg, #ff7a2e, #ff6a1f)" }}>
                        {addingLead ? "Adding…" : "Add Lead"}
                      </button>
                      <button onClick={() => setShowAddLead(false)}
                        className="rounded-xl px-4 font-mono text-[11px] text-textDim transition-colors hover:text-paper"
                        style={{ background: "#0d0f11", border: "1px solid #252830" }}>✕</button>
                    </div>
                  </div>
                )}

                {leads.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="font-mono text-[11px] text-[#3a3d46]">Scout fills this automatically each day</div>
                    <div className="mt-1 font-mono text-[9px] text-[#252830]">or run Scout manually above</div>
                  </div>
                ) : (
                  <div>
                    {leads.map((lead, idx) => {
                      const sc = statusColours[lead.status] ?? "#6b7280";
                      const sl = statusLabels[lead.status] ?? lead.status;
                      return (
                        <div key={lead.id} className="border-b border-[#131518] last:border-0">
                          <div className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.01]"
                            onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}>
                            {/* Status dot */}
                            <div className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: sc }} />
                            {/* Lead info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-[11px] font-semibold text-paper truncate">{lead.business_name || lead.email || "—"}</div>
                              <div className="font-mono text-[9px] text-[#4a4d56] truncate mt-0.5">
                                {[lead.trade, lead.location, lead.email].filter(Boolean).join("  ·  ")}
                              </div>
                            </div>
                            {/* Status pill */}
                            <span className="flex-none rounded-full px-2.5 py-0.5 font-mono text-[7.5px] uppercase tracking-wider"
                              style={{ color: sc, backgroundColor: `${sc}12`, border: `1px solid ${sc}25` }}>
                              {sl}
                            </span>
                            {/* Delete */}
                            <button onClick={e => { e.stopPropagation(); deleteLead(lead.id); }}
                              className="flex-none w-5 h-5 flex items-center justify-center rounded-md text-[#2a2d35] hover:text-red-400 hover:bg-red-500/10 transition-colors text-[11px]">✕</button>
                          </div>
                          {expandedLead === lead.id && (
                            <div className="border-t border-[#0e1012] px-4 py-3.5" style={{ background: "#070809" }}>
                              {lead.email_body ? (
                                <>
                                  <div className="mb-2.5 font-mono text-[8px] uppercase tracking-widest" style={{ color: "#ff6a1f" }}>{lead.email_subject}</div>
                                  <div className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[#7a7d86]">{lead.email_body}</div>
                                </>
                              ) : (
                                <div className="font-mono text-[10px] text-[#3a3d46]">No email written yet — run Writer to generate one</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          );
        })()}

      </div>
    </div>
  );
}

