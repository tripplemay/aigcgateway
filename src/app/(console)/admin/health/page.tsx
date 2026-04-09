"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface HealthChannel {
  channelId: string;
  provider: string;
  model: string;
  status: string;
  priority: number;
  modality: string;
  lastChecks: Array<{ level: string; result: string; latencyMs: number | null; createdAt: string }>;
}
interface HealthResponse {
  summary: { active: number; degraded: number; disabled: number; total: number };
  data: HealthChannel[];
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

function latencyColor(status: string) {
  if (status === "ACTIVE") return "text-ds-primary";
  if (status === "DEGRADED") return "text-amber-600";
  return "text-rose-600";
}

// ============================================================
// Page
// ============================================================

export default function HealthPage() {
  const t = useTranslations("adminHealth");
  const [checking, setChecking] = useState<string | null>(null);

  const { data, loading, refetch } = useAsyncData<HealthResponse>(
    () => apiFetch<HealthResponse>("/api/admin/health"),
    [],
  );

  const summary = useMemo(
    () => data?.summary ?? { active: 0, degraded: 0, disabled: 0, total: 0 },
    [data],
  );
  const channels = data?.data ?? [];

  const runCheck = async (channelId: string) => {
    setChecking(channelId);
    try {
      await apiFetch(`/api/admin/health/${channelId}/check`, { method: "POST" });
      toast.success(t("check"));
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setChecking(null);
  };

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
      {/* ═══ Summary Dashboard (Bento) — code.html lines 161-220 ═══ */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Main status card — lines 162-181 */}
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
                <span className="text-2xl font-[var(--font-heading)] font-bold text-ds-primary">
                  —
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* Quick Stats Column — lines 183-220 */}
        <div className="col-span-12 lg:col-span-4 grid grid-cols-1 gap-4">
          {[
            {
              value: summary.active,
              label: t("activeModels"),
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
              value: summary.disabled,
              label: t("disabledNodes"),
              dotColor: "bg-rose-50",
              textColor: "text-rose-600",
              icon: "cancel",
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

      {/* ═══ Section Header — code.html lines 222-234 ═══ */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-[var(--font-heading)] text-xl font-bold">{t("infrastructureNodes")}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="bg-ds-surface-container-lowest px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            {t("syncAll")}
          </button>
        </div>
      </div>

      {/* ═══ Channel Cards Grid — code.html lines 236-449 ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {channels.map((ch) => {
          const latency = ch.lastChecks[0]?.latencyMs;
          return (
            <div
              key={ch.channelId}
              className="bg-ds-surface-container-lowest rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="p-6">
                {/* Header: model name + latency */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[ch.status] ?? "bg-gray-400"} ${ch.status === "ACTIVE" ? "animate-pulse" : ""}`}
                    />
                    <div>
                      <h4 className="font-[var(--font-heading)] font-bold text-lg leading-tight">
                        {ch.model}
                      </h4>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">
                        {ch.provider}
                      </p>
                    </div>
                  </div>
                  <div className="bg-slate-50 px-3 py-1 rounded-full flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined text-[14px] ${latencyColor(ch.status)}`}
                    >
                      timer
                    </span>
                    <span className={`text-xs font-bold ${latencyColor(ch.status)}`}>
                      {latency != null ? `${latency}ms` : "—"}
                    </span>
                  </div>
                </div>

                {/* L1/L2/L3 Check Grid */}
                <div className="grid grid-cols-3 gap-2 mb-6">
                  {CHECK_LEVELS.map((level, i) => {
                    const c = ch.lastChecks.find((x) => x.level === level);
                    const s = checkStyle(c?.result);
                    return (
                      <div
                        key={level}
                        className={`${s.bg} border p-2.5 rounded-lg flex flex-col items-center`}
                      >
                        <span className={`text-[10px] font-bold ${s.text} uppercase mb-1`}>
                          {t(CHECK_LABEL_KEYS[i])}
                        </span>
                        <span className={`material-symbols-outlined ${s.iconColor} text-[18px]`}>
                          {s.icon}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Footer: priority + manual check */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    {t("priority")}{" "}
                    <span className="text-ds-on-surface font-bold">P{ch.priority}</span>
                  </span>
                  <button
                    disabled={checking === ch.channelId}
                    onClick={() => runCheck(ch.channelId)}
                    className="text-xs font-bold text-ds-primary flex items-center gap-1 hover:underline disabled:opacity-50"
                  >
                    {checking === ch.channelId ? "..." : t("manualCheck")}
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
                </div>
              </div>

              {/* Card bottom bar */}
              <div className="bg-slate-50/50 px-6 py-3 flex items-center justify-between">
                {ch.lastChecks[0] && (
                  <span className="text-[10px] font-bold text-slate-400">
                    {timeAgo(ch.lastChecks[0].createdAt)}
                  </span>
                )}
                <div className="flex -space-x-1">
                  {ch.lastChecks.slice(0, 3).map((c, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full ${c.result === "PASS" ? "bg-emerald-400" : c.result === "FAIL" ? "bg-rose-400" : "bg-amber-400"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
