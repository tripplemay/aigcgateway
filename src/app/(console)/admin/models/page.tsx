"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatContext } from "@/lib/utils";
import "material-symbols/outlined.css";

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
// Constants — aligned with Stitch "Algorithmic Atelier" tokens
// ============================================================

const STATUS_CFG = {
  ACTIVE: { color: "var(--ds-secondary)", label: "L1", bg: "bg-[var(--ds-secondary)]/10", text: "text-[var(--ds-secondary)]" },
  DEGRADED: { color: "var(--ds-tertiary)", label: "L2", bg: "bg-[var(--ds-tertiary)]/10", text: "text-[var(--ds-tertiary)]" },
  DISABLED: { color: "var(--ds-error)", label: "L3", bg: "bg-[var(--ds-error)]/10", text: "text-[var(--ds-error)]" },
} as const;

const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  unknown: "Unknown",
};

const MODELS_PER_PAGE = 20;
const MATRIX_PER_PAGE = 10;

function fmtPrice(p: Record<string, unknown> | null) {
  if (!p) return "\u2014";
  if (p.unit === "call") {
    const v = Number(p.perCall ?? 0);
    return v === 0 ? "Free" : `$${v}/call`;
  }
  const inp = Number(p.inputPer1M ?? 0);
  const out = Number(p.outputPer1M ?? 0);
  return inp === 0 && out === 0 ? "Free" : `$${inp} / $${out}`;
}

