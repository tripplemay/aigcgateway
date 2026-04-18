"use client";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { PIE_COLORS } from "./charts-constants";

const tooltipContentStyle = {
  background: "rgba(250,248,255,0.95)",
  backdropFilter: "blur(12px)",
  border: "none",
  borderRadius: 12,
  boxShadow: "0 20px 40px rgba(19,27,46,0.06)",
  fontSize: 12,
} as const;

export function DailyPerformanceBarChart({
  data,
}: {
  data: Array<{ date: string; calls: number; cost: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#787584" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: "#787584" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipContentStyle} />
        <Bar dataKey="calls" fill="#6d5dd3" opacity={0.2} radius={[4, 4, 0, 0]} />
        <Bar dataKey="cost" fill="#5443b9" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ModelPieChart({ data }: { data: Array<{ model: string; calls: number }> }) {
  return (
    <ResponsiveContainer width={192} height={192}>
      <PieChart>
        <Pie
          data={data}
          dataKey="calls"
          nameKey="model"
          cx="50%"
          cy="50%"
          innerRadius={56}
          outerRadius={80}
          strokeWidth={2}
          stroke="#fff"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipContentStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
