"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
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

interface LatencyStats {
  p50: number | null;
  p95: number | null;
  count: number;
}

interface ChannelRow {
  channelId: string;
  provider: string;
  providerName: string;
  model: string;
  modelDisplayName: string;
  modality: string;
  realModelId: string;
  status: string;
  priority: number;
  lastChecks: HealthCheck[];
  lastCheckedAt: string | null;
  consecutiveFailures: number;
  // BL-HEALTH-PROBE-LEAN F-HPL-03: real-traffic p50/p95 from call_logs.
  latency1h: LatencyStats;
  latency24h: LatencyStats;
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
// Helpers
// ============================================================

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-ds-secondary",
  DEGRADED: "bg-ds-tertiary",
  DISABLED: "bg-ds-error",
};

const STATUS_TEXT: Record<string, string> = {
  ACTIVE: "text-ds-secondary",
  DEGRADED: "text-ds-tertiary",
  DISABLED: "text-ds-error",
};

function aliasStatusSummary(g: AliasGroup) {
  if (g.disabledCount > 0) return "DISABLED";
  if (g.degradedCount > 0) return "DEGRADED";
  if (g.activeCount > 0) return "ACTIVE";
  return "NONE";
}

function fmtLatency(ms: number | null): string {
  if (ms == null) return "\u2014";
  return ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function checkBadge(level: string, result: string) {
  if (result === "PASS")
    return { bg: "bg-ds-secondary/10", text: "text-ds-secondary", icon: "check" };
  if (result === "FAIL") return { bg: "bg-ds-error/10", text: "text-ds-error", icon: "close" };
  return { bg: "bg-ds-outline-variant/10", text: "text-ds-outline", icon: "help" };
}

const LEVEL_LABELS: Record<string, string> = {
  API_REACHABILITY: "API",
  CONNECTIVITY: "L1",
  FORMAT: "L2",
  QUALITY: "L3",
};

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

  const { providers, modalities } = useMemo(() => {
    const pSet = new Set<string>();
    const mSet = new Set<string>();
    for (const g of data?.aliases ?? []) {
      mSet.add(g.modality);
      for (const ch of g.channels) {
        pSet.add(ch.provider);
      }
    }
    for (const ch of data?.orphans ?? []) {
      pSet.add(ch.provider);
      mSet.add(ch.modality);
    }
    return { providers: [...pSet].sort(), modalities: [...mSet].sort() };
  }, [data]);

  const filteredAliases = useMemo(() => {
    const groups = data?.aliases ?? [];
    return groups.filter((g) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          g.alias.toLowerCase().includes(q) ||
          g.brand?.toLowerCase().includes(q) ||
          g.channels.some(
            (ch) => ch.provider.toLowerCase().includes(q) || ch.model.toLowerCase().includes(q),
          );
        if (!match) return false;
      }
      if (filterModality && g.modality !== filterModality) return false;
      if (filterProvider && !g.channels.some((ch) => ch.provider === filterProvider)) return false;
      if (filterStatus) {
        if (filterStatus === "HIGH_RISK") return g.highRisk;
        if (aliasStatusSummary(g) !== filterStatus) return false;
      }
      return true;
    });
  }, [data, search, filterModality, filterProvider, filterStatus]);

  const filteredOrphans = useMemo(() => {
    const orphans = data?.orphans ?? [];
    return orphans.filter((ch) => {
      if (search) {
        const q = search.toLowerCase();
        if (!ch.provider.toLowerCase().includes(q) && !ch.model.toLowerCase().includes(q))
          return false;
      }
      if (filterModality && ch.modality !== filterModality) return false;
      if (filterProvider && ch.provider !== filterProvider) return false;
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

  if (loading && !data) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-14 rounded-full" />
        <Skeleton className="h-[400px] rounded-xl" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {/* ═══ 1. Top Overview Bar — 4 column stats ═══ */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Aliases */}
        <SectionCard className="transition-transform hover:scale-[1.02] cursor-default">
          <div className="text-ds-on-surface-variant font-medium mb-2 flex items-center justify-between text-xs">
            {t("totalAliases")}
            <span className="material-symbols-outlined text-ds-outline-variant text-sm">hub</span>
          </div>
          <div className="text-3xl font-black font-[var(--font-heading)] text-ds-on-surface">
            {summary.aliasCount}
          </div>
          <div className="mt-2 text-[10px] text-ds-secondary font-bold uppercase tracking-wider">
            {filteredAliases.filter((a) => a.enabled).length} {t("enabled")}
          </div>
        </SectionCard>
        {/* Total Channels */}
        <SectionCard className="transition-transform hover:scale-[1.02] cursor-default">
          <div className="text-ds-on-surface-variant font-medium mb-2 flex items-center justify-between text-xs">
            {t("totalChannels")}
            <span className="material-symbols-outlined text-ds-outline-variant text-sm">lan</span>
          </div>
          <div className="text-3xl font-black font-[var(--font-heading)] text-ds-on-surface">
            {summary.total}
          </div>
          <div className="mt-2 text-[10px] text-ds-secondary font-bold uppercase tracking-wider">
            {t("connectedInfra")}
          </div>
        </SectionCard>
        {/* Health Status */}
        <SectionCard className="transition-transform hover:scale-[1.02] cursor-default">
          <div className="text-ds-on-surface-variant font-medium mb-2 flex items-center justify-between text-xs">
            {t("healthStatus")}
            <span className="material-symbols-outlined text-ds-outline-variant text-sm">
              health_metrics
            </span>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black font-[var(--font-heading)] text-ds-secondary">
              {summary.active}
            </span>
            <span className="text-xs text-ds-on-surface-variant font-bold">
              / {summary.degraded} / {summary.disabled}
            </span>
          </div>
          <div className="mt-2 flex space-x-2">
            <span className="w-2 h-2 rounded-full bg-ds-secondary" />
            <span className="w-2 h-2 rounded-full bg-ds-tertiary" />
            <span className="w-2 h-2 rounded-full bg-ds-outline-variant" />
          </div>
        </SectionCard>
        {/* Avg Latency */}
        <SectionCard className="transition-transform hover:scale-[1.02] cursor-default">
          <div className="text-ds-on-surface-variant font-medium mb-2 flex items-center justify-between text-xs">
            {t("avgLatency")}
            <span className="material-symbols-outlined text-ds-outline-variant text-sm">speed</span>
          </div>
          <div className="text-3xl font-black font-[var(--font-heading)] text-ds-primary">
            {summary.avgLatency != null ? (
              <>
                {summary.avgLatency}
                <span className="text-sm font-bold ml-1">ms</span>
              </>
            ) : (
              "\u2014"
            )}
          </div>
        </SectionCard>
      </section>

      {/* ═══ 2. Filter Bar — capsule container ═══ */}
      <section className="bg-ds-surface-container-low p-3 rounded-full flex items-center gap-4">
        <div className="flex-1 relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-ds-outline text-lg">
            search
          </span>
          <input
            className="w-full bg-ds-surface-container-lowest border-none rounded-full py-2.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-ds-primary/20 text-ds-on-surface placeholder:text-ds-outline outline-none"
            placeholder={t("searchPlaceholder")}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="bg-ds-surface-container-lowest border-none rounded-full py-2 px-4 text-xs font-semibold text-ds-on-surface-variant focus:ring-0 cursor-pointer hover:bg-ds-surface-container-high outline-none"
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
            className="bg-ds-surface-container-lowest border-none rounded-full py-2 px-4 text-xs font-semibold text-ds-on-surface-variant focus:ring-0 cursor-pointer hover:bg-ds-surface-container-high outline-none"
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
            className="bg-ds-surface-container-lowest border-none rounded-full py-2 px-4 text-xs font-semibold text-ds-on-surface-variant focus:ring-0 cursor-pointer hover:bg-ds-surface-container-high outline-none"
          >
            <option value="">{t("allStatuses")}</option>
            <option value="ACTIVE">{t("active")}</option>
            <option value="DEGRADED">{t("degraded")}</option>
            <option value="DISABLED">{t("disabled")}</option>
            <option value="HIGH_RISK">{t("highRiskOnly")}</option>
          </select>
          <button
            onClick={() => refetch()}
            className="w-10 h-10 flex items-center justify-center bg-ds-surface-container-lowest rounded-full hover:bg-ds-surface-container-high text-ds-on-surface-variant transition-transform active:rotate-180 duration-500"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
          </button>
        </div>
      </section>

      {/* ═══ 3. Alias Grouped List ═══ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-ds-on-surface-variant">
            {t("modelAliases")}
          </h2>
        </div>

        {filteredAliases.map((g) => {
          const isExpanded = expanded.has(g.aliasId);
          const overallStatus = aliasStatusSummary(g);
          const statusDot = STATUS_DOT[overallStatus] ?? "bg-ds-outline-variant";
          const statusText = STATUS_TEXT[overallStatus] ?? "text-ds-outline-variant";

          return (
            <SectionCard
              key={g.aliasId}
              className={`overflow-hidden transition-all [&>div]:p-0 ${
                isExpanded ? "border-l-4 border-ds-primary" : ""
              }`}
            >
              {/* Alias Header */}
              <button
                onClick={() => toggleExpand(g.aliasId)}
                className="w-full text-left flex items-center p-5 gap-6 hover:bg-ds-surface-container-low/30 transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-ds-surface-container-low flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-ds-primary">model_training</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold font-[var(--font-heading)] truncate">
                    {g.alias}
                  </div>
                  <div className="text-xs text-ds-on-surface-variant">
                    {g.brand ?? g.modality}
                    {!g.enabled && (
                      <span className="ml-2 text-ds-outline">({t("disabledAlias")})</span>
                    )}
                  </div>
                </div>
                {/* Health badge */}
                <div className="text-center px-4 flex-shrink-0">
                  <div className="text-[9px] text-ds-on-surface-variant uppercase font-bold tracking-tighter mb-1">
                    {t("healthLabel")}
                  </div>
                  <div className="flex items-center justify-center space-x-1.5">
                    <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                    <span className={`text-xs font-bold ${statusText}`}>{overallStatus}</span>
                  </div>
                </div>
                {/* Channels count */}
                <div className="text-center px-4 flex-shrink-0">
                  <div className="text-[9px] text-ds-on-surface-variant uppercase font-bold tracking-tighter mb-1">
                    {t("channelsLabel")}
                  </div>
                  <div className="text-sm font-bold text-ds-on-surface">
                    {g.activeCount}/{g.channelCount}
                  </div>
                </div>
                {/* Avg Latency */}
                <div className="text-center px-4 flex-shrink-0">
                  <div className="text-[9px] text-ds-on-surface-variant uppercase font-bold tracking-tighter mb-1">
                    {t("avgLatencyShort")}
                  </div>
                  <div className="text-sm font-bold text-ds-on-surface">
                    {fmtLatency(g.avgLatency)}
                  </div>
                </div>
                {/* High risk */}
                {g.highRisk && (
                  <span className="text-xs font-bold text-ds-error bg-ds-error/10 px-2 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
                    <span className="material-symbols-outlined text-xs">warning</span>
                    {t("highRiskLabel")}
                  </span>
                )}
                {/* Expand arrow */}
                <div className="ml-4 flex-shrink-0">
                  <span
                    className={`material-symbols-outlined text-ds-on-surface-variant group-hover:text-ds-primary transition-all ${isExpanded ? "rotate-180" : ""}`}
                  >
                    expand_more
                  </span>
                </div>
              </button>

              {/* Expanded Channel Rows */}
              {isExpanded && (
                <div className="bg-ds-surface-container-low/30 px-6 py-2 space-y-2">
                  {g.channels.map((ch) => (
                    <ChannelListRow
                      key={ch.channelId}
                      ch={ch}
                      checking={checking}
                      onCheck={runCheck}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          );
        })}
      </section>

      {/* ═══ 4. Orphan Channels ═══ */}
      {filteredOrphans.length > 0 && (
        <section className="space-y-4 pt-4">
          <div className="flex items-center gap-2 px-4">
            <span className="material-symbols-outlined text-ds-on-surface-variant">link_off</span>
            <h2 className="text-sm font-black uppercase tracking-widest text-ds-on-surface-variant">
              {t("orphanChannels")}
            </h2>
          </div>
          {filteredOrphans.map((ch) => (
            <SectionCard
              key={ch.channelId}
              className="hover:ring-1 hover:ring-ds-error/10 transition-all"
            >
              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <div className="font-mono text-sm text-ds-on-surface-variant bg-ds-surface-container-low inline-block px-3 py-1 rounded">
                    {ch.realModelId}
                  </div>
                  <div className="text-xs text-ds-on-surface-variant mt-1">
                    {ch.provider} &middot; {t("unassigned")}
                  </div>
                </div>
                <div className="text-center px-4 flex-shrink-0">
                  <div className="text-[9px] text-ds-on-surface-variant uppercase font-bold tracking-tighter mb-1">
                    {t("statusLabel")}
                  </div>
                  <div className="flex items-center justify-center space-x-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${STATUS_DOT[ch.status] ?? "bg-ds-outline-variant"}`}
                    />
                    <span className="text-xs font-bold text-ds-on-surface-variant">
                      {ch.status}
                    </span>
                  </div>
                </div>
                <div className="text-center px-4 flex-shrink-0">
                  <div className="text-[9px] text-ds-on-surface-variant uppercase font-bold tracking-tighter mb-1">
                    {t("lastCheck")}
                  </div>
                  <div className="text-sm font-bold">
                    {ch.lastCheckedAt ? timeAgo(ch.lastCheckedAt) : "\u2014"}
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <a
                    href="/admin/model-aliases"
                    className="text-ds-primary text-xs font-bold bg-ds-primary-container/20 px-4 py-2 rounded-full hover:bg-ds-primary-container/30 transition-colors"
                  >
                    {t("assignAlias")}
                  </a>
                </div>
              </div>
            </SectionCard>
          ))}
        </section>
      )}
    </PageContainer>
  );
}

// ============================================================
// Channel List Row (design draft: inline row, not card)
// ============================================================

function ChannelListRow({
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

  // Determine if this channel only has API_REACHABILITY checks
  const hasReachability = ch.lastChecks.some((c) => c.level === "API_REACHABILITY");
  const hasFullChecks = ch.lastChecks.some(
    (c) => c.level === "CONNECTIVITY" || c.level === "FORMAT" || c.level === "QUALITY",
  );

  return (
    <div className="flex items-center py-4 gap-6 hover:bg-white/50 rounded-lg px-2 transition-colors">
      {/* Model ID */}
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-ds-on-surface-variant bg-white inline-block px-2 py-1 rounded">
          {ch.realModelId}
        </div>
        <div className="text-[10px] text-ds-on-surface-variant mt-1">
          {t("providerLabel")}: {ch.provider}
        </div>
      </div>

      {/* Check level badges */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {hasReachability && !hasFullChecks
          ? // API_REACHABILITY only — single badge
            (() => {
              const c = ch.lastChecks.find((x) => x.level === "API_REACHABILITY");
              const badge = checkBadge("API_REACHABILITY", c?.result ?? "");
              return (
                <div
                  className={`flex items-center space-x-1 ${badge.bg} ${badge.text} text-[10px] font-bold px-2 py-0.5 rounded`}
                >
                  <span>{LEVEL_LABELS.API_REACHABILITY}</span>
                  <span className="material-symbols-outlined text-xs">{badge.icon}</span>
                </div>
              );
            })()
          : // Full L1/L2/L3 badges
            (["CONNECTIVITY", "FORMAT", "QUALITY"] as const).map((level) => {
              const c = ch.lastChecks.find((x) => x.level === level);
              const badge = checkBadge(level, c?.result ?? "");
              return (
                <div
                  key={level}
                  className={`flex items-center space-x-1 ${badge.bg} ${badge.text} text-[10px] font-bold px-2 py-0.5 rounded`}
                >
                  <span>{LEVEL_LABELS[level]}</span>
                  <span className="material-symbols-outlined text-xs">{badge.icon}</span>
                </div>
              );
            })}
      </div>

      {/* Latency + time — BL-HEALTH-PROBE-LEAN F-HPL-03: real-traffic
          p50/p95 from call_logs (last 1h). Probe latency fallback shown
          when there was no traffic. */}
      <div className="text-center w-28 flex-shrink-0">
        {ch.latency1h.count > 0 ? (
          <>
            <div className="text-sm font-bold">p50 {fmtLatency(ch.latency1h.p50)}</div>
            <div className="text-[10px] text-ds-on-surface-variant">
              p95 {fmtLatency(ch.latency1h.p95)} · {ch.latency1h.count} calls/1h
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-bold text-ds-outline">
              {latency != null ? fmtLatency(latency) : "N/A"}
            </div>
            <div className="text-[10px] text-ds-on-surface-variant">
              {ch.latency1h.count === 0
                ? "no traffic"
                : ch.lastCheckedAt
                  ? timeAgo(ch.lastCheckedAt)
                  : "\u2014"}
            </div>
          </>
        )}
      </div>

      {/* Run Check */}
      <div className="w-24 flex justify-end flex-shrink-0">
        <button
          disabled={checking === ch.channelId}
          onClick={() => onCheck(ch.channelId)}
          className="text-ds-primary text-[11px] font-bold hover:underline disabled:opacity-50"
        >
          {checking === ch.channelId ? "..." : t("manualCheck")}
        </button>
      </div>
    </div>
  );
}