function MIcon({ name, className = "", filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  );
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
  const [modality, setModality] = useState("");
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
    const params = new URLSearchParams();
    if (modality) params.set("modality", modality);
    if (search) params.set("search", search);
    const q = params.toString() ? `?${params}` : "";
    const r = await apiFetch<{ data: ProviderGroup[] }>(`/api/admin/models-channels${q}`);
    setData(r.data);
    setLoading(false);
  }, [modality, search]);

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

  const channelStatusLabel = (ch: ChannelEntry) => {
    if (ch.status === "DISABLED") return t("disabled");
    const pct = ch.priority <= 1 ? "80%" : ch.priority <= 2 ? "15%" : "5%";
    return `${t("priority")}: ${pct}`;
  };

  const channelAction = (ch: ChannelEntry) => {
    if (ch.status === "ACTIVE") return { label: "Edit", cls: "text-[var(--ds-primary)]" };
    if (ch.status === "DEGRADED") return { label: "Retry", cls: "text-[var(--ds-tertiary)]", icon: "warning" };
    return { label: "Troubleshoot", cls: "text-[var(--ds-error)]" };
  };

  // ── Render ──
  return (
    <div className="max-w-[1200px]">
      {/* ══════════ Page Header ══════════ */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-extrabold tracking-tight text-[var(--ds-on-surface)] mb-2">
            {t("title")}
          </h1>
          <p className="text-[var(--ds-on-surface-variant)] max-w-2xl">
            {t("pageDescription")}
          </p>
        </div>
        <button className="bg-gradient-to-r from-[var(--ds-primary)] to-[var(--ds-primary-container)] text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg shadow-[var(--ds-primary)]/20 flex items-center gap-2 hover:scale-[1.02] transition-transform active:scale-95">
          <MIcon name="add" />
          {t("createChannel")}
        </button>
      </div>

      {/* ══════════ Premium Stats Section ══════════ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Routing Efficiency */}
        <div className="bg-[var(--ds-surface-container-lowest)] p-6 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-[var(--ds-primary)]/5 rounded-full blur-2xl group-hover:bg-[var(--ds-primary)]/10 transition-colors" />
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-[var(--ds-primary)]/10 rounded-2xl flex items-center justify-center text-[var(--ds-primary)]">
              <MIcon name="route" className="text-3xl" />
            </div>
            <span className="font-[var(--font-heading)] font-bold text-[var(--ds-on-surface-variant)] uppercase tracking-widest text-[10px]">
              {t("routingEfficiency")}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-[var(--font-heading)] text-4xl font-extrabold text-[var(--ds-on-surface)]">
              {stats.efficiency}%
            </span>
          </div>
        </div>

        {/* Provider Health */}
        <div className="bg-[var(--ds-surface-container-lowest)] p-6 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-[var(--ds-secondary)]/5 rounded-full blur-2xl group-hover:bg-[var(--ds-secondary)]/10 transition-colors" />
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-[var(--ds-secondary)]/10 rounded-2xl flex items-center justify-center text-[var(--ds-secondary)]">
              <MIcon name="health_and_safety" className="text-3xl" filled />
            </div>
            <span className="font-[var(--font-heading)] font-bold text-[var(--ds-on-surface-variant)] uppercase tracking-widest text-[10px]">
              {t("providerHealth")}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-[var(--font-heading)] text-4xl font-extrabold text-[var(--ds-on-surface)]">
              {stats.activeChannels}/{stats.totalChannels}
            </span>
            {stats.degradedCount > 0 && (
              <span className="text-[var(--ds-tertiary)] font-semibold text-xs">
                {stats.degradedCount} {t("degraded")}
              </span>
            )}
          </div>
        </div>

        {/* Pricing Drift */}
        <div className="bg-[var(--ds-surface-container-lowest)] p-6 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-[var(--ds-tertiary)]/5 rounded-full blur-2xl group-hover:bg-[var(--ds-tertiary)]/10 transition-colors" />
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-[var(--ds-tertiary)]/10 rounded-2xl flex items-center justify-center text-[var(--ds-tertiary)]">
              <MIcon name="trending_down" className="text-3xl" />
            </div>
            <span className="font-[var(--font-heading)] font-bold text-[var(--ds-on-surface-variant)] uppercase tracking-widest text-[10px]">
              {t("pricingDrift")}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-[var(--font-heading)] text-4xl font-extrabold text-[var(--ds-on-surface)]">
              &mdash;
            </span>
          </div>
        </div>
      </section>

      {/* ══════════ Search & Filter Bar ══════════ */}
      <div className="bg-[var(--ds-surface-container-low)] p-4 rounded-2xl mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[300px] relative">
          <MIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-outline)]" />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--ds-surface-container-lowest)] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--ds-primary)]/20 placeholder:text-[var(--ds-outline)]/60 outline-none border-none"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Modality pills */}
          {[
            { val: "", label: t("all") },
            { val: "TEXT", label: t("text") },
            { val: "IMAGE", label: t("image") },
          ].map((m) => (
            <button
              key={m.val}
              onClick={() => setModality(m.val)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors ${
                modality === m.val
                  ? "bg-[var(--ds-primary)] text-white"
                  : "bg-[var(--ds-surface-container-lowest)] text-[var(--ds-on-surface-variant)] hover:bg-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button className="bg-[var(--ds-surface-container-lowest)] px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 text-[var(--ds-on-surface-variant)] hover:bg-white transition-colors">
            <MIcon name="filter_list" className="text-lg" /> {t("filter")}
          </button>
          <button className="bg-[var(--ds-surface-container-lowest)] px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 text-[var(--ds-on-surface-variant)] hover:bg-white transition-colors">
            <MIcon name="sort" className="text-lg" /> {t("sortBy")}
          </button>
        </div>
        <div className="h-8 w-px bg-[var(--ds-outline-variant)]/30 hidden lg:block" />
        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-gradient-to-r from-[var(--ds-primary)] to-[var(--ds-primary-container)] text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
        >
          <MIcon name="sync" className="text-lg" />
          {syncing ? t("syncing") : t("syncModels")}
        </button>
      </div>

      {/* ══════════ Hierarchical Provider Cards ══════════ */}
      {loading ? (
        <div className="text-center py-12 text-[var(--ds-outline)]">{tc("loading")}</div>
      ) : (
        <div className="space-y-6">
          {data.map((prov) => {
            const expanded = expandedProviders.has(prov.id);
            const totalProv =
              prov.summary.activeChannels + prov.summary.degradedChannels + prov.summary.disabledChannels;
            const healthLabel =
              prov.summary.disabledChannels > 0
                ? "degraded"
                : prov.summary.degradedChannels > 0
                  ? "degraded"
                  : "healthy";
            const visibleModels = showAllModels.has(prov.id) ? prov.models : prov.models.slice(0, MODELS_PER_PAGE);
            const hasMore = prov.models.length > MODELS_PER_PAGE && !showAllModels.has(prov.id);

            return (
              <div key={prov.id} className="bg-[var(--ds-surface-container-low)] rounded-3xl p-6 transition-all duration-300">
                {/* ── Provider Header ── */}
                <div
                  className="flex items-center justify-between mb-1 group cursor-pointer"
                  onClick={() => setExpandedProviders((s) => toggle(s, prov.id))}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-[var(--ds-primary)] font-bold text-sm">
                      {prov.displayName.slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-[var(--font-heading)] font-bold text-xl text-[var(--ds-on-surface)]">
                        {prov.displayName}
                      </h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-[var(--ds-on-surface-variant)] font-medium">
                          {prov.summary.modelCount} {t("models")} {t("active")}
                        </span>
                        <span className="text-xs text-[var(--ds-secondary)] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--ds-secondary)]" />
                          L1 {HEALTH_LABEL[healthLabel]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <MIcon
                    name={expanded ? "expand_less" : "expand_more"}
                    className="text-[var(--ds-outline)] group-hover:text-[var(--ds-primary)] transition-colors"
                  />
                </div>

                {/* ── Model List ── */}
                {expanded && (
                  <div className="space-y-4 ml-2 pl-4 mt-6" style={{ borderLeft: "2px solid color-mix(in srgb, var(--ds-outline-variant) 20%, transparent)" }}>
                    {visibleModels.map((model) => {
                      const modelExpanded = expandedModels.has(model.id);
                      const avgLatency = model.channels.reduce((s, c) => s + (c.latencyMs ?? 0), 0) / (model.channels.filter((c) => c.latencyMs !== null).length || 1);
                      const totalCallsModel = model.channels.reduce((s, c) => s + c.totalCalls, 0);

                      return (
                        <div key={model.id} className="bg-[var(--ds-surface-container-lowest)] rounded-2xl overflow-hidden">
                          {/* Model header */}
                          <div
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--ds-surface-container-low)]/50 transition-colors"
                            style={modelExpanded ? { borderBottom: "1px solid color-mix(in srgb, var(--ds-outline-variant) 10%, transparent)" } : undefined}
                            onClick={() => setExpandedModels((s) => toggle(s, model.id))}
                          >
                            <div className="flex items-center gap-4">
                              <MIcon name="model_training" className="text-[var(--ds-primary)]/60" />
                              <span className="font-[var(--font-heading)] font-bold text-[var(--ds-on-surface)]">
                                {model.displayName || model.name}
                              </span>
                              {model.channels.some((c) => c.priority <= 1) && (
                                <span className="text-[10px] font-black bg-[var(--ds-primary)]/10 text-[var(--ds-primary)] px-2 py-0.5 rounded-md uppercase">
                                  High Priority
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-6 text-sm">
                              {model.channels.some((c) => c.latencyMs !== null) && (
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] text-[var(--ds-outline)] uppercase font-bold tracking-tighter">
                                    {t("latency")}
                                  </span>
                                  <span className="font-[var(--font-heading)] font-bold">
                                    {avgLatency > 1000 ? `${(avgLatency / 1000).toFixed(1)}s` : `${Math.round(avgLatency)}ms`}
                                  </span>
                                </div>
                              )}
                              {totalCallsModel > 0 && (
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] text-[var(--ds-outline)] uppercase font-bold tracking-tighter">
                                    Calls
                                  </span>
                                  <span className="font-[var(--font-heading)] font-bold">
                                    {totalCallsModel > 1000 ? `${(totalCallsModel / 1000).toFixed(1)}k` : totalCallsModel}
                                  </span>
                                </div>
                              )}
                              <MIcon
                                name={modelExpanded ? "expand_less" : "expand_more"}
                                className="text-[var(--ds-outline)]"
                              />
                            </div>
                          </div>

                          {/* Channel Cards Grid */}
                          {modelExpanded && (
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {model.channels.map((ch) => {
                                const cfg = STATUS_CFG[ch.status];
                                const action = channelAction(ch);
                                return (
                                  <div
                                    key={ch.id}
                                    className={`p-4 rounded-xl hover:shadow-md transition-shadow group relative ${
                                      ch.status === "DISABLED" ? "opacity-75" : ""
                                    }`}
                                    style={{
                                      border: `1px solid color-mix(in srgb, ${ch.status === "DEGRADED" ? "var(--ds-tertiary)" : ch.status === "DISABLED" ? "var(--ds-error)" : "var(--ds-outline-variant)"} 20%, transparent)`,
                                      backgroundColor: ch.status === "DEGRADED"
                                        ? "color-mix(in srgb, var(--ds-tertiary) 3%, transparent)"
                                        : ch.status === "DISABLED"
                                          ? "color-mix(in srgb, var(--ds-error) 3%, transparent)"
                                          : undefined,
                                    }}
                                  >
                                    <div className="flex items-start justify-between mb-3">
                                      <div>
                                        <div className="font-bold text-sm text-[var(--ds-on-surface)]">
                                          {ch.realModelId}
                                        </div>
                                        <div className="text-[10px] text-[var(--ds-on-surface-variant)] opacity-60">
                                          ID: {ch.id.slice(0, 8)}
                                        </div>
                                      </div>
                                      <div
                                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                                        style={{
                                          backgroundColor: `color-mix(in srgb, ${cfg.color} 10%, transparent)`,
                                          color: cfg.color,
                                        }}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                                        <span className="text-[10px] font-bold uppercase">{cfg.label}</span>
                                      </div>
                                    </div>

                                    {/* Price & Success */}
                                    <div className="text-xs text-[var(--ds-on-surface-variant)] space-y-1 mb-3">
                                      <div className="flex justify-between">
                                        <span>{t("sellPrice")}</span>
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
                                            className="font-medium text-[var(--ds-on-surface)] cursor-pointer hover:underline"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingSellPrice(ch.id);
                                              setSellPriceValue(
                                                String(ch.sellPrice.unit === "call" ? ch.sellPrice.perCall : ch.sellPrice.inputPer1M),
                                              );
                                            }}
                                          >
                                            {fmtPrice(ch.sellPrice)}
                                            {ch.sellPriceLocked && (
                                              <MIcon name="lock" className="text-[10px] ml-0.5 text-[var(--ds-outline)]" />
                                            )}
                                          </span>
                                        )}
                                      </div>
                                      {ch.successRate !== null && (
                                        <div className="flex justify-between">
                                          <span>{t("successRate")}</span>
                                          <span className="font-medium text-[var(--ds-on-surface)]">{ch.successRate}%</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Footer: Weight + Action */}
                                    <div className="mt-4 flex items-center justify-between">
                                      <div className="text-xs font-medium text-[var(--ds-on-surface-variant)]">
                                        {editingPriority === ch.id ? (
                                          <Input
                                            className="w-12 h-5 text-center text-xs"
                                            autoFocus
                                            value={priorityValue}
                                            onChange={(e) => setPriorityValue(e.target.value)}
                                            onBlur={() => savePriority(ch.id)}
                                            onKeyDown={(e) => e.key === "Enter" && savePriority(ch.id)}
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
                                      <button
                                        className={`${ch.status === "ACTIVE" ? "opacity-0 group-hover:opacity-100" : "opacity-100"} transition-opacity font-bold text-xs flex items-center gap-1 ${action.cls}`}
                                      >
                                        {action.icon && <MIcon name={action.icon} className="text-sm" />}
                                        {action.label}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Collapsed model row (no channels visible) */}
                          {!modelExpanded && model.channels.length === 0 && (
                            <div className="p-4 flex items-center justify-between opacity-60">
                              <div className="flex items-center gap-4">
                                <MIcon name="model_training" className="text-[var(--ds-outline)]" />
                                <span className="font-[var(--font-heading)] font-bold text-[var(--ds-on-surface)]">
                                  {model.displayName || model.name}
                                </span>
                              </div>
                              <MIcon name="add_circle" className="text-[var(--ds-outline)]" />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Show all button */}
                    {hasMore && (
                      <button
                        onClick={() =>
                          setShowAllModels((s) => {
                            const n = new Set(s);
                            n.add(prov.id);
                            return n;
                          })
                        }
                        className="w-full py-2.5 text-xs text-[var(--ds-on-surface-variant)] hover:text-[var(--ds-on-surface)] transition-colors"
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

      {/* ══════════ Global Model Matrix ══════════ */}
      {!loading && matrixRows.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-[var(--font-heading)] font-extrabold text-lg flex items-center gap-2">
              {t("globalModelMatrix")}
              <span className="bg-[var(--ds-primary)]/10 text-[var(--ds-primary)] text-[10px] px-2 py-1 rounded-full">
                {matrixTotal} {t("total")}
              </span>
            </h2>
            <div className="flex gap-2">
              <button className="p-2 hover:bg-[var(--ds-surface-container)] rounded-lg" onClick={() => load()}>
                <MIcon name="refresh" />
              </button>
            </div>
          </div>

          <div className="bg-[var(--ds-surface-container-lowest)] rounded-3xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--ds-surface-container-low)]/50">
                  <th className="px-6 py-4 text-[10px] font-bold text-[var(--ds-on-surface-variant)] uppercase tracking-[0.1em]">
                    {t("modelIdentifier")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-[var(--ds-on-surface-variant)] uppercase tracking-[0.1em]">
                    {t("provider")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-[var(--ds-on-surface-variant)] uppercase tracking-[0.1em]">
                    {t("availability")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-[var(--ds-on-surface-variant)] uppercase tracking-[0.1em]">
                    {t("tokenCost")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-[var(--ds-on-surface-variant)] uppercase tracking-[0.1em]">
                    {t("latency")}
                  </th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody>
                {matrixSlice.map((row, i) => {
                  const rate = row.channel.successRate ?? 0;
                  const barColor =
                    rate >= 90 ? "var(--ds-secondary)" : rate >= 50 ? "var(--ds-tertiary)" : "var(--ds-error)";
                  return (
                    <tr
                      key={`${row.channel.id}-${i}`}
                      className="hover:bg-[var(--ds-surface-container-high)] transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: STATUS_CFG[row.channel.status].color }}
                          />
                          <span className="font-[var(--font-heading)] font-bold text-sm text-[var(--ds-on-surface)]">
                            {row.modelName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium">{row.providerName}</td>
                      <td className="px-6 py-4">
                        <div className="w-24 h-1.5 bg-[var(--ds-outline-variant)]/20 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${rate}%`, backgroundColor: barColor }}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 font-[var(--font-heading)] font-bold text-xs">
                        {fmtPrice(row.channel.costPrice)}
                      </td>
                      <td className="px-6 py-4 text-xs text-[var(--ds-on-surface-variant)]">
                        {row.channel.latencyMs !== null ? `${row.channel.latencyMs}ms` : "\u2014"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <MIcon name="more_vert" className="text-[var(--ds-outline)] opacity-0 group-hover:opacity-100 cursor-pointer" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {matrixPageCount > 1 && (
              <div className="p-4 bg-[var(--ds-surface-container-low)]/30 flex justify-between items-center text-xs font-medium text-[var(--ds-on-surface-variant)]">
                <span>
                  {t("showingEntries", { count: matrixSlice.length, total: matrixTotal })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMatrixPage((p) => Math.max(0, p - 1))}
                    disabled={matrixPage === 0}
                    className="px-3 py-1 bg-white rounded-lg hover:bg-[var(--ds-surface-container)] transition-colors disabled:opacity-50"
                  >
                    {t("previous")}
                  </button>
                  {Array.from({ length: Math.min(5, matrixPageCount) }, (_, i) => {
                    const page = matrixPage < 3 ? i : matrixPage - 2 + i;
                    if (page >= matrixPageCount) return null;
                    return (
                      <button
                        key={page}
                        onClick={() => setMatrixPage(page)}
                        className={`px-3 py-1 rounded-lg ${
                          page === matrixPage
                            ? "bg-[var(--ds-primary)] text-white"
                            : "hover:bg-[var(--ds-surface-container)] cursor-pointer"
                        }`}
                      >
                        {page + 1}
                      </button>
                    );
                  })}
                  {matrixPageCount > 5 && matrixPage < matrixPageCount - 3 && (
                    <>
                      <span className="px-1 text-[var(--ds-outline)]">...</span>
                      <button
                        onClick={() => setMatrixPage(matrixPageCount - 1)}
                        className="px-3 py-1 rounded-lg hover:bg-[var(--ds-surface-container)] cursor-pointer"
                      >
                        {matrixPageCount}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setMatrixPage((p) => Math.min(matrixPageCount - 1, p + 1))}
                    disabled={matrixPage >= matrixPageCount - 1}
                    className="px-3 py-1 bg-white rounded-lg hover:bg-[var(--ds-surface-container)] transition-colors disabled:opacity-50"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ Sync Status Footer ══════════ */}
      {(lastSyncTime || lastSyncResult) && (
        <div className="mt-6 text-xs text-[var(--ds-on-surface-variant)]">
          {lastSyncTime && (
            <span>
              {t("lastSync")}: {new Date(lastSyncTime).toLocaleString()}
            </span>
          )}
          {lastSyncResult && (
            <div className="bg-[var(--ds-surface-container-low)] rounded-xl p-3 mt-2">
              <span>{t("syncResult")}: </span>
              <span className="text-[var(--ds-secondary)]">
                +{lastSyncResult.summary.totalNewChannels} {t("newChannels")}
              </span>
              <span className="mx-2">
                -{lastSyncResult.summary.totalDisabledChannels} {t("disabledLabel")}
              </span>
              {lastSyncResult.summary.totalFailedProviders > 0 && (
                <span className="text-[var(--ds-error)]">
                  {lastSyncResult.summary.totalFailedProviders} {t("failedLabel")}
                </span>
              )}
              {lastSyncResult.providers
                .filter((p) => !p.success)
                .map((p) => (
                  <div key={p.providerName} className="text-[var(--ds-error)] mt-1">
                    {p.providerName}: {p.error}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
