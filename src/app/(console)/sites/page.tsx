"use client";

import Link from "next/link";
import { useMemo } from "react";
import { core } from "@/lib/attendance";
import { siteStats, statusLabel } from "@/lib/aggregate";
import { useLedger } from "@/components/ledger-context";
import { MobilePageHeader } from "@/components/shell";

export default function SitesPage() {
  const { ledger, events, date, region, project, link } = useLedger();
  const sites = useMemo(() => {
    if (!ledger) return [];
    const snap = core(ledger, events, date);
    return siteStats(ledger, snap.rows, snap.needs, { region, project });
  }, [ledger, events, date, region, project]);
  return (
    <div className="mx-auto max-w-5xl px-3 py-3 lg:px-6">
      <MobilePageHeader title="現場一覧" />
      <h1 className="mb-3 hidden text-2xl font-black lg:block">現場一覧</h1>
      <div className="space-y-2">
        {sites.map((site) => {
          const label = statusLabel(site);
          return (
            <Link key={site.pi} href={link(`/sites/${site.pi}`)} className="panel flex items-center justify-between px-4 py-4">
              <div>
                <div className="text-xs text-neutral-500">{site.code}　{site.region}</div>
                <div className="text-lg font-black">{site.name}</div>
                <div className="text-sm text-neutral-400">担当 {site.manager}</div>
              </div>
              <div className="text-right">
                <div className="num text-2xl text-[#ff6a00]">{site.head.attend}<span className="text-base text-neutral-400">/{site.head.total}</span></div>
                <div className={`text-sm font-bold ${label.tone === "ok" ? "text-neutral-500" : "text-[#ffb067]"}`}>{label.text}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
