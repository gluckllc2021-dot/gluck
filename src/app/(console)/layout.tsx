"use client";

import { Suspense } from "react";
import { LedgerProvider } from "@/components/ledger-context";
import { Shell } from "@/components/shell";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-neutral-400">読み込み中…</div>}>
      <LedgerProvider>
        <Shell>{children}</Shell>
      </LedgerProvider>
    </Suspense>
  );
}
