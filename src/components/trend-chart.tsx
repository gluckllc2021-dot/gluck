"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function TrendChart({ data }: { data: { label: string; attend: number; date: string }[] }) {
  const last = data.at(-1);
  return (
    <div className="relative h-full min-h-[220px]">
      {last && (
        <div className="absolute right-2 top-2 z-10 rounded bg-[#ff6a00] px-2 py-1 text-sm font-black text-black">{last.attend}人</div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 28, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="attendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff6a00" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#ff6a00" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fill: "#9a9a9a", fontSize: 11 }} interval={1} axisLine={false} tickLine={false} />
          <YAxis hide domain={[0, (max: number) => Math.max(4, Math.ceil(max * 1.25))]} />
          <Tooltip
            contentStyle={{ background: "#161616", border: "1px solid #ff6a00", borderRadius: 8, color: "#fff" }}
            formatter={(value) => [`${value}人`, "出勤"]}
          />
          <Area type="monotone" dataKey="attend" stroke="#ff6a00" strokeWidth={2.5} fill="url(#attendFill)" dot={{ r: 3, fill: "#ff6a00", stroke: "#1a0c00", strokeWidth: 1 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
