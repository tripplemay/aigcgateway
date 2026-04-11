"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/search-bar";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface HealthCheck {
  level: string;
  result: string;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

interface ChannelRow {
  channelId: string;
  provider: string;
  providerName: string;
  model: string;
  modelDisplayName: string;
  modality: string;
  status: string;
  priority: number;
  lastChecks: HealthCheck[];
  lastCheckedAt: string | null;
  consecutiveFailures: number;
}

interface AliasGroup {
  aliasId: string;
  alias: string;
  brand: string | null;
  modality: string;
  enabled: boolean;
  channelCount: number;
  activeCount: number;
  degradedCount: number;
  disabledCount: number;
  avgLatency: number | null;
  highRisk: boolean;
  channels: ChannelRow[];
}

interface HealthResponse {
  summary: {
    active: number;
    degraded: number;
    disabled: number;
    total: number;
    avgLatency: number | null;
    aliasCount: number;
    highRiskCount: number;
  };
  aliases: AliasGroup[];
  orphans: ChannelRow[];
}

// ============================================================
// Constants
// ============================================================

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-emerald-500",
  DEGRADED: "bg-amber-500",
  DISABLED: "bg-rose-500",
};

const CHECK_LEVELS = ["CONNECTIVITY", "FORMAT", "QUALITY"] as const;
const CHECK_LABEL_KEYS = ["l1Connect", "l2Format", "l3Quality"] as const;

function checkStyle(result: string | undefined) {
  if (result === "PASS")
    return {
      bg: "bg-emerald-50/50 border-emerald-100/30",
      text: "text-emerald-700",
      icon: "check_circle",
      iconColor: "text-emerald-600",
    };
  if (result === "FAIL")
    return {
      bg: "bg-rose-50/50 border-rose-100/30",
      text: "text-rose-700",
      icon: "cancel",
      iconColor: "text-rose-600",
    };
  return {
    bg: "bg-slate-50 border-slate-200/30",
    text: "text-slate-400",
    icon: "pending",
    iconColor: "text-slate-400",
  };
}

function latencyColor(ms: number | null) {
  if (ms == null) return "text-slate-400";
  if (ms < 1000) return "text-emerald-600";
  if (ms < 3000) return "text-amber-600";
  return "text-rose-600";
}

function aliasStatusSummary(g: AliasGroup) {
  if (g.disabledCount > 0) return "DISABLED";
  if (g.degradedCount > 0) return "DEGRADED";
  if (g.activeCount > 0) return "ACTIVE";
  return "NONE";
}

// ============================================================
// Page
// ============================================================

