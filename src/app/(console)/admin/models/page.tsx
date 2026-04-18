"use client";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { toast } from "sonner";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { formatCNY } from "@/lib/utils";
import { ChannelTable, type ChannelRowData } from "@/components/admin/channel-table";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { TableCard } from "@/components/table-card";
import { Button } from "@/components/ui/button";

// ============================================================
// Types
// ============================================================

interface ChannelEntry {
  id: string;
  realModelId: string;
  priority: number;
  costPrice: Record<string, unknown>;
  status: "ACTIVE" | "DEGRADED" | "DISABLED";
  latencyMs: number | null;
  successRate: number | null;
  totalCalls: number;
}

interface ModelEntry {
  id: string;
  name: string;
  displayName: string;
  modality: string;
  contextWindow: number | null;
  healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown";
  channels: ChannelEntry[];
}

interface ProviderGroup {
  id: string;
  name: string;
  displayName: string;
  summary: {
    modelCount: number;
    activeChannels: number;
    degradedChannels: number;
    disabledChannels: number;
  };
  models: ModelEntry[];
}

// ============================================================
// Helpers
// ============================================================

const MATRIX_PER_PAGE = 4;
const MODELS_PER_PAGE = 20;

function fmtCostPrice(p: Record<string, unknown> | null, rate: number, freeLabel: string) {
  if (!p) return "\u2014";
  if (p.unit === "call") {
    const v = Number(p.perCall ?? 0);
    return v === 0 ? freeLabel : `${formatCNY(v, rate, 2)}/call`;
  }
  const inp = Number(p.inputPer1M ?? 0);
  const out = Number(p.outputPer1M ?? 0);
  return inp === 0 && out === 0
    ? freeLabel
    : `${formatCNY(inp, rate, 2)} / ${formatCNY(out, rate, 2)}`;
}

// ============================================================
// Component
// ============================================================

