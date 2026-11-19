"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ActivityBars({ data }: { data: { label: string; people: number; hours: number; imported: boolean }[] }) {
  return (
    <div className="h-full min-h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2a2a2a" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#c8c8c8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="people" tick={{ fill: "#ff8a33", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
          <YAxis yAxisId="hours" orientation="right" tick={{ fill: "#f2c300", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            cursor={{ fill: "rgba(255,106,0,0.08)" }}
            contentStyle={{ background: "#161616", border: "1px solid #ff6a00", borderRadius: 8, color: "#fff" }}
            formatter={(value, name) => [`${value}`, name === "people" ? "稼働人数" : "延べ人工"]}
          />
          <Legend formatter={(value) => (value === "people" ? "稼働人数" : "延べ人工")} />
          <Bar yAxisId="people" dataKey="people" fill="#ff6a00" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar yAxisId="hours" dataKey="hours" fill="#f2c300" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
