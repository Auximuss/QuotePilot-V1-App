"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

interface TopBarProps {
  /** Main heading shown on the left */
  title: string;
  /** Optional smaller line below the title */
  subtitle?: string;
  /** If provided, a back chevron is shown that navigates to this href */
  back?: string;
}

export default function TopBar({ title, subtitle, back }: TopBarProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between px-5 pb-2 pt-5">
      <div className="flex items-center gap-2.5">
        {back && (
          <button
            onClick={() => router.push(back)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-panel text-textDim transition-colors active:bg-panelRaised"
            aria-label="Back"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {!back && (
          <span className="font-barlow text-lg font-bold tracking-tight">Demand <span className="text-hazard">Pilot</span></span>
        )}
        {back && (
          <div>
            <h1 className="font-barlow text-[22px] font-bold leading-none">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-textDim">{subtitle}</p>
            )}
          </div>
        )}
      </div>

      {/* Settings gear — top right */}
      <Link
        href="/settings"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel text-textDim transition-colors hover:border-hazard hover:text-hazard active:bg-panelRaised"
        aria-label="Settings"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 15a3 3 0 100-6 3 3 0 000 6z"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </div>
  );
}
