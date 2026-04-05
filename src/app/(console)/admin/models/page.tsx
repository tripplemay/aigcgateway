"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ============================================================
// Types
// ============================================================

interface ChannelEntry {
  id: string;
  realModelId: string;
  priority: number;
  costPrice: Record<string, unknown>;
  sellPrice: Record<string, unknown>;
  sellPriceLocked: boolean;
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
  sellPrice: Record<string, unknown> | null;
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

function fmtPrice(p: Record<string, unknown> | null) {
  if (!p) return "\u2014";
  if (p.unit === "call") {
    const v = Number(p.perCall ?? 0);
    return v === 0 ? "Free" : `$${v}/call`;
  }
  const inp = Number(p.inputPer1M ?? 0);
  const out = Number(p.outputPer1M ?? 0);
  return inp === 0 && out === 0 ? "Free" : `$${inp.toFixed(2)} / $${out.toFixed(2)}`;
}

// ============================================================
// Component
// ============================================================

export default function ModelsChannelsPage() {
  const t = useTranslations("adminModels");
  const tc = useTranslations("common");

  const [data, setData] = useState<ProviderGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{
    summary: {
      totalNewChannels: number;
      totalDisabledChannels: number;
      totalFailedProviders: number;
    };
    providers: Array<{ providerName: string; success: boolean; error?: string }>;
  } | null>(null);

  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [showAllModels, setShowAllModels] = useState<Set<string>>(new Set());
  const [editingPriority, setEditingPriority] = useState<string | null>(null);
  const [priorityValue, setPriorityValue] = useState("");
  const [editingSellPrice, setEditingSellPrice] = useState<string | null>(null);
  const [sellPriceValue, setSellPriceValue] = useState("");
  const [matrixPage, setMatrixPage] = useState(0);

  // ── Data loading ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const q = params.toString() ? `?${params}` : "";
      const r = await apiFetch<{ data: ProviderGroup[] }>(`/api/admin/models-channels${q}`);
      setData(r.data);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadSyncStatus = useCallback(async () => {
    try {
      const r = await apiFetch<{
        data: { lastSyncTime: string | null; lastSyncResult: typeof lastSyncResult };
      }>("/api/admin/sync-status");
      setLastSyncTime(r.data.lastSyncTime);
      setLastSyncResult(r.data.lastSyncResult);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadSyncStatus();
  }, [load, loadSyncStatus]);

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

  const savePriority = async (channelId: string) => {
    const p = Number(priorityValue);
    if (p > 0) {
      await apiFetch(`/api/admin/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify({ priority: p }),
      });
      toast.success(t("priorityUpdated"));
      load();
    }
    setEditingPriority(null);
  };

  const saveSellPrice = async (ch: ChannelEntry) => {
    const val = Number(sellPriceValue);
    if (isNaN(val) || val < 0) {
      setEditingSellPrice(null);
      return;
    }
    const sp = ch.sellPrice;
    const newSP =
      sp.unit === "call"
        ? { perCall: val, unit: "call" }
        : { inputPer1M: val, outputPer1M: val, unit: "token" };
    await apiFetch(`/api/admin/channels/${ch.id}`, {
      method: "PATCH",
      body: JSON.stringify({ sellPrice: newSP }),
    });
    toast.success(t("priceSaved"));
    setEditingSellPrice(null);
    load();
  };

  // ── Render — strict 1:1 replica of code.html lines 183-467 ──
  return (
    /* code.html line 183: <div class="max-w-7xl mx-auto"> */
    <div className="max-w-7xl mx-auto">
      {/* ═══ Page Header — code.html lines 185-193 ═══ */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="font-[var(--font-heading)] text-4xl font-extrabold tracking-tight text-ds-on-surface mb-2">
            {t("title")}
          </h1>
          <p className="text-ds-on-surface-variant text-sm max-w-2xl">{t("pageDescription")}</p>
        </div>
        <button className="bg-gradient-to-r from-ds-primary to-ds-primary-container text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-ds-primary/20 flex items-center gap-2 hover:scale-[1.02] transition-transform active:scale-95 font-[var(--font-heading)]">
          <span className="material-symbols-outlined">add</span> {t("createChannel")}
        </button>
      </div>

      {/* ═══ Premium Stats Section — code.html lines 195-235 ═══ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Routing Efficiency — lines 196-208 */}
        <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm relative overflow-hidden group border border-slate-200/5">
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
        </div>
        {/* Provider Health — lines 209-221 */}
        <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm relative overflow-hidden group border border-slate-200/5">
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
        </div>
        {/* Pricing Drift — lines 222-234 */}
        <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm relative overflow-hidden group border border-slate-200/5">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-ds-tertiary/5 rounded-full blur-2xl group-hover:bg-ds-tertiary/10 transition-colors" />
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-ds-tertiary/10 rounded-2xl flex items-center justify-center text-ds-tertiary">
              <span className="material-symbols-outlined text-3xl">trending_down</span>
            </div>
            <span className="font-[var(--font-heading)] font-bold text-ds-on-surface-variant uppercase tracking-widest text-[10px]">
              {t("pricingDrift")}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-[var(--font-heading)] text-4xl font-extrabold text-ds-on-surface">
              &mdash;
            </span>
          </div>
        </div>
      </section>

      {/* ═══ Search and Filter Bar — code.html lines 237-255 ═══ */}
      <div className="bg-ds-surface-container-low p-4 rounded-2xl mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[300px] relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ds-outline">
            search
          </span>
          <input
            className="w-full bg-ds-surface-container-lowest border-none rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-ds-primary/20 placeholder:text-ds-outline/60 font-[var(--font-heading)] outline-none"
            placeholder={t("searchPlaceholder")}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="bg-ds-surface-container-lowest px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 text-ds-on-surface-variant hover:bg-white transition-colors font-[var(--font-heading)]">
            <span className="material-symbols-outlined text-lg">filter_list</span> {t("filter")}
          </button>
          <button className="bg-ds-surface-container-lowest px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 text-ds-on-surface-variant hover:bg-white transition-colors font-[var(--font-heading)]">
            <span className="material-symbols-outlined text-lg">sort</span> {t("sortBy")}
          </button>
        </div>
        <div className="h-8 w-px bg-ds-outline-variant/30 hidden lg:block" />
        {/* All Clear indicator — code.html lines 251-254 */}
        <div className="flex items-center gap-1.5 px-3">
          <span className="w-2 h-2 rounded-full bg-ds-secondary" />
          <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-wider">
            All Clear
          </span>
        </div>
        {/* Sync (functional addition, appended at end) */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-gradient-to-r from-ds-primary to-ds-primary-container text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50 font-[var(--font-heading)]"
        >
          <span className="material-symbols-outlined text-lg">sync</span>
          {syncing ? t("syncing") : t("syncModels")}
        </button>
      </div>

      {/* ═══ Hierarchical Channel Manager — code.html lines 257-369 ═══ */}
      {loading ? (
        <div className="text-center py-12 text-ds-outline">{tc("loading")}</div>
      ) : (
        <div className="space-y-6">
          {data.map((prov) => {
            const expanded = expandedProviders.has(prov.id);
            const healthLabel =
              prov.summary.degradedChannels > 0 || prov.summary.disabledChannels > 0
                ? "Degraded"
                : "Healthy";
            const visibleModels = showAllModels.has(prov.id)
              ? prov.models
              : prov.models.slice(0, MODELS_PER_PAGE);
            const hasMore = prov.models.length > MODELS_PER_PAGE && !showAllModels.has(prov.id);

            return (
              /* Level 1: Provider Container — code.html line 259 */
              <div
                key={prov.id}
                className="bg-ds-surface-container-low rounded-3xl p-6 transition-all duration-300"
              >
                {/* Provider Header — code.html lines 260-274 */}
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
                          {prov.summary.modelCount} Models {t("active")}
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

                {/* Level 2: Model Rows — code.html lines 276-349 */}
                {expanded && (
                  <div className="space-y-4 ml-2 pl-4 border-l-2 border-ds-outline-variant/20">
                    {visibleModels.map((model) => {
                      const modelExpanded = expandedModels.has(model.id);
                      const avgLatency =
                        model.channels.reduce((s, c) => s + (c.latencyMs ?? 0), 0) /
                        (model.channels.filter((c) => c.latencyMs !== null).length || 1);
                      const totalCallsModel = model.channels.reduce((s, c) => s + c.totalCalls, 0);

                      return (
                        <div
                          key={model.id}
                          className="bg-ds-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-slate-200/5"
                        >
                          {/* Model Header — code.html lines 278-294 */}
                          <div
                            className="p-4 bg-slate-50/50 flex items-center justify-between border-b border-ds-outline-variant/10 cursor-pointer"
                            onClick={() => setExpandedModels((s) => toggle(s, model.id))}
                          >
                            <div className="flex items-center gap-4">
                              <span className="material-symbols-outlined text-ds-primary/60">
                                model_training
                              </span>
                              <span className="font-[var(--font-heading)] font-bold text-ds-on-surface">
                                {model.displayName || model.name}
                              </span>
                              {model.channels.some((c) => c.priority <= 1) && (
                                <span className="text-[10px] font-black bg-ds-primary/10 text-ds-primary px-2 py-0.5 rounded-md uppercase">
                                  High Priority
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-6 text-sm">
                              {model.channels.some((c) => c.latencyMs !== null) && (
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] text-ds-outline uppercase font-bold tracking-tighter">
                                    {t("latency")}
                                  </span>
                                  <span className="font-[var(--font-heading)] font-bold">
                                    {avgLatency > 1000
                                      ? `${(avgLatency / 1000).toFixed(1)}s`
                                      : `${Math.round(avgLatency)}ms`}
                                  </span>
                                </div>
                              )}
                              {totalCallsModel > 0 && (
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] text-ds-outline uppercase font-bold tracking-tighter">
                                    {t("calls")}
                                  </span>
                                  <span className="font-[var(--font-heading)] font-bold">
                                    {totalCallsModel > 1000
                                      ? `${(totalCallsModel / 1000).toFixed(1)}k`
                                      : totalCallsModel}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Level 3: Channel Cards Grid — code.html lines 296-347 */}
                          {modelExpanded && (
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {model.channels.map((ch) => {
                                const isActive = ch.status === "ACTIVE";
                                const isDegraded = ch.status === "DEGRADED";
                                const isDisabled = ch.status === "DISABLED";
                                const statusLabel = isActive ? "L1" : isDegraded ? "L2" : "L3";
                                const dotColor = isActive
                                  ? "bg-ds-secondary"
                                  : isDegraded
                                    ? "bg-ds-tertiary"
                                    : "bg-ds-error";
                                const badgeBg = isActive
                                  ? "bg-ds-secondary/10 text-ds-secondary"
                                  : isDegraded
                                    ? "bg-ds-tertiary/10 text-ds-tertiary"
                                    : "bg-ds-error/10 text-ds-error";

                                return (
                                  <div
                                    key={ch.id}
                                    className={`p-4 rounded-xl border hover:shadow-md transition-shadow group relative ${
                                      isDegraded
                                        ? "bg-ds-tertiary-container/5 border-ds-tertiary/20"
                                        : isDisabled
                                          ? "bg-ds-error-container/5 border-ds-error/20 opacity-75"
                                          : "border-ds-outline-variant/20"
                                    }`}
                                  >
                                    {/* Card header — code.html lines 298-306 */}
                                    <div className="flex items-start justify-between mb-3">
                                      <div>
                                        <div className="font-bold text-sm text-ds-on-surface">
                                          {ch.realModelId}
                                        </div>
                                        <div className="text-[10px] text-ds-on-surface-variant opacity-60">
                                          ID: {ch.id.slice(0, 8)}
                                        </div>
                                      </div>
                                      <div
                                        className={`flex items-center gap-1.5 ${badgeBg} px-2 py-0.5 rounded-full`}
                                      >
                                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                        <span className="text-[10px] font-bold uppercase">
                                          {statusLabel}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Sell price (editable) */}
                                    <div className="text-xs text-ds-on-surface-variant mb-1">
                                      {t("sellPrice")}:{" "}
                                      {editingSellPrice === ch.id ? (
                                        <Input
                                          className="inline w-20 h-5 text-xs font-mono"
                                          autoFocus
                                          value={sellPriceValue}
                                          onChange={(e) => setSellPriceValue(e.target.value)}
                                          onBlur={() => saveSellPrice(ch)}
                                          onKeyDown={(e) => e.key === "Enter" && saveSellPrice(ch)}
                                        />
                                      ) : (
                                        <span
                                          className="font-bold text-ds-on-surface cursor-pointer hover:underline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingSellPrice(ch.id);
                                            setSellPriceValue(
                                              String(
                                                ch.sellPrice.unit === "call"
                                                  ? ch.sellPrice.perCall
                                                  : ch.sellPrice.inputPer1M,
                                              ),
                                            );
                                          }}
                                        >
                                          {fmtPrice(ch.sellPrice)}
                                        </span>
                                      )}
                                    </div>

                                    {/* Card footer — code.html lines 308-311 */}
                                    <div className="mt-4 flex items-center justify-between">
                                      <div className="text-xs font-bold text-ds-on-surface-variant">
                                        {editingPriority === ch.id ? (
                                          <Input
                                            className="w-12 h-5 text-center text-xs"
                                            autoFocus
                                            value={priorityValue}
                                            onChange={(e) => setPriorityValue(e.target.value)}
                                            onBlur={() => savePriority(ch.id)}
                                            onKeyDown={(e) =>
                                              e.key === "Enter" && savePriority(ch.id)
                                            }
                                          />
                                        ) : (
                                          <span
                                            className="cursor-pointer hover:underline"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingPriority(ch.id);
                                              setPriorityValue(String(ch.priority));
                                            }}
                                          >
                                            P{ch.priority}
                                          </span>
                                        )}
                                      </div>
                                      {isActive && (
                                        <button className="opacity-0 group-hover:opacity-100 transition-opacity text-ds-primary font-bold text-xs">
                                          {t("edit")}
                                        </button>
                                      )}
                                      {isDegraded && (
                                        <button className="opacity-100 text-ds-tertiary font-bold text-xs flex items-center gap-1">
                                          <span className="material-symbols-outlined text-sm">
                                            warning
                                          </span>{" "}
                                          {t("retry")}
                                        </button>
                                      )}
                                      {isDisabled && (
                                        <button className="text-ds-error font-bold text-xs">
                                          {t("troubleshoot")}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
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

      {/* ═══ Global Model Matrix — code.html lines 371-466 ═══ */}
      {!loading && matrixRows.length > 0 && (
        <div className="mt-12 mb-8">
          {/* Header — code.html lines 372-380 */}
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

          {/* Table — code.html lines 381-465 */}
          <div className="bg-ds-surface-container-lowest rounded-3xl shadow-sm overflow-hidden border border-slate-200/5">
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
                  <th className="px-6 py-4" />
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
                      className="hover:bg-ds-surface-container-high transition-colors group"
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
                        {fmtPrice(row.channel.costPrice)}
                      </td>
                      <td
                        className={`px-6 py-4 text-xs ${isTimedOut ? "text-ds-error font-bold" : "text-ds-on-surface-variant"}`}
                      >
                        {isTimedOut
                          ? "Timed Out"
                          : row.channel.latencyMs !== null
                            ? `${row.channel.latencyMs}ms`
                            : "\u2014"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="material-symbols-outlined text-ds-outline opacity-0 group-hover:opacity-100 cursor-pointer">
                          more_vert
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination — code.html lines 453-464 */}
            {matrixPageCount > 1 && (
              <div className="p-4 bg-slate-50 border-t border-ds-outline-variant/10 flex justify-between items-center text-xs font-bold text-ds-on-surface-variant">
                <span>
                  {t("showingEntries", { count: matrixSlice.length, total: matrixTotal })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMatrixPage((p) => Math.max(0, p - 1))}
                    disabled={matrixPage === 0}
                    className="px-3 py-1 bg-white rounded-lg border border-ds-outline-variant/30 hover:bg-ds-surface-container transition-colors disabled:opacity-50"
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
                    className="px-3 py-1 bg-white rounded-lg border border-ds-outline-variant/30 hover:bg-ds-surface-container transition-colors disabled:opacity-50"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sync status footer */}
      {lastSyncTime && (
        <div className="mt-6 text-xs text-ds-on-surface-variant">
          {t("lastSync")}: {new Date(lastSyncTime).toLocaleString()}
          {lastSyncResult && (
            <span className="ml-4">
              {t("syncResult")}:{" "}
              <span className="text-ds-secondary">
                +{lastSyncResult.summary.totalNewChannels} {t("newChannels")}
              </span>
              <span className="mx-2">
                -{lastSyncResult.summary.totalDisabledChannels} {t("disabledLabel")}
              </span>
              {lastSyncResult.summary.totalFailedProviders > 0 && (
                <span className="text-ds-error">
                  {lastSyncResult.summary.totalFailedProviders} {t("failedLabel")}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
