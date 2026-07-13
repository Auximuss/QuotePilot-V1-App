"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslation } from "@/lib/LanguageContext";

const TAB_HREFS = ["/home", "/history", "/analytics"] as const;
const TAB_ICONS = [
  <svg key="home" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 11l9-8 9 8M5 10v10h14V10" /></svg>,
  <svg key="quotes" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>,
  <svg key="stats" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 20V10M12 20V4M20 20v-7" /></svg>,
];

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const labels = [t.nav.home, t.nav.quotes, t.nav.stats];

  return (
    <div className="flex border-t border-line bg-[#15171b] px-2.5 pb-4 pt-2.5">
      {TAB_HREFS.map((href, i) => {
        const active = pathname === href;
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            className={`flex flex-1 flex-col items-center gap-1 ${active ? "text-hazard" : "text-textDimmer"}`}
          >
            <span className="h-[19px] w-[19px]">{TAB_ICONS[i]}</span>
            <span className="font-mono text-[9.5px]">{labels[i]}</span>
          </button>
        );
      })}
    </div>
  );
}
