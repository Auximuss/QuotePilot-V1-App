"use client";

import { useRouter } from "next/navigation";

export default function ScreenHeader({ title, back }: { title: string; back: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2.5 px-5 pb-1 pt-2">
      <button
        onClick={() => router.push(back)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel"
        aria-label="Back"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f2ede4" strokeWidth={2}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div className="font-barlow text-base font-bold">{title}</div>
    </div>
  );
}
