"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { formatCurrency } from "@/lib/utils";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

// ============================================================
// Types & constants
// ============================================================

const PIE_COLORS = ["#6d5dd3", "#5f5987", "#ffb964", "#c8bfff", "#7c4b00"];
const PERIODS = ["today", "7d", "30d"] as const;

const tooltipStyle = {
  contentStyle: {
    background: "rgba(250,248,255,0.95)",
    backdropFilter: "blur(12px)",
    border: "none",
    borderRadius: 12,
    boxShadow: "0 20px 40px rgba(19,27,46,0.06)",
    fontSize: 12,
  },
};

// ============================================================
// Component
// ============================================================

export default function UsagePage() {
  const t = useTranslations("usage");
  const { current, loading: projLoading } = useProject();
  const [period, setPeriod] = useState<string>("7d");
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [prevSummary, setPrevSummary] = useState<Record<string, number> | null>(null);
  const [daily, setDaily] = useState<Array<Record<string, unknown>>>([]);
  const [byModel, setByModel] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!current) return;
    const pid = current.id;
    const days = period === "today" ? 1 : period === "30d" ? 30 : 7;
    // 当期 + 上期双请求（决策 C：前端计算环比）
    const prevPeriod = period === "today" ? "today" : period;
    const prevDays = days;
    Promise.all([
      apiFetch<Record<string, number>>(`/api/projects/${pid}/usage?period=${period}`),
      apiFetch<Record<string, number>>(
        `/api/projects/${pid}/usage?period=${prevPeriod}&offset=${prevDays}`,
      ).catch(() => null),
      apiFetch<{ data: Array<Record<string, unknown>> }>(
        `/api/projects/${pid}/usage/daily?days=${days}`,
      ),
      apiFetch<{ data: Array<Record<string, unknown>> }>(`/api/projects/${pid}/usage/by-model`),
    ]).then(([s, ps, d, m]) => {
      setSummary(s);
      setPrevSummary(ps);
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

  const totalModelCalls = byModel.reduce((s, x) => s + ((x.calls as number) ?? 0), 0);

  /** 计算环比趋势 */
  const trend = (key: string, invert = false) => {
    if (!summary || !prevSummary) return null;
    const curr = summary[key] ?? 0;
    const prev = prevSummary[key] ?? 0;
    if (prev === 0) return null;
    const pct = ((curr - prev) / prev) * 100;
    const isUp = invert ? pct < 0 : pct > 0;
    return { pct: Math.abs(pct).toFixed(1), isUp, isPositive: isUp };
  };

  // ── Render — 1:1 replica of Usage Analytics code.html lines 154-374 ──
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Header + Period Selector — code.html lines 156-165 ═══ */}
      <section className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-extrabold font-[var(--font-heading)] text-ds-on-surface tracking-tight">
            {t("title")}
          </h3>
          <p className="text-ds-on-surface-variant text-sm">
            Review your model consumption and performance metrics.
          </p>
        </div>
        <div className="bg-ds-surface-container-low p-1 rounded-full flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${
                period === p
                  ? "bg-white text-ds-primary shadow-sm"
                  : "text-ds-on-surface-variant hover:text-ds-primary"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </section>

      {/* ═══ Stats Cards — code.html lines 167-212 ═══ */}
      {summary && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              label: t("totalCalls"),
              value: (summary.totalCalls ?? 0).toLocaleString(),
              icon: "call",
              trendData: trend("totalCalls"),
            },
            {
              label: t("totalCost"),
              value: formatCurrency(summary.totalCost ?? 0, 2),
              icon: "payments",
              trendData: trend("totalCost"),
            },
            {
              label: t("totalTokens"),
              value: (summary.totalTokens ?? 0).toLocaleString(),
              icon: "generating_tokens",
              trendData: null,
            },
            {
              label: t("avgLatency"),
              value: `${summary.avgLatencyMs ?? 0}ms`,
              icon: "speed",
              trendData: trend("avgLatencyMs", true),
            },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-ds-surface-container-lowest p-6 rounded-xl shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-ds-outline uppercase tracking-widest">
                  {card.label}
                </span>
                <span className="material-symbols-outlined text-ds-primary-container text-lg">
                  {card.icon}
                </span>
              </div>
              <div className="text-3xl font-black font-[var(--font-heading)] text-ds-on-surface">
                {card.value}
              </div>
              {card.trendData ? (
                <div
                  className={`mt-2 text-[10px] font-bold flex items-center gap-1 ${card.trendData.isPositive ? "text-green-600" : "text-red-600"}`}
                >
                  <span className="material-symbols-outlined text-[12px]">
                    {card.trendData.isPositive ? "trending_up" : "trending_down"}
                  </span>
                  {card.trendData.isPositive ? "+" : "-"}
                  {card.trendData.pct}% vs last period
                </div>
              ) : summary && (summary.totalCalls ?? 0) > 0 ? (
                <div className="mt-2 text-[10px] font-bold text-ds-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">horizontal_rule</span>
                  Stable activity
                </div>
              ) : (
                <div className="mt-2 text-[10px] font-bold text-slate-400">—</div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ═══ Charts Row — code.html lines 213-306 ═══ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Performance Chart — code.html lines 214-268 */}
        <div className="lg:col-span-2 bg-ds-surface-container-lowest p-8 rounded-xl shadow-sm space-y-8">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
              Daily Performance
            </h4>
            <p className="text-lg font-extrabold font-[var(--font-heading)]">
              {t("dailyCalls")} & {t("dailyCost")}
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#787584" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: "#787584" }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="calls" fill="#6d5dd3" opacity={0.2} radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" fill="#5443b9" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-8 pt-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-ds-primary/20" />
              <span className="text-xs font-bold text-ds-on-surface">{t("dailyCalls")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-ds-primary" />
              <span className="text-xs font-bold text-ds-on-surface">{t("dailyCost")}</span>
            </div>
          </div>
        </div>

        {/* Model Distribution — code.html lines 269-305 */}
        <div className="bg-ds-surface-container-lowest p-8 rounded-xl shadow-sm flex flex-col">
          <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
            Workload
          </h4>
          <p className="text-lg font-extrabold font-[var(--font-heading)] mb-8">{t("byModel")}</p>
          <div className="relative flex-1 flex items-center justify-center min-h-[200px]">
            <ResponsiveContainer width={192} height={192}>
              <PieChart>
                <Pie
                  data={byModel}
                  dataKey="calls"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={80}
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {byModel.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <div className="text-2xl font-black font-[var(--font-heading)]">
                {totalModelCalls > 0 ? "100%" : "—"}
              </div>
              <div className="text-[10px] font-bold text-ds-outline uppercase">
                {totalModelCalls > 0 ? "Utilized" : "No data"}
              </div>
            </div>
          </div>
          <div className="mt-8 space-y-3">
            {byModel.slice(0, 5).map((m, i) => {
              const pct =
                totalModelCalls > 0 ? Math.round(((m.calls as number) / totalModelCalls) * 100) : 0;
              return (
                <div key={m.model as string} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-xs font-medium">{m.model as string}</span>
                  </div>
                  <span className="text-xs font-bold">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Model Ranking Table — code.html lines 307-372 ═══ */}
      <section className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="p-8 pb-4">
          <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
            Leaderboard
          </h4>
          <p className="text-lg font-extrabold font-[var(--font-heading)]">{t("modelRanking")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-ds-surface-container-low">
                <th className="px-8 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest">
                  Model
                </th>
                <th className="px-8 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest">
                  {t("calls")}
                </th>
                <th className="px-8 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest">
                  {t("tokens")}
                </th>
                <th className="px-8 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest">
                  {t("cost")}
                </th>
                <th className="px-8 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest">
                  {t("avgLatency")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-surface-container-low">
              {byModel.map((m, i) => (
                <tr
                  key={m.model as string}
                  className="hover:bg-ds-surface-container-high/30 transition-colors"
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{
                          background: `${PIE_COLORS[i % PIE_COLORS.length]}15`,
                          color: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      >
                        <span
                          className="material-symbols-outlined text-lg"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          auto_awesome
                        </span>
                      </div>
                      <span className="text-sm font-bold">{m.model as string}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-medium">
                    {((m.calls as number) ?? 0).toLocaleString()}
                  </td>
                  <td className="px-8 py-5 text-sm font-medium">
                    {((m.tokens as number) ?? 0).toLocaleString()}
                  </td>
                  <td className="px-8 py-5 text-sm font-bold text-ds-primary">
                    {formatCurrency((m.cost as number) ?? 0, 2)}
                  </td>
                  <td className="px-8 py-5 text-sm font-medium">
                    {(m.avgLatency as number) ?? 0}ms
                  </td>
                </tr>
              ))}
              {byModel.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-ds-outline">
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
