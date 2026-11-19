"use client";

import { Montserrat } from "next/font/google";

export const brandEn = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-en" });

export function AdminHero({ kicker, title, lead }: { kicker: string; title: string; lead: string }) {
  return (
    <header className="relative mb-4 overflow-hidden rounded-2xl border border-white/10 bg-[#071a33] px-4 py-5 text-white sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(242,195,0,0.18),transparent_34%),linear-gradient(120deg,#0b2545_0%,#071a33_70%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`${brandEn.className} text-[11px] font-semibold tracking-[0.14em] text-[#f2c300]`}>{kicker}</p>
          <h1 className="mt-1 text-[1.7rem] font-black leading-tight tracking-wide sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">{lead}</p>
        </div>
        <img src="/brand/logo-white.png" alt="グリュック合同会社" className="h-11 w-auto shrink-0 sm:h-14" />
      </div>
      <div className="hazard-thin relative mt-4 h-1.5 w-24 rounded-sm" />
    </header>
  );
}
