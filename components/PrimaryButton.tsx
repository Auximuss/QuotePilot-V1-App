"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon?: ReactNode;
};

export default function PrimaryButton({ children, icon, className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-hazard2 to-hazard px-5 py-4 font-barlow text-lg font-bold uppercase tracking-wide text-[#161006] shadow-[0_14px_28px_-10px_#ff6a1f55,inset_0_1px_0_#ffffff40] transition-transform active:scale-[0.97] disabled:opacity-60 ${className}`}
    >
      {children}
      {icon}
    </button>
  );
}
