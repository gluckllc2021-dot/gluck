"use client";

import type { RegionStat } from "@/lib/aggregate";

const ANCHOR: Record<string, { x: number; y: number; lx: number; ly: number }> = {
  北海道: { x: 68, y: 18, lx: 48, ly: 2 },
  青森: { x: 62, y: 34, lx: 36, ly: 27 },
  岩手: { x: 66, y: 40, lx: 74, ly: 34 },
  宮城: { x: 64, y: 46, lx: 76, ly: 44 },
  秋田: { x: 56, y: 40, lx: 18, ly: 36 },
  山形: { x: 58, y: 46, lx: 16, ly: 46 },
  福島: { x: 60, y: 52, lx: 74, ly: 54 },
  東京: { x: 62, y: 60, lx: 74, ly: 60 },
  神奈川: { x: 60, y: 66, lx: 70, ly: 70 },
  千葉: { x: 66, y: 62, lx: 78, ly: 66 },
  埼玉: { x: 58, y: 58, lx: 22, ly: 56 },
  大阪: { x: 42, y: 64, lx: 2, ly: 52 },
  京都: { x: 42, y: 58, lx: 2, ly: 42 },
  兵庫: { x: 36, y: 64, lx: 2, ly: 66 },
  愛知: { x: 50, y: 62, lx: 46, ly: 80 },
  愛媛: { x: 32, y: 74, lx: 2, ly: 80 },
  福岡: { x: 22, y: 76, lx: 2, ly: 88 },
};

export function JapanMap({ regions }: { regions: RegionStat[] }) {
  const placed = regions.filter((region) => ANCHOR[region.region]).slice(0, 6);
  const extra = regions.filter((region) => !placed.includes(region));
  return (
    <div className="relative h-full min-h-[240px]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <path fill="#3c3c3c" d="M61 5c8-3 20-1 23 8 3 8-1 16-9 18-7 1-14-2-16-8-2-6-2-14 2-18z" />
        <path fill="#4a4a4a" d="M57 31c4 1 8 4 8 9 1 6-1 10 2 14 4 5 2 9-2 12-3 3-2 7-6 9-5 2-8 6-13 6-6 0-8 3-13 2-6-1-9-5-7-10 2-4 6-4 8-8 2-3 1-7 4-10 3-4 4-8 8-11 4-3 7-4 11-3z" />
        <path fill="#3f3f3f" d="M30 73c4-1 10 0 12 3 1 3-2 6-7 6-4 0-7-2-5-9z" />
        <path fill="#454545" d="M18 71c4-1 9 0 11 4 1 5-2 9-7 10-4 0-8-3-7-8 0-3 1-5 3-6z" />
        {placed.map((region) => {
          const spot = ANCHOR[region.region];
          return <line key={region.region} x1={spot.x} y1={spot.y} x2={spot.lx + 8} y2={spot.ly + 6} stroke="#ff6a00" strokeWidth="0.4" />;
        })}
        {placed.map((region) => {
          const spot = ANCHOR[region.region];
          return <circle key={`${region.region}-dot`} cx={spot.x} cy={spot.y} r="1.3" fill="#ff6a00" />;
        })}
      </svg>
      {placed.map((region) => {
        const spot = ANCHOR[region.region];
        return (
          <div key={region.region} className="absolute min-w-[108px] rounded border border-[#ff6a00] bg-[#1a120c]/95 px-2 py-1 shadow" style={{ left: `${spot.lx}%`, top: `${spot.ly}%` }}>
            <div className="text-[13px] font-bold leading-tight">{region.region}</div>
            <div className="text-[12px] font-bold text-[#ff8a33]">
              {region.attend}人 / {region.total}人 {region.rate ?? 0}%
            </div>
          </div>
        );
      })}
      {extra.length > 0 && (
        <div className="absolute bottom-1 left-2 right-2 flex flex-wrap gap-1">
          {extra.map((region) => (
            <span key={region.region} className="rounded border border-[#3a3a3a] bg-black/70 px-1.5 py-0.5 text-[11px]">
              {region.region} {region.attend}/{region.total}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
