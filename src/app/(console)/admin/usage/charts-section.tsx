"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { PIE_COLORS } from "./charts-constants";

const tooltipContentStyle = {
  background: "rgba(250,248,255,0.95)",
  backdropFilter: "blur(12px)",
  border: "none",
  borderRadius: 12,
  fontSize: 12,
} as const;

export function ProviderRevenuePieChart({
  data,
  formatValue,
}: {
  data: Array<{ provider: string; revenue: number }>;
  formatValue: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="revenue"
          nameKey="provider"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          strokeWidth={2}
          stroke="#fff"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipContentStyle} formatter={(v) => formatValue(Number(v))} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ModelCallsBarChart({ data }: { data: Array<{ model: string; calls: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical">
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "#787584" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="model"
          width={140}
          tick={{ fontSize: 10, fill: "#787584" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={tooltipContentStyle} />
        <Bar dataKey="calls" fill="#5443b9" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
