"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, timeAgo } from "@/lib/utils";
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
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface UsageSummary {
  totalCalls: number;
  totalCost: number;
  avgLatencyMs: number;
  avgTtftMs: number;
  successRate: number;
  errorCount: number;
}
interface DailyData {
  date: string;
  calls: number;
  cost: number;
}
interface LogEntry {
  traceId: string;
  modelName: string;
  status: string;
  sellPrice: number | null;
  latencyMs: number | null;
  createdAt: string;
  promptPreview: string;
}
interface ModelData {
  model: string;
  calls: number;
  cost: number;
}

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

export default function DashboardPage() {
  const { current, loading: projLoading } = useProject();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);
  const [hourly, setHourly] = useState<Array<{ hour: number; calls: number }>>([]);
  const [balanceInfo, setBalanceInfo] = useState<{
    balance: number;
    alertThreshold: number | null;
  } | null>(null);

  useEffect(() => {
    if (!current) return;
    const pid = current.id;
    // Fetch balance for low-balance warning
    apiFetch<{ balance: number; alertThreshold: number | null }>(`/api/projects/${pid}/balance`)
      .then(setBalanceInfo)
      .catch(() => {});
    Promise.all([
      apiFetch<UsageSummary>(`/api/projects/${pid}/usage?period=today`),
      apiFetch<{ data: DailyData[] }>(`/api/projects/${pid}/usage/daily?days=14`),
      apiFetch<{ data: LogEntry[] }>(`/api/projects/${pid}/logs?pageSize=5`),
      apiFetch<{ data: ModelData[] }>(`/api/projects/${pid}/usage/by-model`),
    ]).then(([u, d, l, m]) => {
      setUsage(u);
      setDaily(d.data);
      setLogs(l.data);
      setModels(m.data);
      // Compute hourly distribution from recent logs (fetch more for this)
      apiFetch<{ data: Array<{ createdAt: string }> }>(
        `/api/projects/${pid}/logs?pageSize=100`,
      ).then((r) => {
        const counts = Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 }));
        for (const log of r.data) {
          counts[new Date(log.createdAt).getHours()].calls++;
        }
        setHourly(counts);
      });
    });
  }, [current]);

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
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {balanceInfo &&
        balanceInfo.alertThreshold != null &&
        balanceInfo.balance <= balanceInfo.alertThreshold && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            <strong>Low Balance Warning:</strong> Your balance is{" "}
            {formatCurrency(balanceInfo.balance, 2)}, below the alert threshold of{" "}
            {formatCurrency(balanceInfo.alertThreshold, 2)}.{" "}
            <Link href="/balance" className="underline font-medium">
              Recharge now
            </Link>
          </div>
        )}

      {usage && (
        <div className="grid grid-cols-4 gap-[10px] mb-[18px]">
          {[
            {
              label: "Today's calls",
              value: usage.totalCalls.toLocaleString(),
              sub: "vs yesterday",
              trend: null as { value: string; up: boolean } | null,
            },
            {
              label: "Today's cost",
              value: formatCurrency(usage.totalCost, 2),
              sub: "vs yesterday",
              trend: null as { value: string; up: boolean } | null,
            },
            {
              label: "Avg latency",
              value: `${usage.avgLatencyMs}ms`,
              sub: `TTFT ${usage.avgTtftMs ?? 0}ms`,
              trend: null,
            },
            {
              label: "Success rate",
              value: `${(usage.successRate * 100).toFixed(1)}%`,
              sub: `${usage.errorCount} errors today`,
              trend: null,
            },
          ].map((c) => (
            <div key={c.label} className="bg-surface rounded-[10px] p-4">
              <div className="text-xs text-text-tertiary mb-1.5">{c.label}</div>
              <div className="text-2xl font-semibold tracking-tight text-text-primary">
                {c.value}
              </div>
              <div className="text-[11px] text-text-tertiary mt-1">
                {c.sub}
                {c.trend && (
                  <span
                    className={`inline-block ml-1 px-[7px] py-px rounded text-[11px] font-medium ${c.trend.up ? "bg-success-bg text-success-text" : "bg-error-bg text-error-text"}`}
                  >
                    {c.trend.value}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-[14px]">
        <div className="bg-white border border-border-custom rounded-xl px-[18px] py-4">
          <div className="text-[13px] font-semibold text-text-primary mb-[14px]">
            Calls trend (14 days)
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
            Cost trend (14 days)
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
                <Bar
                  dataKey="cost"
                  fill="var(--chart-teal)"
                  radius={[3, 3, 0, 0]}
                  barSize={undefined}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-[14px]">
        <div className="bg-white border border-border-custom rounded-xl px-[18px] py-4">
          <div className="text-[13px] font-semibold text-text-primary mb-[14px]">
            Hourly distribution
          </div>
          <div className="h-[155px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly}>
                <XAxis dataKey="hour" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} />
                <Tooltip {...customTooltipStyle} />
                <Bar dataKey="calls" fill="var(--chart-brand)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white border border-border-custom rounded-xl px-[18px] py-4">
          <div className="text-[13px] font-semibold text-text-primary mb-[14px]">
            Model distribution
          </div>
          <div className="flex items-center gap-4">
            <div className="h-[130px] w-[130px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={models}
                    dataKey="calls"
                    nameKey="model"
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={55}
                    strokeWidth={2}
                    stroke="#fff"
                  >
                    {models.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...customTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1">
              {models.map((m, i) => {
                const total = models.reduce((s, x) => s + x.calls, 0);
                const pct = total > 0 ? Math.round((m.calls / total) * 100) : 0;
                return (
                  <div key={m.model} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="flex-1 text-text-secondary truncate">{m.model}</span>
                    <span className="font-semibold text-text-primary min-w-[32px] text-right">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-border-custom rounded-xl px-[18px] py-4">
        <div className="text-[13px] font-semibold text-text-primary mb-[14px] flex justify-between items-center">
          Recent calls
          <Link href="/logs" className="text-xs font-normal text-chart-blue cursor-pointer">
            View all
          </Link>
        </div>
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Trace</TableHead>
                <TableHead className="w-[120px]">Model</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead className="w-[70px]">Cost</TableHead>
                <TableHead className="w-[70px]">Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.traceId}>
                  <TableCell className="font-mono text-[11px] text-chart-blue">
                    {l.traceId.slice(0, 12)}
                  </TableCell>
                  <TableCell className="font-medium text-xs text-text-primary">
                    {l.modelName}
                  </TableCell>
                  <TableCell
                    className="text-xs text-text-secondary truncate max-w-[180px]"
                    title={l.promptPreview}
                  >
                    {l.promptPreview || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        l.status === "SUCCESS"
                          ? "success"
                          : l.status === "FILTERED"
                            ? "warning"
                            : "error"
                      }
                    >
                      {l.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">
                    {l.sellPrice != null ? `$${l.sellPrice.toFixed(3)}` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-tertiary">
                    {l.latencyMs != null ? `${(l.latencyMs / 1000).toFixed(1)}s` : "—"}
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
