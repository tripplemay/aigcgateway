"use client";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
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

// ============================================================
// Types (unchanged)
// ============================================================

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

const PIE_COLORS = ["#5443b9", "#5f5987", "#7c4b00", "#c8bfff", "#ffb964"];

// ============================================================
// Component
// ============================================================

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();
  interface DashboardData {
    usage: UsageSummary;
    daily: DailyData[];
    logs: LogEntry[];
    models: ModelData[];
    hourly: Array<{ hour: number; calls: number }>;
    balanceInfo: { balance: number; alertThreshold: number | null };
  }

  const { data: dashData, loading: dataLoading } = useAsyncData<DashboardData | null>(async () => {
    if (!current) return null;
    const pid = current.id;
    const [bal, u, d, l, m, h] = await Promise.all([
      apiFetch<{ balance: number; alertThreshold: number | null }>(`/api/projects/${pid}/balance`),
      apiFetch<UsageSummary>(`/api/projects/${pid}/usage?period=today`),
      apiFetch<{ data: DailyData[] }>(`/api/projects/${pid}/usage/daily?days=14`),
      apiFetch<{ data: LogEntry[] }>(`/api/projects/${pid}/logs?pageSize=5`),
      apiFetch<{ data: ModelData[] }>(`/api/projects/${pid}/usage/by-model`),
      apiFetch<{ data: Array<{ createdAt: string }> }>(`/api/projects/${pid}/logs?pageSize=100`),
    ]);
    const counts = Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 }));
    for (const log of h.data) {
      counts[new Date(log.createdAt).getHours()].calls++;
    }
    return {
      usage: u,
      daily: d.data,
      logs: l.data,
      models: m.data,
      hourly: counts,
      balanceInfo: bal,
    };
  }, [current]);

  const usage = dashData?.usage ?? null;
  const daily = dashData?.daily ?? [];
  const logs = dashData?.logs ?? [];
  const models = dashData?.models ?? [];
  const hourly = dashData?.hourly ?? [];
  const balanceInfo = dashData?.balanceInfo ?? null;

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  const totalModelCalls = models.reduce((s, x) => s + x.calls, 0);

  // ── Render — 1:1 replica of Dashboard (Full Redesign) code.html lines 160-504 ──
  return (
    <>
      {/* ═══ Low Balance Warning — code.html lines 162-168 ═══ */}
      {balanceInfo &&
        balanceInfo.alertThreshold != null &&
        balanceInfo.balance <= balanceInfo.alertThreshold && (
          <div className="mb-8 bg-ds-error-container text-ds-on-error-container px-6 py-3 rounded-2xl flex items-center justify-between border-l-4 border-ds-error">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-ds-error">warning</span>
              <p className="font-medium">
                {t("lowBalance")} {t("balanceIs")} {formatCurrency(balanceInfo.balance, 2)},{" "}
                {t("belowThreshold")} {formatCurrency(balanceInfo.alertThreshold, 2)}.
              </p>
            </div>
            <Link
              href="/balance"
              className="text-sm font-bold underline underline-offset-4 hover:opacity-80"
            >
              {t("rechargeNow")}
            </Link>
          </div>
        )}

      {/* ═══ Header Section — code.html lines 170-185 ═══ */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-ds-on-surface font-[var(--font-heading)]">
            {t("title")}
          </h2>
          <p className="text-ds-on-surface-variant font-medium mt-1">
            {t("subtitle") ?? "Real-time performance metrics"}
          </p>
        </div>
      </div>

      {/* ═══ Bento Grid: Stats & Balance — code.html lines 187-246 ═══ */}
      {usage && (
        <div className="grid grid-cols-12 gap-6 mb-8">
          {/* Summary Cards Cluster — code.html lines 189-226 */}
          <div className="col-span-12 lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Calls */}
            <div className="bg-ds-surface-container-lowest p-5 rounded-xl flex flex-col justify-between h-32 group hover:shadow-xl hover:shadow-ds-primary/5 transition-all">
              <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                {t("todayCalls")}
              </span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-extrabold font-[var(--font-heading)]">
                  {usage.totalCalls.toLocaleString()}
                </span>
              </div>
            </div>
            {/* Avg Cost */}
            <div className="bg-ds-surface-container-lowest p-5 rounded-xl flex flex-col justify-between h-32 group hover:shadow-xl hover:shadow-ds-primary/5 transition-all">
              <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                {t("todayCost")}
              </span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-extrabold font-[var(--font-heading)]">
                  {formatCurrency(usage.totalCost, 2)}
                </span>
              </div>
            </div>
            {/* Latency */}
            <div className="bg-ds-surface-container-lowest p-5 rounded-xl flex flex-col justify-between h-32 group hover:shadow-xl hover:shadow-ds-primary/5 transition-all">
              <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                {t("avgLatency")}
              </span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-extrabold font-[var(--font-heading)]">
                  {usage.avgLatencyMs?.toLocaleString()}ms
                </span>
              </div>
            </div>
            {/* Success Rate */}
            <div className="bg-ds-surface-container-lowest p-5 rounded-xl flex flex-col justify-between h-32 group hover:shadow-xl hover:shadow-ds-primary/5 transition-all">
              <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                {t("successRate")}
              </span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-extrabold font-[var(--font-heading)]">
                  {(usage.successRate * 100).toFixed(1)}%
                </span>
                <span className="text-slate-400 text-xs font-bold px-2 py-0.5 rounded-full italic">
                  {t("errorsToday", { count: usage.errorCount })}
                </span>
              </div>
            </div>
          </div>

          {/* Balance Card — code.html lines 228-245 */}
          <div className="col-span-12 lg:col-span-4 bg-gradient-to-br from-indigo-700 to-indigo-900 p-6 rounded-2xl relative overflow-hidden text-white shadow-2xl shadow-indigo-900/20">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-indigo-200 text-sm font-medium uppercase tracking-widest">
                    {tc("balance") ?? "Account Balance"}
                  </span>
                  <span className="material-symbols-outlined text-indigo-300">
                    account_balance_wallet
                  </span>
                </div>
                <h3 className="text-4xl font-extrabold mt-2">
                  {balanceInfo ? formatCurrency(balanceInfo.balance, 2) : "$0.00"}
                </h3>
              </div>
              <Link
                href="/balance"
                className="mt-4 w-full bg-white text-indigo-900 font-extrabold py-3 rounded-xl hover:bg-indigo-50 transition-colors text-center block"
              >
                {t("rechargeNow")}
              </Link>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -top-10 -left-10 w-32 h-32 bg-ds-primary-container/20 rounded-full blur-2xl" />
          </div>
        </div>
      )}

      {/* ═══ Charts Row — code.html lines 248-352 ═══ */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Area Chart: 14-day Calls — code.html lines 250-311 */}
        <div className="col-span-12 xl:col-span-8 bg-ds-surface-container-lowest p-6 rounded-2xl ">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h4 className="font-[var(--font-heading)] font-bold text-lg">{t("callsTrend")}</h4>
              <p className="text-sm text-ds-on-surface-variant">Last 14 days activity logs</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(250,248,255,0.95)",
                    backdropFilter: "blur(12px)",
                    border: "none",
                    borderRadius: 12,
                    boxShadow: "0 20px 40px rgba(19,27,46,0.06)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="calls" fill="#5443b9" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Distribution Pie — code.html lines 314-352 */}
        <div className="col-span-12 xl:col-span-4 bg-ds-surface-container-lowest p-6 rounded-2xl ">
          <h4 className="font-[var(--font-heading)] font-bold text-lg mb-6">{t("modelDist")}</h4>
          <div className="relative h-48 w-48 mx-auto flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={models}
                  dataKey="calls"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {models.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "rgba(250,248,255,0.95)",
                    backdropFilter: "blur(12px)",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="block text-2xl font-extrabold text-ds-on-surface">
                {totalModelCalls > 1000
                  ? `${(totalModelCalls / 1000).toFixed(1)}K`
                  : totalModelCalls}
              </span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Requests</span>
            </div>
          </div>
          <div className="mt-8 space-y-3">
            {models.slice(0, 5).map((m, i) => {
              const pct = totalModelCalls > 0 ? Math.round((m.calls / totalModelCalls) * 100) : 0;
              return (
                <div key={m.model} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="font-medium truncate max-w-[140px]">{m.model}</span>
                  </div>
                  <span className="font-bold text-slate-600">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ Lower Section — code.html lines 355-503 ═══ */}
      <div className="grid grid-cols-12 gap-6">
        {/* 24h Distribution & Cost — code.html lines 357-399 */}
        <div className="col-span-12 xl:col-span-4 space-y-6">
          {/* 24h Load Distribution */}
          <div className="bg-ds-surface-container-lowest p-6 rounded-2xl ">
            <h4 className="font-[var(--font-heading)] font-bold text-lg mb-4">{t("hourlyDist")}</h4>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly}>
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    interval={3}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(250,248,255,0.95)",
                      backdropFilter: "blur(12px)",
                      border: "none",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="calls" fill="#5443b9" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Spend — code.html lines 376-398 */}
          <div className="bg-ds-surface-container-lowest p-6 rounded-2xl ">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-[var(--font-heading)] font-bold text-lg">{t("costTrend")}</h4>
              <span className="text-sm font-bold text-ds-primary">
                {usage ? formatCurrency(usage.totalCost, 2) : "$0"} Total
              </span>
            </div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <XAxis dataKey="date" hide />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(250,248,255,0.95)",
                      backdropFilter: "blur(12px)",
                      border: "none",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v) => [`$${Number(v).toFixed(3)}`, "Cost"]}
                  />
                  <Bar dataKey="cost" fill="#5f5987" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Calls Table — code.html lines 401-503 */}
        <div className="col-span-12 xl:col-span-8 bg-ds-surface-container-lowest p-6 rounded-2xl ">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-[var(--font-heading)] font-bold text-lg">{t("recentCalls")}</h4>
            <Link
              href="/logs"
              className="text-sm font-bold text-ds-primary hover:underline underline-offset-4 flex items-center gap-1"
            >
              {t("viewAll")}{" "}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                  <th className="pb-4">{t("trace")}</th>
                  <th className="pb-4">{t("model")}</th>
                  <th className="pb-4 text-center">{tc("status")}</th>
                  <th className="pb-4 text-right">{t("cost")}</th>
                  <th className="pb-4 text-right">{t("latency")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr
                    key={l.traceId}
                    className="group hover:bg-ds-surface-container-high/30 transition-colors"
                  >
                    <td className="py-4 text-sm font-mono text-indigo-600">
                      {l.traceId.slice(0, 12)}
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-indigo-50 flex items-center justify-center">
                          <span className="material-symbols-outlined text-indigo-600 text-xs">
                            bolt
                          </span>
                        </div>
                        <span className="text-sm font-medium">{l.modelName}</span>
                      </div>
                    </td>
                    <td className="py-4 text-center">
                      {l.status === "SUCCESS" ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-ds-secondary-container/50 text-ds-secondary border border-ds-secondary/10">
                          200 OK
                        </span>
                      ) : l.status === "FILTERED" ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-ds-tertiary-fixed/50 text-ds-tertiary border border-ds-tertiary/10">
                          FILTERED
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-ds-error-container/50 text-ds-error border border-ds-error/10">
                          ERROR
                        </span>
                      )}
                    </td>
                    <td className="py-4 text-right text-sm font-bold">
                      {l.sellPrice != null ? `$${l.sellPrice.toFixed(3)}` : "—"}
                    </td>
                    <td className="py-4 text-right text-sm text-slate-500 font-medium">
                      {l.latencyMs != null ? `${l.latencyMs}ms` : "—"}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-ds-outline">
                      No recent calls
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
