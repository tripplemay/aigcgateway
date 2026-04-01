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
// Constants
// ============================================================

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#534AB7",
  anthropic: "#D85A30",
  deepseek: "#0F9D7A",
  zhipu: "#185FA5",
  volcengine: "#E24B4A",
  siliconflow: "#0F9D7A",
  openrouter: "#888780",
};

const PROVIDER_ABBR: Record<string, string> = {
  openai: "OA",
  anthropic: "An",
  deepseek: "DS",
  zhipu: "ZP",
  volcengine: "VE",
  siliconflow: "SF",
  openrouter: "OR",
};

const STATUS_CFG = {
  ACTIVE: { color: "#639922", bg: "bg-[#eaf3de]", text: "text-[#27500a]" },
  DEGRADED: { color: "#BA7517", bg: "bg-[#faeeda]", text: "text-[#633806]" },
  DISABLED: { color: "#E24B4A", bg: "bg-[#fcebeb]", text: "text-[#791f1f]" },
} as const;

const HEALTH_CFG: Record<string, { color: string; label: string }> = {
  healthy: { color: "#639922", label: "Healthy" },
  degraded: { color: "#BA7517", label: "Degraded" },
  unhealthy: { color: "#E24B4A", label: "Unhealthy" },
  unknown: { color: "#B4B2A9", label: "Unknown" },
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

function MIcon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
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
    const efficiency = totalCalls > 0 ? (totalSuccess / totalCalls).toFixed(1) : "—";
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

  const levelBadge = (priority: number) => {
    if (priority <= 1) return { label: "L1", cls: "bg-[var(--ds-primary)] text-white" };
    if (priority <= 2) return { label: "L2", cls: "bg-[var(--ds-secondary)] text-white" };
    return { label: "L3", cls: "bg-[var(--ds-outline)] text-white" };
  };

  // ── Render ──
  return (
    <div className="max-w-[1200px]">
      {/* ══════════ Page Header ══════════ */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-[var(--font-heading)] font-bold text-[var(--ds-on-surface)] mb-2">
            {t("title")}
          </h1>
          <p className="text-[var(--ds-on-surface-variant)] text-sm leading-relaxed">
            {t("pageDescription")}
          </p>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--ds-primary)] text-[var(--ds-on-primary)] text-sm font-medium hover:opacity-90 transition-opacity shrink-0">
          <MIcon name="add" className="text-lg" />
          {t("createChannel")}
        </button>
      </div>

      {/* ══════════ Stats Cards ══════════ */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {/* Routing Efficiency */}
        <div className="bg-[var(--ds-surface-container)] p-6 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <MIcon name="route" className="text-[var(--ds-primary)] text-xl" />
            <span className="text-[var(--ds-on-surface-variant)] text-xs font-medium uppercase tracking-wider">
              {t("routingEfficiency")}
            </span>
          </div>
          <p className="text-2xl font-[var(--font-heading)] font-bold text-[var(--ds-on-surface)]">
            {stats.efficiency}%
          </p>
        </div>
        {/* Provider Health */}
        <div className="bg-[var(--ds-surface-container)] p-6 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <MIcon name="health_and_safety" className="text-[var(--ds-primary)] text-xl" />
            <span className="text-[var(--ds-on-surface-variant)] text-xs font-medium uppercase tracking-wider">
              {t("providerHealth")}
            </span>
          </div>
          <p className="text-2xl font-[var(--font-heading)] font-bold text-[var(--ds-on-surface)]">
            {stats.activeChannels}/{stats.totalChannels}
          </p>
          {stats.degradedCount > 0 && (
            <p className="text-xs text-[var(--ds-error)] mt-1">
              {stats.degradedCount} {t("degraded")}
            </p>
          )}
        </div>
        {/* Pricing Drift */}
        <div className="bg-[var(--ds-surface-container)] p-6 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <MIcon name="trending_down" className="text-[var(--ds-primary)] text-xl" />
            <span className="text-[var(--ds-on-surface-variant)] text-xs font-medium uppercase tracking-wider">
              {t("pricingDrift")}
            </span>
          </div>
          <p className="text-2xl font-[var(--font-heading)] font-bold text-[var(--ds-on-surface)]">
            —
          </p>
        </div>
      </div>

      {/* ══════════ Search & Filter Bar ══════════ */}
      <div className="flex items-center gap-3 mb-6">
        {/* Search */}
        <div className="flex-1 flex items-center bg-[var(--ds-surface-container)] rounded-lg px-4 py-2.5">
          <MIcon name="search" className="text-[var(--ds-on-surface-variant)] text-lg" />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 ml-2 bg-transparent outline-none text-sm text-[var(--ds-on-surface)] placeholder:text-[var(--ds-outline)]"
          />
        </div>
        {/* Modality pills */}
        <div className="flex gap-1 bg-[var(--ds-surface-container)] rounded-lg p-1">
          {[
            { val: "", label: t("all") },
            { val: "TEXT", label: t("text") },
            { val: "IMAGE", label: t("image") },
          ].map((m) => (
            <button
              key={m.val}
              onClick={() => setModality(m.val)}
              className={`text-sm px-4 py-1.5 rounded-md transition-all ${
                modality === m.val
                  ? "bg-[var(--ds-surface-container-lowest)] text-[var(--ds-on-surface)] font-medium shadow-sm"
                  : "text-[var(--ds-on-surface-variant)] hover:text-[var(--ds-on-surface)]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {/* Filter */}
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--ds-surface-container-lowest)] text-[var(--ds-on-surface-variant)] text-sm hover:bg-[var(--ds-surface-container)] transition-colors border border-[var(--ds-outline-variant)]/40">
          <MIcon name="filter_list" className="text-lg" />
          {t("filter")}
        </button>
        {/* Sort */}
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--ds-surface-container-lowest)] text-[var(--ds-on-surface-variant)] text-sm hover:bg-[var(--ds-surface-container)] transition-colors border border-[var(--ds-outline-variant)]/40">
          <MIcon name="sort" className="text-lg" />
          {t("sortBy")}
        </button>
        {/* Sync */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--ds-primary)] text-[var(--ds-on-primary)] text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <MIcon name="sync" className="text-lg" />
          {syncing ? t("syncing") : t("syncModels")}
        </button>
      </div>

      {/* ══════════ Provider Cards ══════════ */}
      {loading ? (
        <div className="text-center py-12 text-[var(--ds-outline)]">{tc("loading")}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((prov) => {
            const expanded = expandedProviders.has(prov.id);
            const bgColor = PROVIDER_COLORS[prov.name] ?? "#888780";
            const abbr = PROVIDER_ABBR[prov.name] ?? prov.displayName.slice(0, 2);
            const visibleModels = showAllModels.has(prov.id)
              ? prov.models
              : prov.models.slice(0, MODELS_PER_PAGE);
            const hasMore = prov.models.length > MODELS_PER_PAGE && !showAllModels.has(prov.id);
            const totalProv =
              prov.summary.activeChannels +
              prov.summary.degradedChannels +
              prov.summary.disabledChannels;
            const healthLabel =
              prov.summary.degradedChannels > 0 || prov.summary.disabledChannels > 0
                ? "degraded"
                : "healthy";

            return (
              <div
                key={prov.id}
                className="bg-[var(--ds-surface-container-high)] rounded-xl overflow-hidden"
              >
                {/* Provider header */}
                <button
                  onClick={() => setExpandedProviders((s) => toggle(s, prov.id))}
                  className="w-full flex items-center gap-3 p-4 hover:bg-[var(--ds-surface-container)] transition-colors text-left"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold text-white shrink-0"
                    style={{ background: bgColor }}
                  >
                    {abbr}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-[var(--font-heading)] font-bold text-[var(--ds-on-surface)] text-sm">
                      {prov.displayName}
                    </h3>
                    <p className="text-xs text-[var(--ds-on-surface-variant)]">
                      {prov.summary.modelCount} {t("models")} {t("active")}
                    </p>
                  </div>
                  {/* Status chips */}
                  <div className="flex items-center gap-2">
                    {prov.summary.activeChannels > 0 && (
                      <span className="flex items-center gap-1 text-xs">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: STATUS_CFG.ACTIVE.color }}
                        />
                        <span className="text-[var(--ds-on-surface-variant)]">
                          {prov.summary.activeChannels}
                        </span>
                      </span>
                    )}
                    {prov.summary.degradedChannels > 0 && (
                      <span className="flex items-center gap-1 text-xs">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: STATUS_CFG.DEGRADED.color }}
                        />
                        <span className="text-[var(--ds-on-surface-variant)]">
                          {prov.summary.degradedChannels}
                        </span>
                      </span>
                    )}
                    {prov.summary.disabledChannels > 0 && (
                      <span className="flex items-center gap-1 text-xs">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: STATUS_CFG.DISABLED.color }}
                        />
                        <span className="text-[var(--ds-on-surface-variant)]">
                          {prov.summary.disabledChannels}
                        </span>
                      </span>
                    )}
                    <span
                      className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                        healthLabel === "healthy"
                          ? "bg-[#eaf3de] text-[#27500a]"
                          : "bg-[#faeeda] text-[#633806]"
                      }`}
                    >
                      L1 {HEALTH_CFG[healthLabel].label}
                    </span>
                    <MIcon
                      name={expanded ? "expand_less" : "expand_more"}
                      className="text-[var(--ds-outline)] text-xl"
                    />
                  </div>
                </button>

                {/* Model list */}
                {expanded && (
                  <div className="px-4 pb-4">
                    <div className="space-y-1">
                      {visibleModels.map((model) => {
                        const modelExpanded = expandedModels.has(model.id);
                        return (
                          <div key={model.id}>
                            {/* Model row */}
                            <button
                              onClick={() => setExpandedModels((s) => toggle(s, model.id))}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                                modelExpanded
                                  ? "bg-[var(--ds-surface)]"
                                  : "hover:bg-[var(--ds-surface)]"
                              }`}
                            >
                              <MIcon
                                name="model_training"
                                className="text-[var(--ds-on-surface-variant)] text-lg"
                              />
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  background: HEALTH_CFG[model.healthStatus]?.color ?? "#B4B2A9",
                                }}
                              />
                              <span className="flex-1 text-sm font-medium font-mono text-[var(--ds-on-surface)] truncate">
                                {model.name}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                  model.modality === "TEXT"
                                    ? "bg-[var(--color-info-bg)] text-[var(--color-info-text)]"
                                    : "bg-[var(--color-image-bg)] text-[var(--color-image-text)]"
                                }`}
                              >
                                {model.modality.toLowerCase()}
                              </span>
                              <span className="text-xs text-[var(--ds-on-surface-variant)] w-16 text-right">
                                {model.contextWindow ? formatContext(model.contextWindow) : "—"}
                              </span>
                              <span className="text-xs font-mono text-[var(--ds-on-surface-variant)] w-28 text-right">
                                {fmtPrice(model.sellPrice)}
                              </span>
                              <MIcon
                                name={modelExpanded ? "expand_less" : "expand_more"}
                                className="text-[var(--ds-outline)] text-lg"
                              />
                            </button>

                            {/* Channel clusters */}
                            {modelExpanded && (
                              <div className="bg-[var(--ds-surface)] rounded-lg p-3 mx-3 mb-2 space-y-2">
                                {model.channels.map((ch) => {
                                  const badge = levelBadge(ch.priority);
                                  const barColor =
                                    (ch.successRate ?? 0) >= 90
                                      ? "#639922"
                                      : (ch.successRate ?? 0) >= 50
                                        ? "#BA7517"
                                        : "#E24B4A";
                                  return (
                                    <div
                                      key={ch.id}
                                      className={`flex items-center justify-between p-3 rounded-lg bg-[var(--ds-surface-container-lowest)] ${
                                        ch.status === "DISABLED" ? "opacity-50" : ""
                                      }`}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-sm font-medium text-[var(--ds-on-surface)]">
                                            {ch.realModelId}
                                          </span>
                                          <span
                                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.cls}`}
                                          >
                                            {badge.label}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-[var(--ds-on-surface-variant)]">
                                          <span>
                                            {t("costPrice")}:{" "}
                                            <b className="text-[var(--ds-on-surface)] font-medium">
                                              {fmtPrice(ch.costPrice)}
                                            </b>
                                          </span>
                                          <span>
                                            {t("sellPrice")}:{" "}
                                            {editingSellPrice === ch.id ? (
                                              <Input
                                                className="inline w-16 h-5 text-xs font-mono"
                                                autoFocus
                                                value={sellPriceValue}
                                                onChange={(e) => setSellPriceValue(e.target.value)}
                                                onBlur={() => saveSellPrice(ch)}
                                                onKeyDown={(e) =>
                                                  e.key === "Enter" && saveSellPrice(ch)
                                                }
                                              />
                                            ) : (
                                              <b
                                                className="text-[var(--ds-on-surface)] font-medium cursor-pointer hover:underline"
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
                                              </b>
                                            )}
                                            {ch.sellPriceLocked && (
                                              <MIcon
                                                name="lock"
                                                className="text-[10px] ml-0.5 text-[var(--ds-outline)]"
                                              />
                                            )}
                                          </span>
                                          <span>
                                            {t("latency")}:{" "}
                                            <b className="text-[var(--ds-on-surface)] font-medium">
                                              {ch.latencyMs !== null ? `${ch.latencyMs}ms` : "—"}
                                            </b>
                                          </span>
                                          <span>
                                            {t("successRate")}:{" "}
                                            <b className="text-[var(--ds-on-surface)] font-medium">
                                              {ch.successRate !== null ? `${ch.successRate}%` : "—"}
                                            </b>
                                          </span>
                                        </div>
                                        {/* Progress bar */}
                                        <div className="h-[3px] rounded-full mt-2 bg-[var(--ds-outline-variant)]/30 w-full max-w-[200px]">
                                          <div
                                            className="h-[3px] rounded-full"
                                            style={{
                                              width: `${ch.successRate ?? 0}%`,
                                              background: barColor,
                                            }}
                                          />
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 ml-4">
                                        {/* Priority badge */}
                                        {editingPriority === ch.id ? (
                                          <Input
                                            className="w-12 h-6 text-center text-xs"
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
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingPriority(ch.id);
                                              setPriorityValue(String(ch.priority));
                                            }}
                                            className="text-xs text-[var(--ds-on-surface-variant)] bg-[var(--ds-surface-container)] px-2 py-0.5 rounded cursor-pointer hover:bg-[var(--ds-surface-container-high)]"
                                          >
                                            P{ch.priority}
                                          </span>
                                        )}
                                        {/* Status dot */}
                                        <span
                                          className="w-2 h-2 rounded-full"
                                          style={{ background: STATUS_CFG[ch.status].color }}
                                          title={ch.status}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

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
        <div className="mt-8 bg-[var(--ds-surface-container-high)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-[var(--font-heading)] font-bold text-[var(--ds-on-surface)]">
              {t("globalModelMatrix")}
            </h2>
            <div className="flex items-center gap-3 text-sm text-[var(--ds-on-surface-variant)]">
              <span>
                {matrixTotal} {t("total")}
              </span>
              <button onClick={() => load()} className="hover:text-[var(--ds-on-surface)]">
                <MIcon name="refresh" className="text-lg" />
              </button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--ds-surface-container)]">
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-on-surface-variant)]">
                  {t("modelIdentifier")}
                </th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-on-surface-variant)]">
                  {t("provider")}
                </th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-on-surface-variant)]">
                  {t("availability")}
                </th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-on-surface-variant)]">
                  {t("tokenCost")}
                </th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-on-surface-variant)]">
                  {t("latency")}
                </th>
              </tr>
            </thead>
            <tbody>
              {matrixSlice.map((row, i) => (
                <tr
                  key={`${row.channel.id}-${i}`}
                  className="hover:bg-[var(--ds-surface-container)] transition-colors"
                >
                  <td className="p-3 font-mono text-[var(--ds-on-surface)]">{row.modelName}</td>
                  <td className="p-3 text-[var(--ds-on-surface-variant)]">{row.providerName}</td>
                  <td className="p-3">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: STATUS_CFG[row.channel.status].color }}
                    />
                  </td>
                  <td className="p-3 font-mono text-[var(--ds-on-surface)]">
                    {fmtPrice(row.channel.costPrice)}
                  </td>
                  <td className="p-3 text-[var(--ds-on-surface-variant)]">
                    {row.channel.latencyMs !== null ? `${row.channel.latencyMs}ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {matrixPageCount > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-[var(--ds-on-surface-variant)]">
                {t("showingEntries", { count: matrixSlice.length, total: matrixTotal })}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setMatrixPage((p) => Math.max(0, p - 1))}
                  disabled={matrixPage === 0}
                  className="px-3 py-1 rounded border border-[var(--ds-outline-variant)]/50 text-[var(--ds-on-surface-variant)] hover:bg-[var(--ds-surface-container)] disabled:opacity-40"
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
                      className={`px-3 py-1 rounded ${
                        page === matrixPage
                          ? "bg-[var(--ds-primary)] text-[var(--ds-on-primary)]"
                          : "border border-[var(--ds-outline-variant)]/50 text-[var(--ds-on-surface-variant)] hover:bg-[var(--ds-surface-container)]"
                      }`}
                    >
                      {page + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setMatrixPage((p) => Math.min(matrixPageCount - 1, p + 1))}
                  disabled={matrixPage >= matrixPageCount - 1}
                  className="px-3 py-1 rounded border border-[var(--ds-outline-variant)]/50 text-[var(--ds-on-surface-variant)] hover:bg-[var(--ds-surface-container)] disabled:opacity-40"
                >
                  {t("next")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ Footer ══════════ */}
      <div className="flex items-center gap-4 mt-6 text-xs text-[var(--ds-on-surface-variant)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: STATUS_CFG.ACTIVE.color }} />{" "}
          {t("active")}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: STATUS_CFG.DEGRADED.color }}
          />{" "}
          {t("degraded")}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: STATUS_CFG.DISABLED.color }}
          />{" "}
          {t("disabled")}
        </span>
        {lastSyncTime && (
          <span className="ml-auto">
            {t("lastSync")}: {new Date(lastSyncTime).toLocaleString()}
          </span>
        )}
      </div>

      {/* Sync result */}
      {lastSyncResult && (
        <div className="bg-[var(--ds-surface-container)] rounded-lg p-3 mt-2 text-xs text-[var(--ds-on-surface-variant)]">
          <span>{t("syncResult")}: </span>
          <span className="text-[#639922]">
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
                ✗ {p.providerName}: {p.error}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