export default function HealthPage() {
  const t = useTranslations("adminHealth");
  const [checking, setChecking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterModality, setFilterModality] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const { data, loading, refetch } = useAsyncData<HealthResponse>(
    () => apiFetch<HealthResponse>("/api/admin/health"),
    [],
  );

  const summary = useMemo(
    () =>
      data?.summary ?? {
        active: 0,
        degraded: 0,
        disabled: 0,
        total: 0,
        avgLatency: null,
        aliasCount: 0,
        highRiskCount: 0,
      },
    [data],
  );

  // Collect unique providers and modalities for filters
  const { providers, modalities } = useMemo(() => {
    const pSet = new Set<string>();
    const mSet = new Set<string>();
    for (const g of data?.aliases ?? []) {
      mSet.add(g.modality);
      for (const ch of g.channels) {
        pSet.add(ch.providerName);
      }
    }
    for (const ch of data?.orphans ?? []) {
      pSet.add(ch.providerName);
      mSet.add(ch.modality);
    }
    return {
      providers: [...pSet].sort(),
      modalities: [...mSet].sort(),
    };
  }, [data]);

  // Filter aliases
  const filteredAliases = useMemo(() => {
    const groups = data?.aliases ?? [];
    return groups.filter((g) => {
      // search
      if (search) {
        const q = search.toLowerCase();
        const matchAlias = g.alias.toLowerCase().includes(q);
        const matchBrand = g.brand?.toLowerCase().includes(q);
        const matchChannel = g.channels.some(
          (ch) => ch.provider.toLowerCase().includes(q) || ch.model.toLowerCase().includes(q),
        );
        if (!matchAlias && !matchBrand && !matchChannel) return false;
      }
      // modality
      if (filterModality && g.modality !== filterModality) return false;
      // provider
      if (filterProvider) {
        const hasProvider = g.channels.some((ch) => ch.providerName === filterProvider);
        if (!hasProvider) return false;
      }
      // status
      if (filterStatus) {
        if (filterStatus === "HIGH_RISK") return g.highRisk;
        const status = aliasStatusSummary(g);
        if (filterStatus !== status) return false;
      }
      return true;
    });
  }, [data, search, filterModality, filterProvider, filterStatus]);

  // Filter orphans
  const filteredOrphans = useMemo(() => {
    const orphans = data?.orphans ?? [];
    return orphans.filter((ch) => {
      if (search) {
        const q = search.toLowerCase();
        if (!ch.provider.toLowerCase().includes(q) && !ch.model.toLowerCase().includes(q))
          return false;
      }
      if (filterModality && ch.modality !== filterModality) return false;
      if (filterProvider && ch.providerName !== filterProvider) return false;
      if (filterStatus) {
        if (filterStatus === "HIGH_RISK") return false;
        if (ch.status !== filterStatus) return false;
      }
      return true;
    });
  }, [data, search, filterModality, filterProvider, filterStatus]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runCheck = async (channelId: string) => {
    setChecking(channelId);
    try {
      await apiFetch(`/api/admin/health/${channelId}/check`, { method: "POST" });
      toast.success(t("checkDone"));
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setChecking(null);
  };

  // ── Loading skeleton ──
  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pt-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-12 gap-6">
          <Skeleton className="col-span-8 h-[180px] rounded-xl" />
          <div className="col-span-4 space-y-4">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Summary Dashboard (Bento) ═══ */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Main status card */}
        <div className="col-span-12 lg:col-span-8">
          <div className="bg-ds-surface-container-lowest rounded-xl p-8 flex flex-col justify-between min-h-[180px] shadow-sm relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-ds-primary/5 rounded-full blur-3xl" />
            <div>
              <h2 className="font-[var(--font-heading)] text-3xl font-extrabold tracking-tight mb-2">
                {t("title")}
              </h2>
              <p className="text-ds-on-surface-variant max-w-md">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-8 mt-6">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                  {t("totalAliases")}
                </span>
                <span className="text-2xl font-[var(--font-heading)] font-bold">
                  {summary.aliasCount}
                </span>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                  {t("totalChannels")}
                </span>
                <span className="text-2xl font-[var(--font-heading)] font-bold">
                  {summary.total}
                </span>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                  {t("avgLatency")}
                </span>
                <span
                  className={`text-2xl font-[var(--font-heading)] font-bold ${latencyColor(summary.avgLatency)}`}
                >
                  {summary.avgLatency != null ? `${summary.avgLatency.toLocaleString()}ms` : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* Quick Stats Column */}
        <div className="col-span-12 lg:col-span-4 grid grid-cols-1 gap-4">
          {[
            {
              value: summary.active,
              label: t("activeChannels"),
              dotColor: "bg-emerald-50",
              textColor: "text-emerald-600",
              icon: "check_circle",
              badge: t("badgeHealthy"),
              badgeColor: "text-emerald-500 bg-emerald-50",
            },
            {
              value: summary.degraded,
              label: t("degradedState"),
              dotColor: "bg-amber-50",
              textColor: "text-amber-600",
              icon: "warning",
              badge: t("badgeChecking"),
              badgeColor: "text-amber-500 bg-amber-50",
            },
            {
              value: summary.highRiskCount,
              label: t("highRisk"),
              dotColor: "bg-rose-50",
              textColor: "text-rose-600",
              icon: "error",
              badge: t("badgeAlert"),
              badgeColor: "text-rose-500 bg-rose-50",
            },
          ].map((c) => (
            <div
              key={c.label}
              className="bg-ds-surface-container-lowest rounded-xl p-5 flex items-center gap-4 shadow-sm"
            >
              <div
                className={`w-12 h-12 rounded-full ${c.dotColor} ${c.textColor} flex items-center justify-center`}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {c.icon}
                </span>
              </div>
              <div>
                <div className="text-2xl font-[var(--font-heading)] font-bold">{c.value}</div>
                <div className="text-xs font-bold text-slate-400 uppercase">{c.label}</div>
              </div>
              <div className="ml-auto">
                <span className={`text-xs font-bold px-2 py-1 rounded ${c.badgeColor}`}>
                  {c.badge}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Search & Filters ═══ */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={setSearch}
          className="w-64"
        />
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="text-sm rounded-lg bg-ds-surface-container-low border-none py-2 px-3 outline-none focus:ring-2 focus:ring-ds-primary/20"
        >
          <option value="">{t("allProviders")}</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={filterModality}
          onChange={(e) => setFilterModality(e.target.value)}
          className="text-sm rounded-lg bg-ds-surface-container-low border-none py-2 px-3 outline-none focus:ring-2 focus:ring-ds-primary/20"
        >
          <option value="">{t("allModalities")}</option>
          {modalities.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm rounded-lg bg-ds-surface-container-low border-none py-2 px-3 outline-none focus:ring-2 focus:ring-ds-primary/20"
        >
          <option value="">{t("allStatuses")}</option>
          <option value="ACTIVE">{t("active")}</option>
          <option value="DEGRADED">{t("degraded")}</option>
          <option value="DISABLED">{t("disabled")}</option>
          <option value="HIGH_RISK">{t("highRiskOnly")}</option>
        </select>
        <div className="ml-auto">
          <button
            onClick={() => refetch()}
            className="bg-ds-surface-container-lowest px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            {t("syncAll")}
          </button>
        </div>
      </div>

      {/* ═══ Alias Groups ═══ */}
      <div className="space-y-3">
        {filteredAliases.map((g) => {
          const isExpanded = expanded.has(g.aliasId);
          const overallStatus = aliasStatusSummary(g);
          return (
            <div
              key={g.aliasId}
              className={`bg-ds-surface-container-lowest rounded-xl overflow-hidden shadow-sm transition-shadow ${
                g.highRisk
                  ? "border-l-4 border-rose-400"
                  : isExpanded
                    ? "border-l-4 border-ds-primary"
                    : ""
              }`}
            >
              {/* Collapsed row */}
              <button
                onClick={() => toggleExpand(g.aliasId)}
                className="w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors"
              >
                {/* Status dot */}
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[overallStatus] ?? "bg-gray-400"} ${overallStatus === "ACTIVE" ? "animate-pulse" : ""}`}
                />
                {/* Alias name */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-[var(--font-heading)] font-bold text-base truncate">
                      {g.alias}
                    </span>
                    {g.brand && (
                      <span className="text-xs text-ds-on-surface-variant bg-ds-surface-container-low px-2 py-0.5 rounded-full">
                        {g.brand}
                      </span>
                    )}
                    <span className="text-xs text-ds-on-surface-variant bg-ds-surface-container-low px-2 py-0.5 rounded-full">
                      {g.modality}
                    </span>
                    {!g.enabled && (
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {t("disabledAlias")}
                      </span>
                    )}
                    {g.highRisk && (
                      <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[12px]">warning</span>
                        {t("highRiskLabel")}
                      </span>
                    )}
                  </div>
                </div>
                {/* Stats */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-xs text-ds-on-surface-variant">
                    {g.activeCount}/{g.channelCount} {t("channelsActive")}
                  </span>
                  <span className={`text-xs font-bold ${latencyColor(g.avgLatency)}`}>
                    {g.avgLatency != null ? `${g.avgLatency.toLocaleString()}ms` : "—"}
                  </span>
                  <span
                    className={`material-symbols-outlined text-[20px] text-ds-on-surface-variant transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  >
                    expand_more
                  </span>
                </div>
              </button>

              {/* Expanded channels */}
              {isExpanded && (
                <div className="px-6 pb-5 pt-1 border-t border-slate-100/60">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
                    {g.channels.map((ch) => (
                      <ChannelCard
                        key={ch.channelId}
                        ch={ch}
                        checking={checking}
                        onCheck={runCheck}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ Orphan Channels ═══ */}
      {filteredOrphans.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-amber-500 text-[20px]">link_off</span>
            <h3 className="font-[var(--font-heading)] text-lg font-bold">{t("orphanChannels")}</h3>
            <span className="text-xs text-ds-on-surface-variant bg-ds-surface-container-low px-2 py-0.5 rounded-full">
              {filteredOrphans.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredOrphans.map((ch) => (
              <ChannelCard
                key={ch.channelId}
                ch={ch}
                checking={checking}
                onCheck={runCheck}
                t={t}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Channel Card (extracted for reuse in alias groups + orphans)
// ============================================================

function ChannelCard({
  ch,
  checking,
  onCheck,
  t,
}: {
  ch: ChannelRow;
  checking: string | null;
  onCheck: (id: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const latency = ch.lastChecks[0]?.latencyMs ?? null;

  return (
    <div className="bg-ds-surface-container-lowest rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-slate-100/40">
      <div className="p-5">
        {/* Header: model name + latency */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2 h-2 rounded-full ${STATUS_DOT[ch.status] ?? "bg-gray-400"} ${ch.status === "ACTIVE" ? "animate-pulse" : ""}`}
            />
            <div>
              <h4 className="font-[var(--font-heading)] font-bold text-sm leading-tight">
                {ch.model}
              </h4>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                {ch.provider}
              </p>
            </div>
          </div>
          <div className="bg-slate-50 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-[13px] ${latencyColor(latency)}`}>
              timer
            </span>
            <span className={`text-[11px] font-bold ${latencyColor(latency)}`}>
              {latency != null ? `${latency}ms` : "—"}
            </span>
          </div>
        </div>

        {/* L1/L2/L3 Check Grid */}
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {CHECK_LEVELS.map((level, i) => {
            const c = ch.lastChecks.find((x) => x.level === level);
            const s = checkStyle(c?.result);
            const hasError = c?.result === "FAIL" && c?.errorMessage;
            return (
              <div
                key={level}
                className={`${s.bg} border p-2 rounded-lg flex flex-col items-center relative group`}
              >
                <span className={`text-[9px] font-bold ${s.text} uppercase mb-0.5`}>
                  {t(CHECK_LABEL_KEYS[i])}
                </span>
                <span className={`material-symbols-outlined ${s.iconColor} text-[16px]`}>
                  {s.icon}
                </span>
                {/* Error tooltip */}
                {hasError && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 max-w-[200px] whitespace-normal shadow-lg">
                      {c.errorMessage}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer: priority + manual check */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-500">
            P{ch.priority}
            {ch.consecutiveFailures > 0 && (
              <span className="text-rose-500 ml-2">
                {ch.consecutiveFailures}x {t("fail")}
              </span>
            )}
          </span>
          <button
            disabled={checking === ch.channelId}
            onClick={() => onCheck(ch.channelId)}
            className="text-[11px] font-bold text-ds-primary flex items-center gap-0.5 hover:underline disabled:opacity-50"
          >
            {checking === ch.channelId ? "..." : t("manualCheck")}
            <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Card bottom bar */}
      <div className="bg-slate-50/50 px-5 py-2 flex items-center justify-between">
        {ch.lastChecks[0] && (
          <span className="text-[10px] font-bold text-slate-400">
            {timeAgo(ch.lastChecks[0].createdAt)}
          </span>
        )}
        <div className="flex -space-x-1">
          {ch.lastChecks.slice(0, 3).map((c, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full ${c.result === "PASS" ? "bg-emerald-400" : c.result === "FAIL" ? "bg-rose-400" : "bg-amber-400"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
