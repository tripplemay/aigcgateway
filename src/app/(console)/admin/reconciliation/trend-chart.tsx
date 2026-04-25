"use client";
/**
 * F-BAP2-03 30 天 delta 折线图。dynamic import 避免 SSR + 减小首屏 bundle
 * （BL-FE-PERF-01 模式）。
 */
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface TrendPoint {
  date: string;
  [providerName: string]: string | number;
}

const PROVIDER_COLORS = [
  "#10b981", // emerald
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#ef4444", // rose
  "#8b5cf6", // violet
  "#ec4899", // pink
];

export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (!points || points.length === 0) {
    return <p className="text-sm text-ds-on-surface-variant">No data yet.</p>;
  }
  // Discover unique provider keys (everything except `date`)
  const providers = new Set<string>();
  for (const p of points) {
    for (const k of Object.keys(p)) if (k !== "date") providers.add(k);
  }
  const providerList = Array.from(providers).sort();

  return (
    <ResponsiveContainer width="100%" height={288}>
      <LineChart data={points}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        {providerList.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