export default function ModelsChannelsPage() {
  const t = useTranslations("adminModels");
  const tc = useTranslations("common");
  const exchangeRate = useExchangeRate();

  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    summary: {
      totalNewChannels: number;
      totalDisabledChannels: number;
      totalFailedProviders: number;
      totalWarningProviders: number;
    };
    providers: Array<{ providerName: string; success: boolean; warning?: string; error?: string }>;
  } | null>(null);

  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [showAllModels, setShowAllModels] = useState<Set<string>>(new Set());
  const [matrixPage, setMatrixPage] = useState(0);

  // ── Data loading via useAsyncData ──
  const { data: channelData, refetch: load } = useAsyncData<{ data: ProviderGroup[] }>(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const q = params.toString() ? `?${params}` : "";
    return apiFetch<{ data: ProviderGroup[] }>(`/api/admin/models-channels${q}`);
  }, [search]);

  const data = channelData?.data ?? [];
  const loading = !channelData && search === "";

  const { data: syncData, refetch: loadSyncStatus } = useAsyncData<{
    data: { lastSyncTime: string | null; lastSyncResultDetail: typeof lastSyncResult };
  }>(async () => {
    return apiFetch<{
      data: { lastSyncTime: string | null; lastSyncResultDetail: typeof lastSyncResult };
    }>("/api/admin/sync-status");
  }, []);

  const lastSyncTime = syncData?.data.lastSyncTime ?? null;

  // ── Aggregated stats ──
  const stats = useMemo(() => {
    let totalChannels = 0,
      activeChannels = 0,
      degradedCount = 0;
    let totalSuccess = 0,
      totalCalls = 0;
    data.forEach((prov) => {
      totalChannels +=
        prov.summary.activeChannels + prov.summary.degradedChannels + prov.summary.disabledChannels;
      activeChannels += prov.summary.activeChannels;
      degradedCount += prov.summary.degradedChannels;
      prov.models.forEach((m) =>
        m.channels.forEach((ch) => {
          if (ch.successRate !== null && ch.totalCalls > 0) {
            totalSuccess += ch.successRate * ch.totalCalls;
            totalCalls += ch.totalCalls;
          }
        }),
      );
    });
    const efficiency = totalCalls > 0 ? (totalSuccess / totalCalls).toFixed(1) : "\u2014";
    return { efficiency, activeChannels, totalChannels, degradedCount };
  }, [data]);

  // ── Flat matrix ──
  const matrixRows = useMemo(() => {
    const rows: Array<{ providerName: string; modelName: string; channel: ChannelEntry }> = [];
    data.forEach((prov) =>
      prov.models.forEach((m) =>
        m.channels.forEach((ch) => {
          rows.push({ providerName: prov.displayName, modelName: m.name, channel: ch });
        }),
      ),
    );
    return rows;
  }, [data]);

  const matrixTotal = matrixRows.length;
  const matrixPageCount = Math.max(1, Math.ceil(matrixTotal / MATRIX_PER_PAGE));
  const matrixSlice = matrixRows.slice(
    matrixPage * MATRIX_PER_PAGE,
    (matrixPage + 1) * MATRIX_PER_PAGE,
  );

  // ── Actions ──
  const handleSync = async () => {
    setSyncing(true);
    try {
      await apiFetch("/api/admin/sync-models", { method: "POST" });
      toast.success(t("syncSuccess"));
      await load();
      await loadSyncStatus();
    } catch (e) {
      toast.error(`${t("syncFailed")}: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  // ── Render ──
  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("pageDescription")} />

      {/* Stats Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <SectionCard className="relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-ds-primary/5 rounded-full blur-2xl group-hover:bg-ds-primary/10 transition-colors" />
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-ds-primary/10 rounded-2xl flex items-center justify-center text-ds-primary">
              <span className="material-symbols-outlined text-3xl">route</span>
            </div>
            <span className="font-[var(--font-heading)] font-bold text-ds-on-surface-variant uppercase tracking-widest text-[10px]">
              {t("routingEfficiency")}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-[var(--font-heading)] text-4xl font-extrabold text-ds-on-surface">
              {stats.efficiency}%
            </span>
          </div>
        </SectionCard>
        <SectionCard className="relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-ds-secondary/5 rounded-full blur-2xl group-hover:bg-ds-secondary/10 transition-colors" />
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-ds-secondary/10 rounded-2xl flex items-center justify-center text-ds-secondary">
              <span
                className="material-symbols-outlined text-3xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                health_and_safety
              </span>
            </div>
            <span className="font-[var(--font-heading)] font-bold text-ds-on-surface-variant uppercase tracking-widest text-[10px]">
              {t("providerHealth")}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-[var(--font-heading)] text-4xl font-extrabold text-ds-on-surface">
              {stats.activeChannels}/{stats.totalChannels}
            </span>
            {stats.degradedCount > 0 && (
              <span className="text-ds-tertiary font-bold text-xs">
                {stats.degradedCount} {t("degraded")}
              </span>
            )}
          </div>
        </SectionCard>
      </section>

      {/* Search and Filter Bar */}
      <div className="bg-ds-surface-container-low p-4 rounded-2xl mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[300px] relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ds-outline">
            search
          </span>
          <input
            className="w-full bg-ds-surface-container-low border-none rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-ds-primary/20 placeholder:text-ds-outline/60 font-[var(--font-heading)] outline-none"
            placeholder={t("searchPlaceholder")}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="bg-ds-surface-container-low px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 text-ds-on-surface-variant hover:bg-white transition-colors font-[var(--font-heading)]">
            <span className="material-symbols-outlined text-lg">filter_list</span> {t("filter")}
          </button>
          <button className="bg-ds-surface-container-low px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 text-ds-on-surface-variant hover:bg-white transition-colors font-[var(--font-heading)]">
            <span className="material-symbols-outlined text-lg">sort</span> {t("sortBy")}
          </button>
        </div>
        <div className="h-8 w-px bg-ds-outline-variant/30 hidden lg:block" />
        <div className="flex items-center gap-1.5 px-3">
          <span className="w-2 h-2 rounded-full bg-ds-secondary" />
          <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-wider">
            {t("allClear")}
          </span>
        </div>
        <Button variant="gradient-primary" size="lg" onClick={handleSync} disabled={syncing}>
          <span className="material-symbols-outlined text-lg">sync</span>
          {syncing ? t("syncing") : t("syncModels")}
        </Button>
      </div>

      {/* Hierarchical Channel Manager — read-only, no expansion */}
      {loading ? (
        <div className="text-center py-12 text-ds-outline">{tc("loading")}</div>
      ) : (
        <div className="space-y-6">
          {data.map((prov) => {
            const expanded = expandedProviders.has(prov.id);
            const healthLabel =
              prov.summary.degradedChannels > 0 || prov.summary.disabledChannels > 0
                ? t("statusDegraded")
                : t("healthy");
            const visibleModels = showAllModels.has(prov.id)
              ? prov.models
              : prov.models.slice(0, MODELS_PER_PAGE);
            const hasMore = prov.models.length > MODELS_PER_PAGE && !showAllModels.has(prov.id);

            return (
              <div
                key={prov.id}
                className="bg-ds-surface-container-low rounded-3xl p-6 transition-all duration-300"
              >
                {/* Provider Header */}
                <div
                  className={`flex items-center justify-between ${expanded ? "mb-6" : ""} group cursor-pointer`}
                  onClick={() => setExpandedProviders((s) => toggle(s, prov.id))}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-ds-primary font-bold text-sm">
                      {prov.displayName.slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-[var(--font-heading)] font-bold text-xl text-ds-on-surface">
                        {prov.displayName}
                      </h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-ds-on-surface-variant font-bold">
                          {prov.summary.modelCount} {t("modelsUnit")} {t("active")}
                        </span>
                        <span className="text-xs text-ds-secondary flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-ds-secondary" />
                          L1 {healthLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-ds-outline group-hover:text-ds-primary transition-colors">
                    {expanded ? "expand_less" : "expand_more"}
                  </span>
                </div>

                {/* Model Rows — read-only, using shared ChannelTable */}
                {expanded && (
                  <div className="space-y-4 ml-2 pl-4 border-l-2 border-ds-outline-variant/20">
                    {visibleModels.map((model) => {
                      const rows: ChannelRowData[] = model.channels.map((ch) => ({
                        id: ch.id,
                        modelName: model.displayName || model.name,
                        providerName: prov.displayName,
                        costPrice: ch.costPrice,
                        status: ch.status,
                      }));

                      return (
                        <div
                          key={model.id}
                          className="bg-ds-surface-container-lowest rounded-lg p-4"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <span className="material-symbols-outlined text-ds-primary/60">
                              model_training
                            </span>
                            <span className="font-[var(--font-heading)] font-bold text-sm text-ds-on-surface">
                              {model.displayName || model.name}
                            </span>
                            <span className="text-xs text-ds-on-surface-variant font-bold">
                              {model.channels.length} ch
                            </span>
                          </div>
                          <ChannelTable
                            channels={rows}
                            exchangeRate={exchangeRate}
                            mode="readonly"
                          />
                        </div>
                      );
                    })}

                    {hasMore && (
                      <button
                        onClick={() =>
                          setShowAllModels((s) => {
                            const n = new Set(s);
                            n.add(prov.id);
                            return n;
                          })
                        }
                        className="w-full py-2.5 text-xs text-ds-on-surface-variant hover:text-ds-on-surface transition-colors font-bold"
                      >
                        {t("showAll", { count: prov.models.length })}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Global Model Matrix — read-only */}
      {!loading && matrixRows.length > 0 && (
        <div className="mt-12 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-[var(--font-heading)] font-extrabold text-2xl flex items-center gap-2">
              {t("globalModelMatrix")}
              <span className="bg-ds-primary/10 text-ds-primary text-xs px-3 py-1 rounded-full">
                {matrixTotal} {t("total")}
              </span>
            </h2>
            <div className="flex gap-2">
              <button className="p-2 hover:bg-ds-surface-container rounded-lg transition-colors">
                <span className="material-symbols-outlined">download</span>
              </button>
              <button
                className="p-2 hover:bg-ds-surface-container rounded-lg transition-colors"
                onClick={() => load()}
              >
                <span className="material-symbols-outlined">refresh</span>
              </button>
            </div>
          </div>

          <TableCard>
            <table className="w-full text-left border-collapse font-[var(--font-heading)]">
              <thead>
                <tr className="bg-ds-surface-container-low/50">
                  <th className="px-6 py-4 text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                    {t("modelIdentifier")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                    {t("provider")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                    {t("availability")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                    {t("tokenCost")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                    {t("lastPing")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-outline-variant/10">
                {matrixSlice.map((row, i) => {
                  const rate = row.channel.successRate ?? 0;
                  const barColor =
                    rate >= 90 ? "bg-ds-secondary" : rate >= 50 ? "bg-ds-tertiary" : "bg-ds-error";
                  const dotColor =
                    row.channel.status === "ACTIVE"
                      ? "bg-ds-secondary"
                      : row.channel.status === "DEGRADED"
                        ? "bg-ds-tertiary"
                        : "bg-ds-error";
                  const isTimedOut =
                    row.channel.status === "DISABLED" && row.channel.latencyMs === null;

                  return (
                    <tr
                      key={`${row.channel.id}-${i}`}
                      className="hover:bg-ds-surface-container-high transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                          <span className="font-bold text-sm text-ds-on-surface">
                            {row.modelName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold">{row.providerName}</td>
                      <td className="px-6 py-4">
                        <div className="w-24 h-1.5 bg-ds-outline-variant/20 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-xs">
                        {fmtCostPrice(row.channel.costPrice, exchangeRate, t("priceFree"))}
                      </td>
                      <td
                        className={`px-6 py-4 text-xs ${isTimedOut ? "text-ds-error font-bold" : "text-ds-on-surface-variant"}`}
                      >
                        {isTimedOut
                          ? t("timedOut")
                          : row.channel.latencyMs !== null
                            ? `${row.channel.latencyMs}ms`
                            : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {matrixPageCount > 1 && (
              <div className="p-4 bg-slate-50 flex justify-between items-center text-xs font-bold text-ds-on-surface-variant">
                <span>
                  {t("showingEntries", { count: matrixSlice.length, total: matrixTotal })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMatrixPage((p) => Math.max(0, p - 1))}
                    disabled={matrixPage === 0}
                    className="px-3 py-1 bg-white rounded-lg hover:bg-ds-surface-container transition-colors disabled:opacity-50"
                  >
                    {t("previous")}
                  </button>
                  {Array.from({ length: Math.min(5, matrixPageCount) }, (_, i) => {
                    const page = matrixPage < 3 ? i : matrixPage - 2 + i;
                    if (page >= matrixPageCount) return null;
                    return (
                      <span
                        key={page}
                        onClick={() => setMatrixPage(page)}
                        className={`px-3 py-1 rounded-lg cursor-pointer ${
                          page === matrixPage
                            ? "bg-ds-primary text-white"
                            : "hover:bg-ds-surface-container"
                        }`}
                      >
                        {page + 1}
                      </span>
                    );
                  })}
                  {matrixPageCount > 5 && matrixPage < matrixPageCount - 3 && (
                    <>
                      <span className="px-1 text-ds-outline">...</span>
                      <span
                        onClick={() => setMatrixPage(matrixPageCount - 1)}
                        className="px-3 py-1 hover:bg-ds-surface-container rounded-lg cursor-pointer"
                      >
                        {matrixPageCount}
                      </span>
                    </>
                  )}
                  <button
                    onClick={() => setMatrixPage((p) => Math.min(matrixPageCount - 1, p + 1))}
                    disabled={matrixPage >= matrixPageCount - 1}
                    className="px-3 py-1 bg-white rounded-lg hover:bg-ds-surface-container transition-colors disabled:opacity-50"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}
          </TableCard>
        </div>
      )}

      {/* Sync status footer */}
      {lastSyncTime && (
        <div className="mt-6 text-xs text-ds-on-surface-variant">
          {t("lastSync")}: {new Date(lastSyncTime).toLocaleString()}
          {lastSyncResult?.summary && (
            <span className="ml-4">
              {t("syncResult")}:{" "}
              <span className="text-ds-secondary">
                +{lastSyncResult.summary.totalNewChannels} {t("newChannels")}
              </span>
              <span className="mx-2">
                -{lastSyncResult.summary.totalDisabledChannels} {t("disabledLabel")}
              </span>
              {lastSyncResult.summary.totalWarningProviders > 0 && (
                <span className="text-amber-500 mx-2">
                  {lastSyncResult.summary.totalWarningProviders} {t("warningLabel")}
                </span>
              )}
              {lastSyncResult.summary.totalFailedProviders > 0 && (
                <span className="text-ds-error">
                  {lastSyncResult.summary.totalFailedProviders} {t("failedLabel")}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </PageContainer>
  );
}
