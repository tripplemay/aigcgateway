"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import {
  AreaChart,
  Area,
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

const CHART_COLORS = [
  "var(--chart-brand)",
  "var(--chart-teal)",
  "var(--chart-coral)",
  "var(--chart-blue)",
  "var(--chart-amber)",
];

const customTooltipStyle = {
  contentStyle: {
    background: "#fff",
    border: "1px solid var(--border-custom)",
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
  },
  labelStyle: { fontWeight: 500, color: "var(--text-primary)" },
  itemStyle: { color: "var(--text-secondary)" },
};

const axisTickStyle = { fontSize: 11, fill: "var(--text-tertiary)" };

export default function UsagePage() {
  const t = useTranslations("usage");
  const { current, loading: projLoading } = useProject();
  const [period, setPeriod] = useState("7d");
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [daily, setDaily] = useState<Array<Record<string, unknown>>>([]);
  const [byModel, setByModel] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!current) return;
    const pid = current.id;
    const days = period === "today" ? 1 : period === "30d" ? 30 : 7;
    Promise.all([
      apiFetch<Record<string, number>>(`/api/projects/${pid}/usage?period=${period}`),
      apiFetch<{ data: Array<Record<string, unknown>> }>(
        `/api/projects/${pid}/usage/daily?days=${days}`,
      ),
      apiFetch<{ data: Array<Record<string, unknown>> }>(`/api/projects/${pid}/usage/by-model`),
    ]).then(([s, d, m]) => {
      setSummary(s);
      setDaily(d.data);
      setByModel(m.data);
    });
  }, [current, period]);

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-[20px] font-semibold text-text-primary">{t("title")}</h1>
        <div className="flex gap-1">
          {["today", "7d", "30d"].map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-[10px] mb-[18px]">
          {[
            { label: t("totalCalls"), value: (summary.totalCalls ?? 0).toLocaleString() },
            { label: t("totalCost"), value: formatCurrency(summary.totalCost ?? 0, 2) },
            { label: t("totalTokens"), value: (summary.totalTokens ?? 0).toLocaleString() },
            { label: t("avgLatency"), value: `${summary.avgLatencyMs ?? 0}ms` },
          ].map((c) => (
            <div key={c.label} className="bg-surface rounded-[10px] p-4">
              <div className="text-xs text-text-tertiary mb-1.5">{c.label}</div>
              <div className="text-2xl font-semibold tracking-tight text-text-primary">
                {c.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-[14px]">
        <div className="bg-white border border-border-custom rounded-xl px-[18px] py-4">
          <div className="text-[13px] font-semibold text-text-primary mb-[14px]">
            {t("dailyCalls")}
          </div>
          <div className="h-[175px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}>
                <XAxis dataKey="date" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} />
                <Tooltip {...customTooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="calls"
                  stroke="var(--chart-brand)"
                  strokeWidth={2}
                  fill="var(--chart-brand)"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white border border-border-custom rounded-xl px-[18px] py-4">
          <div className="text-[13px] font-semibold text-text-primary mb-[14px]">
            {t("dailyCost")}
          </div>
          <div className="h-[175px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <XAxis dataKey="date" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis
                  tick={axisTickStyle}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip {...customTooltipStyle} />
                <Bar dataKey="cost" fill="var(--chart-teal)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-border-custom rounded-xl px-[18px] py-4">
          <div className="text-[13px] font-semibold text-text-primary mb-[14px]">
            {t("byModel")}
          </div>
          <div className="flex items-center gap-4">
            <div className="h-[130px] w-[130px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byModel}
                    dataKey="calls"
                    nameKey="model"
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={55}
                    strokeWidth={2}
                    stroke="#fff"
                  >
                    {byModel.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...customTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1">
              {byModel.map((m, i) => {
                const total = byModel.reduce((s, x) => s + (x.calls as number), 0);
                const pct = total > 0 ? Math.round(((m.calls as number) / total) * 100) : 0;
                return (
                  <div key={m.model as string} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="flex-1 text-text-secondary truncate">{m.model as string}</span>
                    <span className="font-semibold text-text-primary min-w-[32px] text-right">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="bg-white border border-border-custom rounded-xl px-[18px] py-4">
          <div className="text-[13px] font-semibold text-text-primary mb-[14px]">
            {t("modelRanking")}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>{t("calls")}</TableHead>
                <TableHead>{t("tokens")}</TableHead>
                <TableHead>{t("cost")}</TableHead>
                <TableHead>{t("avgLatency")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byModel.map((m) => (
                <TableRow key={m.model as string}>
                  <TableCell className="text-xs font-mono">{m.model as string}</TableCell>
                  <TableCell>{(m.calls as number).toLocaleString()}</TableCell>
                  <TableCell>{(m.tokens as number).toLocaleString()}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(m.cost as number, 4)}</TableCell>
                  <TableCell className="font-mono text-text-tertiary">
                    {m.avgLatency as number}ms
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
