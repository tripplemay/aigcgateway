"use client";
import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCNY } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { TableCard } from "@/components/table-card";
import { KPICard } from "@/components/kpi-card";
import { PIE_COLORS } from "./charts-constants";

const ProviderRevenuePieChart = dynamic(
  () => import("./charts-section").then((m) => m.ProviderRevenuePieChart),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);
const ModelCallsBarChart = dynamic(
  () => import("./charts-section").then((m) => m.ModelCallsBarChart),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

// ============================================================
// Types
// ============================================================

interface UsageSummary {
  totalCalls: number;
  totalRevenue: number;
  totalCost: number;
  margin: number;
}
interface ProviderData {
  provider: string;
  calls: number;
  cost: number;
  revenue: number;
  margin: number;
  marginPercent: number;
}
interface ModelData {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
  revenue: number;
  avgLatency: number;
}

// ============================================================
// Constants
// ============================================================

// ============================================================
// Page
// ============================================================

export default function AdminUsagePage() {
  const t = useTranslations("adminUsage");
  const exchangeRate = useExchangeRate();
  const [period, setPeriod] = useState("7d");

  const { data: summary } = useAsyncData<UsageSummary>(
    () => apiFetch<UsageSummary>(`/api/admin/usage?period=${period}`),
    [period],
  );

  const { data: providerResp } = useAsyncData<{ data: ProviderData[] }>(
    () => apiFetch<{ data: ProviderData[] }>("/api/admin/usage/by-provider"),
    [],
  );

  const { data: modelResp } = useAsyncData<{ data: ModelData[] }>(
    () => apiFetch<{ data: ModelData[] }>("/api/admin/usage/by-model"),
    [],
  );

  const byProvider = providerResp?.data ?? [];
  const byModel = modelResp?.data ?? [];

  const marginPct =
    summary && summary.totalRevenue > 0
      ? ((summary.margin / summary.totalRevenue) * 100).toFixed(1)
      : "0";

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        actions={
          <div className="bg-ds-surface-container-low p-1 rounded-full flex gap-1">
            {(["today", "7d", "30d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${period === p ? "bg-white text-ds-primary shadow-sm" : "text-ds-on-surface-variant hover:text-ds-primary"}`}
              >
                {t(`period_${p}`)}
              </button>
            ))}
          </div>
        }
      />

      {/* ═══ Summary Cards ═══ */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: t("totalCalls"), value: summary.totalCalls.toLocaleString(), icon: "call" },
            {
              label: t("revenue"),
              value: formatCNY(summary.totalRevenue, exchangeRate, 2),
              icon: "trending_up",
            },
            {
              label: t("cost"),
              value: formatCNY(summary.totalCost, exchangeRate, 2),
              icon: "payments",
            },
            {
              label: t("margin"),
              value: `${formatCNY(summary.margin, exchangeRate, 2)} (${marginPct}%)`,
              icon: "savings",
            },
          ].map((c) => (
            <KPICard key={c.label} label={c.label} value={c.value} />
          ))}
        </div>
      )}

      {/* ═══ Charts ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Provider Pie */}
        <SectionCard>
          <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
            {t("revenueByProvider")}
          </h4>
          <div className="h-[250px]">
            <ProviderRevenuePieChart
              data={byProvider}
              formatValue={(v) => formatCNY(v, exchangeRate, 2)}
            />
          </div>
          <div className="mt-4 space-y-2">
            {byProvider.map((p, i) => (
              <div key={p.provider} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="font-medium">{p.provider}</span>
                </div>
                <span className="font-bold">{formatCNY(p.revenue, exchangeRate, 2)}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Calls by Model Bar */}
        <SectionCard>
          <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
            {t("callsByModel")}
          </h4>
          <div className="h-[300px]">
            <ModelCallsBarChart data={byModel.slice(0, 8)} />
          </div>
        </SectionCard>
      </div>

      {/* ═══ Provider Cost Table ═══ */}
      <TableCard title={t("providerCost")}>
        <table className="w-full text-left">
          <thead className="bg-ds-surface-container-low/50">
            <tr>
              {[
                t("colProvider"),
                t("colCalls"),
                t("colCost"),
                t("colRevenue"),
                t("colMargin"),
                t("colMarginPct"),
              ].map((h) => (
                <th
                  key={h}
                  className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {byProvider.map((p) => (
              <tr key={p.provider} className="hover:bg-ds-surface-container-low transition-colors">
                <td className="px-6 py-4 text-sm font-bold">{p.provider}</td>
                <td className="px-6 py-4 text-sm">{p.calls.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm font-mono">
                  {formatCNY(p.cost, exchangeRate, 4)}
                </td>
                <td className="px-6 py-4 text-sm font-mono">
                  {formatCNY(p.revenue, exchangeRate, 4)}
                </td>
                <td className="px-6 py-4 text-sm font-mono font-bold text-ds-primary">
                  {formatCNY(p.margin, exchangeRate, 4)}
                </td>
                <td className="px-6 py-4 text-sm font-bold">{p.marginPercent.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </PageContainer>
  );
}
