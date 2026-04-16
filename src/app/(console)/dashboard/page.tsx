"use client";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { formatCNY, timeAgo } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
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
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { PageLoader } from "@/components/page-loader";
import { KPICard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";
import { StatusChip } from "@/components/status-chip";

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
  const exchangeRate = useExchangeRate();
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
      <PageContainer data-testid="dashboard-loading">
        <PageLoader />
      </PageContainer>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  const totalModelCalls = models.reduce((s, x) => s + x.calls, 0);

  return (
    <PageContainer data-testid="dashboard-page">
      {balanceInfo &&
        balanceInfo.alertThreshold != null &&
        balanceInfo.balance <= balanceInfo.alertThreshold && (
          <div className="bg-ds-error-container text-ds-on-error-container px-6 py-3 rounded-2xl flex items-center justify-between border-l-4 border-ds-error">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-ds-error">warning</span>
              <p className="font-medium">
                {t("lowBalance")} {t("balanceIs")} {formatCNY(balanceInfo.balance, exchangeRate, 2)}
                , {t("belowThreshold")} {formatCNY(balanceInfo.alertThreshold, exchangeRate, 2)}.
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

      <PageHeader title={t("title")} subtitle={t("subtitle") ?? "Real-time performance metrics"} />

      {usage && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label={t("todayCalls")} value={usage.totalCalls.toLocaleString()} />
            <KPICard label={t("todayCost")} value={formatCNY(usage.totalCost, exchangeRate, 2)} />
            <KPICard
              label={t("avgLatency")}
              value={`${usage.avgLatencyMs?.toLocaleString() ?? 0}ms`}
            />
            <KPICard
              label={t("successRate")}
              value={`${(usage.successRate * 100).toFixed(1)}%`}
              trend={
                <span className="italic">{t("errorsToday", { count: usage.errorCount })}</span>
              }
            />
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
                  {balanceInfo ? formatCNY(balanceInfo.balance, exchangeRate, 2) : "¥0.00"}
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
        <SectionCard className="col-span-12 xl:col-span-8">
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
        </SectionCard>

        {/* Model Distribution Pie — code.html lines 314-352 */}
        <SectionCard className="col-span-12 xl:col-span-4">
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
        </SectionCard>
      </div>

      {/* ═══ Lower Section — code.html lines 355-503 ═══ */}
      <div className="grid grid-cols-12 gap-6">
        {/* 24h Distribution & Cost — code.html lines 357-399 */}
        <div className="col-span-12 xl:col-span-4 space-y-6">
          {/* 24h Load Distribution */}
          <SectionCard>
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
          </SectionCard>

          {/* Daily Spend — code.html lines 376-398 */}
          <SectionCard>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-[var(--font-heading)] font-bold text-lg">{t("costTrend")}</h4>
              <span className="text-sm font-bold text-ds-primary">
                {usage ? formatCNY(usage.totalCost, exchangeRate, 2) : "¥0"} Total
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
          </SectionCard>
        </div>

        {/* Recent Calls Table — code.html lines 401-503 */}
        <SectionCard className="col-span-12 xl:col-span-8">
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
                        <StatusChip variant="success">200 OK</StatusChip>
                      ) : l.status === "FILTERED" ? (
                        <StatusChip variant="warning">FILTERED</StatusChip>
                      ) : (
                        <StatusChip variant="error">ERROR</StatusChip>
                      )}
                    </td>
                    <td className="py-4 text-right text-sm font-bold">
                      {l.sellPrice != null ? formatCNY(l.sellPrice, exchangeRate, 3) : "—"}
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
        </SectionCard>
      </div>
    </PageContainer>
  );
}
