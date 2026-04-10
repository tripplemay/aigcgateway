"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface ProviderSyncResult {
  providerName: string;
  success: boolean;
  error?: string;
  apiModels: number;
  aiEnriched: number;
  overrides: number;
  newModels: string[];
  newChannels: string[];
  disabledChannels: string[];
  modelCount: number;
}

interface SyncResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  providers: ProviderSyncResult[];
  summary: {
    totalNewModels: number;
    totalNewChannels: number;
    totalDisabledChannels: number;
    totalFailedProviders: number;
  };
}

interface InferenceResult {
  timestamp: string;
  classify: { classified: number; newAliases: number; skipped: number; errors: string[] };
  brand: { updated: number; skipped: number; errors: string[] };
  capabilities: { updated: number; skipped: number; errors: string[] };
}

interface SyncStatusResponse {
  data: {
    lastSyncTime: string | null;
    lastSyncResultDetail: SyncResult | null;
    zeroPriceActiveChannels: number;
    lastSyncAt: string | null;
    lastSyncDuration: number | null;
    lastSyncResult: "success" | "partial" | "failed" | null;
    lastInferenceResult: InferenceResult | null;
  };
}

// ============================================================
// Page
// ============================================================

export default function OperationsPage() {
  const t = useTranslations("adminOps");
  const [syncing, setSyncing] = useState(false);
  const [inferring, setInferring] = useState(false);

  const { data, loading, refetch } = useAsyncData<SyncStatusResponse>(
    () => apiFetch<SyncStatusResponse>("/api/admin/sync-status"),
    [],
  );

  const status = data?.data ?? null;
  const syncResult = status?.lastSyncResultDetail ?? null;
  const inferResult = status?.lastInferenceResult ?? null;

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await apiFetch("/api/admin/sync-models", { method: "POST" });
      toast.success(t("syncStarted"));
      // Poll after a delay for updated status
      setTimeout(() => refetch(), 5000);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSyncing(false);
  };

  const triggerInference = async () => {
    setInferring(true);
    try {
      await apiFetch("/api/admin/run-inference", { method: "POST" });
      toast.success(t("inferenceComplete"));
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setInferring(false);
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pt-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-[300px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
        </div>
        <Skeleton className="h-[200px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Header ═══ */}
      <div className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-ds-primary/5 rounded-full blur-3xl" />
        <h2 className="font-[var(--font-heading)] text-3xl font-extrabold tracking-tight mb-2">
          {t("title")}
        </h2>
        <p className="text-ds-on-surface-variant max-w-lg">{t("subtitle")}</p>
      </div>

      {/* ═══ Two-column: Sync + Inference ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Sync Panel ── */}
        <div className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  sync
                </span>
              </div>
              <div>
                <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("syncTitle")}</h3>
                <p className="text-xs text-ds-on-surface-variant">{t("syncDesc")}</p>
              </div>
            </div>
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="bg-gradient-to-r from-ds-primary to-ds-primary/80 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              {syncing ? t("syncing") : t("runSync")}
            </button>
          </div>

          <div className="px-6 pb-5 space-y-4">
            {/* Last sync info */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label={t("lastSync")}
                value={status?.lastSyncAt ? timeAgo(status.lastSyncAt) : "—"}
              />
              <StatCard
                label={t("duration")}
                value={status?.lastSyncDuration != null ? `${status.lastSyncDuration}s` : "—"}
              />
              <StatCard
                label={t("result")}
                value={status?.lastSyncResult ?? "—"}
                valueColor={
                  status?.lastSyncResult === "success"
                    ? "text-emerald-600"
                    : status?.lastSyncResult === "partial"
                      ? "text-amber-600"
                      : status?.lastSyncResult === "failed"
                        ? "text-rose-600"
                        : undefined
                }
              />
            </div>

            {/* Sync summary */}
            {syncResult && (
              <div className="grid grid-cols-4 gap-3">
                <StatCard
                  label={t("newModels")}
                  value={String(syncResult.summary.totalNewModels)}
                />
                <StatCard
                  label={t("newChannels")}
                  value={String(syncResult.summary.totalNewChannels)}
                />
                <StatCard
                  label={t("disabledChannels")}
                  value={String(syncResult.summary.totalDisabledChannels)}
                />
                <StatCard
                  label={t("failedProviders")}
                  value={String(syncResult.summary.totalFailedProviders)}
                  valueColor={syncResult.summary.totalFailedProviders > 0 ? "text-rose-600" : undefined}
                />
              </div>
            )}

            {/* Per-provider details */}
            {syncResult && syncResult.providers.length > 0 && (
              <div className="bg-slate-50/50 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 uppercase tracking-wider">
                      <th className="px-4 py-2 font-bold">{t("provider")}</th>
                      <th className="px-4 py-2 font-bold">{t("status")}</th>
                      <th className="px-4 py-2 font-bold text-right">{t("models")}</th>
                      <th className="px-4 py-2 font-bold text-right">{t("apiCount")}</th>
                      <th className="px-4 py-2 font-bold text-right">{t("aiEnriched")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncResult.providers.map((p) => (
                      <tr key={p.providerName} className="border-t border-slate-100/60">
                        <td className="px-4 py-2.5 font-semibold">{p.providerName}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                              p.success
                                ? "text-emerald-600 bg-emerald-50"
                                : "text-rose-600 bg-rose-50"
                            }`}
                          >
                            {p.success ? "OK" : "FAIL"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold">{p.modelCount}</td>
                        <td className="px-4 py-2.5 text-right">{p.apiModels}</td>
                        <td className="px-4 py-2.5 text-right">{p.aiEnriched}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Zero-price warning */}
            {(status?.zeroPriceActiveChannels ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2.5 rounded-lg text-xs font-semibold">
                <span className="material-symbols-outlined text-[16px]">warning</span>
                {t("zeroPriceWarning", { count: status!.zeroPriceActiveChannels })}
              </div>
            )}
          </div>
        </div>

        {/* ── Inference Panel ── */}
        <div className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  psychology
                </span>
              </div>
              <div>
                <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("inferTitle")}</h3>
                <p className="text-xs text-ds-on-surface-variant">{t("inferDesc")}</p>
              </div>
            </div>
            <button
              onClick={triggerInference}
              disabled={inferring}
              className="bg-gradient-to-r from-violet-600 to-violet-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              {inferring ? t("inferring") : t("runInference")}
            </button>
          </div>

          <div className="px-6 pb-5 space-y-4">
            {/* Last inference time */}
            <StatCard
              label={t("lastInference")}
              value={inferResult?.timestamp ? timeAgo(inferResult.timestamp) : "—"}
            />

            {inferResult && (
              <>
                {/* Classification */}
                <div className="bg-slate-50/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[16px] text-ds-primary">
                      category
                    </span>
                    <span className="text-sm font-bold">{t("classify")}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard
                      label={t("classified")}
                      value={String(inferResult.classify.classified)}
                    />
                    <StatCard
                      label={t("newAliases")}
                      value={String(inferResult.classify.newAliases)}
                    />
                    <StatCard
                      label={t("skipped")}
                      value={String(inferResult.classify.skipped)}
                    />
                  </div>
                  {inferResult.classify.errors.length > 0 && (
                    <ErrorList errors={inferResult.classify.errors} t={t} />
                  )}
                </div>

                {/* Brand */}
                <div className="bg-slate-50/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[16px] text-ds-primary">
                      branding_watermark
                    </span>
                    <span className="text-sm font-bold">{t("brand")}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      label={t("updated")}
                      value={String(inferResult.brand.updated)}
                    />
                    <StatCard
                      label={t("skipped")}
                      value={String(inferResult.brand.skipped)}
                    />
                  </div>
                  {inferResult.brand.errors.length > 0 && (
                    <ErrorList errors={inferResult.brand.errors} t={t} />
                  )}
                </div>

                {/* Capabilities */}
                <div className="bg-slate-50/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[16px] text-ds-primary">
                      tune
                    </span>
                    <span className="text-sm font-bold">{t("capabilities")}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      label={t("updated")}
                      value={String(inferResult.capabilities.updated)}
                    />
                    <StatCard
                      label={t("skipped")}
                      value={String(inferResult.capabilities.skipped)}
                    />
                  </div>
                  {inferResult.capabilities.errors.length > 0 && (
                    <ErrorList errors={inferResult.capabilities.errors} t={t} />
                  )}
                </div>
              </>
            )}

            {!inferResult && (
              <div className="text-center text-sm text-ds-on-surface-variant py-8">
                {t("noInferenceData")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatCard({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-ds-surface-container-lowest rounded-lg p-3">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-lg font-[var(--font-heading)] font-bold ${valueColor ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function ErrorList({
  errors,
  t,
}: {
  errors: string[];
  t: ReturnType<typeof useTranslations>;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? errors : errors.slice(0, 3);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 text-rose-600 text-[11px] font-bold mb-1">
        <span className="material-symbols-outlined text-[14px]">error</span>
        {t("errorCount", { count: errors.length })}
      </div>
      <div className="space-y-1">
        {shown.map((err, i) => (
          <div
            key={i}
            className="text-[11px] text-rose-700 bg-rose-50 px-3 py-1.5 rounded truncate"
            title={err}
          >
            {err}
          </div>
        ))}
      </div>
      {errors.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-ds-primary font-semibold mt-1 hover:underline"
        >
          {expanded ? t("showLess") : t("showMore", { count: errors.length - 3 })}
        </button>
      )}
    </div>
  );
}
