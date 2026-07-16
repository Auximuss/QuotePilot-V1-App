"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ScreenHeader from "@/components/ScreenHeader";

type Job = { id: string; job_title: string; customer_name: string; address: string; sent_at: string; total: number; status: string };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export default function CalendarPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const { data: biz } = await supabase.from("businesses").select("id").eq("owner_id", user.id).single();
      if (!biz) return;
      const { data } = await supabase
        .from("quotes")
        .select("id, job_title, customer_name, address, sent_at, total, status")
        .eq("business_id", biz.id)
        .in("status", ["accepted", "complete"])
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: true });
      setJobs(data ?? []);
      setLoading(false);
    })();
  }, [router]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday-first offset
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = startOffset + lastDay.getDate();
  const cells = Math.ceil(totalCells / 7) * 7;

  function jobsOnDay(day: number) {
    const d = new Date(year, month, day);
    return jobs.filter(j => {
      const jd = new Date(j.sent_at);
      return jd.getFullYear() === d.getFullYear() && jd.getMonth() === d.getMonth() && jd.getDate() === d.getDate();
    });
  }

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)); }

  const upcomingJobs = jobs.filter(j => new Date(j.sent_at) >= today).slice(0, 5);

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Job Calendar" back="/home" />
      <div className="flex-1 overflow-y-auto px-4 pb-6">

        {/* Month nav */}
        <div className="my-3 flex items-center justify-between">
          <button onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-textDim hover:border-hazard hover:text-hazard transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="font-barlow text-base font-bold">{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-textDim hover:border-hazard hover:text-hazard transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => <div key={d} className="text-center font-mono text-[9px] uppercase tracking-wider text-textDimmer py-1">{d}</div>)}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex h-48 items-center justify-center text-xs text-textDim">Loading…</div>
        ) : (
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: cells }).map((_, i) => {
              const dayNum = i - startOffset + 1;
              const isThisMonth = dayNum >= 1 && dayNum <= lastDay.getDate();
              const isToday = isThisMonth && new Date(year, month, dayNum).toDateString() === today.toDateString();
              const dayJobs = isThisMonth ? jobsOnDay(dayNum) : [];
              return (
                <div key={i} className={`relative min-h-[48px] rounded-lg p-1 ${isThisMonth ? "bg-panel" : ""} ${isToday ? "border border-hazard" : ""}`}>
                  {isThisMonth && (
                    <>
                      <div className={`text-center font-mono text-[10px] ${isToday ? "text-hazard font-bold" : "text-textDim"}`}>{dayNum}</div>
                      {dayJobs.map(j => (
                        <button key={j.id} onClick={() => router.push(`/quote/send?id=${j.id}`)}
                          className="mt-0.5 w-full truncate rounded bg-hazard/20 px-1 py-0.5 text-left font-mono text-[8px] text-hazard hover:bg-hazard/30 transition-colors">
                          {j.job_title ?? j.customer_name ?? "Job"}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Upcoming jobs list */}
        {upcomingJobs.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-textDim">Upcoming jobs</div>
            <div className="space-y-2">
              {upcomingJobs.map(j => (
                <button key={j.id} onClick={() => router.push(`/quote/send?id=${j.id}`)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-left hover:border-hazard/50 transition-colors">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold">{j.job_title ?? "Job"}</div>
                    <div className="truncate text-[10px] text-textDim">{j.customer_name}{j.address ? ` · ${j.address}` : ""}</div>
                  </div>
                  <div className="flex-none text-right">
                    <div className="font-mono text-[10px] text-hazard">£{(j.total ?? 0).toLocaleString("en-GB")}</div>
                    <div className="font-mono text-[9px] text-textDimmer">{new Date(j.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
