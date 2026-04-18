"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { formatCNY } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { PageLoader } from "@/components/page-loader";
import { KPICard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";
import { TableCard } from "@/components/table-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { PIE_COLORS } from "./charts-constants";

const DailyPerformanceBarChart = dynamic(
  () => import("./charts-section").then((m) => m.DailyPerformanceBarChart),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);
const ModelPieChart = dynamic(() => import("./charts-section").then((m) => m.ModelPieChart), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-48 rounded-full" />,
});

// ============================================================
// Types & constants
// ============================================================

interface UsageSummary {
  totalCalls: number;
  totalCost: number;
  totalTokens: number;
  avgLatencyMs: number;
  successRate?: number;
  errorCount?: number;
}

interface DailyRow {
  date: string;
  calls: number;
  cost: number;
}

interface ModelRow {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
  avgLatency: number;
}

const PERIODS = ["today", "7d", "30d"] as const;
const PERIOD_I18N: Record<string, string> = {
  today: "periodToday",
  "7d": "period7d",
  "30d": "period30d",
};

// ============================================================
// Component
// ============================================================

export default function UsagePage() {
  const t = useTranslations("usage");
  const { current, loading: projLoading } = useProject();
  const exchangeRate = useExchangeRate();
  const [period, setPeriod] = useState<string>("7d");

  const days = period === "today" ? 1 : period === "30d" ? 30 : 7;

  // ── Data: usage summary ──
  const { data: summary } = useAsyncData<UsageSummary>(async () => {
    if (!current) return null as unknown as UsageSummary;
    return apiFetch<UsageSummary>(`/api/projects/${current.id}/usage?period=${period}`);
  }, [current, period]);

  // ── Data: daily trend ──
  const { data: dailyData } = useAsyncData<{ data: DailyRow[] }>(async () => {
    if (!current) return { data: [] };
    return apiFetch<{ data: DailyRow[] }>(`/api/projects/${current.id}/usage/daily?days=${days}`);
  }, [current, days]);

  // ── Data: model distribution ──
  const { data: modelData } = useAsyncData<{ data: ModelRow[] }>(async () => {
    if (!current) return { data: [] };
    return apiFetch<{ data: ModelRow[] }>(`/api/projects/${current.id}/usage/by-model`);
  }, [current]);

  const daily = dailyData?.data ?? [];
  const byModel = modelData?.data ?? [];
  const totalModelCalls = byModel.reduce((s, x) => s + (x.calls ?? 0), 0);

  if (projLoading)
    return (
      <PageContainer data-testid="usage-loading">
        <PageLoader />
      </PageContainer>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  return (
    <PageContainer data-testid="usage-page">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
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
                {t(PERIOD_I18N[p])}
              </button>
            ))}
          </div>
        }
      />

      {summary && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard label={t("totalCalls")} value={(summary.totalCalls ?? 0).toLocaleString()} />
          <KPICard
            label={t("totalCost")}
            value={formatCNY(summary.totalCost ?? 0, exchangeRate, 2)}
          />
          <KPICard label={t("totalTokens")} value={(summary.totalTokens ?? 0).toLocaleString()} />
          <KPICard
            label={t("avgLatency")}
            value={`${(summary.avgLatencyMs ?? 0).toLocaleString()}ms`}
          />
        </section>
      )}

      {/* ═══ Charts Row — code.html lines 213-306 ═══ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Performance Chart — code.html lines 214-268 */}
        <SectionCard className="lg:col-span-2 [&>div]:space-y-8">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
              {t("dailyPerformance")}
            </h4>
            <p className="text-lg font-extrabold font-[var(--font-heading)]">
              {t("dailyCalls")} & {t("dailyCost")}
            </p>
          </div>
          <div className="h-64">
            <DailyPerformanceBarChart data={daily} />
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
        </SectionCard>

        {/* Model Distribution — code.html lines 269-305 */}
        <SectionCard className="[&>div]:flex [&>div]:flex-col [&>div]:h-full">
          <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
            {t("workload")}
          </h4>
          <p className="text-lg font-extrabold font-[var(--font-heading)] mb-8">{t("byModel")}</p>
          <div className="relative flex-1 flex items-center justify-center min-h-[200px]">
            <ModelPieChart data={byModel} />
            <div className="absolute text-center">
              <div className="text-2xl font-black font-[var(--font-heading)]">
                {totalModelCalls > 0 ? "100%" : "\u2014"}
              </div>
              <div className="text-[10px] font-bold text-ds-outline uppercase">
                {totalModelCalls > 0 ? t("utilized") : t("noData")}
              </div>
            </div>
          </div>
          <div className="mt-8 space-y-3">
            {byModel.slice(0, 5).map((m, i) => {
              const pct = totalModelCalls > 0 ? Math.round((m.calls / totalModelCalls) * 100) : 0;
              return (
                <div key={m.model} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-xs font-medium">{m.model}</span>
                  </div>
                  <span className="text-xs font-bold">{pct}%</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </section>

      {/* ═══ Model Ranking Table — code.html lines 307-372 ═══ */}
      <TableCard>
        <div className="p-8 pb-4">
          <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
            {t("leaderboard")}
          </h4>
          <p className="text-lg font-extrabold font-[var(--font-heading)]">{t("modelRanking")}</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-8 py-4">{t("model")}</TableHead>
              <TableHead className="px-8 py-4">{t("calls")}</TableHead>
              <TableHead className="px-8 py-4">{t("tokens")}</TableHead>
              <TableHead className="px-8 py-4">{t("cost")}</TableHead>
              <TableHead className="px-8 py-4">{t("avgLatency")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-ds-outline-variant/10">
            {byModel.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-8 py-12 text-center text-ds-outline">
                  {t("noData")}
                </TableCell>
              </TableRow>
            ) : (
              byModel.map((m, i) => (
                <TableRow key={m.model}>
                  <TableCell className="px-8 py-5">
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
                      <span className="text-sm font-bold">{m.model}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-8 py-5 text-sm font-medium">
                    {(m.calls ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="px-8 py-5 text-sm font-medium">
                    {(m.tokens ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="px-8 py-5 text-sm font-bold text-ds-primary">
                    {formatCNY(m.cost ?? 0, exchangeRate, 2)}
                  </TableCell>
                  <TableCell className="px-8 py-5 text-sm font-medium">
                    {m.avgLatency ?? 0}ms
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
    </PageContainer>
  );
}
