"use client";
import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusChip } from "@/components/status-chip";
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
  classify: {
    classified: number;
    newAliases: number;
    skipped: number;
    pendingQueued?: number;
    errors: string[];
  };
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

interface SyncProgress {
  status: "running" | "done";
  total: number;
  completed: number;
  currentProvider?: string;
}

interface InferenceProgress {
  status: "running" | "done";
  phase?: string;
  step: number;
  total: number;
}

export default function OperationsPage() {
  const t = useTranslations("adminOps");
  const [syncing, setSyncing] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [inferProgress, setInferProgress] = useState<InferenceProgress | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inferPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, loading, refetch } = useAsyncData<SyncStatusResponse>(
    () => apiFetch<SyncStatusResponse>("/api/admin/sync-status"),
    [],
  );

  const status = data?.data ?? null;
  const syncResult = status?.lastSyncResultDetail ?? null;
  const inferResult = status?.lastInferenceResult ?? null;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
      if (inferPollRef.current) clearInterval(inferPollRef.current);
    };
  }, []);

  const pollSyncProgress = () => {
    if (syncPollRef.current) clearInterval(syncPollRef.current);
    syncPollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ data: SyncProgress | null }>("/api/admin/sync/status");
        setSyncProgress(res.data);
        if (!res.data || res.data.status === "done") {
          if (syncPollRef.current) clearInterval(syncPollRef.current);
          syncPollRef.current = null;
          setSyncing(false);
          setSyncProgress(null);
          refetch();
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await apiFetch("/api/admin/sync-models", { method: "POST" });
      toast.success(t("syncStarted"));
      pollSyncProgress();
    } catch (e) {
      toast.error((e as Error).message);
      setSyncing(false);
    }
  };

  const pollInferProgress = () => {
    if (inferPollRef.current) clearInterval(inferPollRef.current);
    inferPollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ data: InferenceProgress | null }>(
          "/api/admin/inference/status",
        );
        setInferProgress(res.data);
        if (!res.data || res.data.status === "done") {
          if (inferPollRef.current) clearInterval(inferPollRef.current);
          inferPollRef.current = null;
          setInferProgress(null);
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  };

  const triggerInference = async () => {
    setInferring(true);
    pollInferProgress();
    try {
      await apiFetch("/api/admin/run-inference", { method: "POST" });
      toast.success(t("inferenceComplete"));
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setInferring(false);
    if (inferPollRef.current) clearInterval(inferPollRef.current);
    inferPollRef.current = null;
    setInferProgress(null);
  };

  if (loading && !data) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-[300px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
        </div>
        <Skeleton className="h-[200px] rounded-xl" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* ═══ Two-column: Sync + Inference ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Sync Panel ── */}
        <SectionCard className="[&>div]:p-0">
          <div className="px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  sync
                </span>
              </div>
              <div>
                <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("syncTitle")}</h3>
                <p className="text-xs text-ds-on-surface-variant">{t("syncDesc")}</p>
              </div>
            </div>
            <Button variant="gradient-primary" onClick={triggerSync} disabled={syncing}>
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              {syncing ? t("syncing") : t("runSync")}
            </Button>
          </div>

          <div className="px-6 pb-5 space-y-4">
            {/* Sync Progress */}
            {syncing && syncProgress && (
              <ProgressBar
                label={
                  syncProgress.currentProvider
                    ? t("syncProgressProvider", { provider: syncProgress.currentProvider })
                    : t("syncProgressGeneral")
                }
                completed={syncProgress.completed}
                total={syncProgress.total}
              />
            )}

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
                    ? "text-ds-status-success"
                    : status?.lastSyncResult === "partial"
                      ? "text-ds-status-warning"
                      : status?.lastSyncResult === "failed"
                        ? "text-ds-error"
                        : undefined
                }
              />
            </div>

            {/* F-AO2-04: sync status banner — same 4-state treatment as
                inference so operators get a colored one-liner summary. */}
            {syncResult && <SyncStatusBanner result={syncResult} t={t} />}

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
                  valueColor={
                    syncResult.summary.totalFailedProviders > 0 ? "text-ds-error" : undefined
                  }
                />
              </div>
            )}

            {/* Per-provider details */}
            {syncResult && syncResult.providers.length > 0 && (
              <div className="bg-ds-surface-container-low/50 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-ds-outline uppercase tracking-wider">
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
                                ? "text-ds-status-success bg-ds-status-success-container"
                                : "text-ds-error bg-ds-error-container"
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
              <div className="flex items-center gap-2 text-ds-status-warning bg-ds-status-warning-container px-4 py-2.5 rounded-lg text-xs font-semibold">
                <span className="material-symbols-outlined text-[16px]">warning</span>
                {t("zeroPriceWarning", { count: status!.zeroPriceActiveChannels })}
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Inference Panel ── */}
        <SectionCard className="[&>div]:p-0">
          <div className="px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-ds-primary-container text-ds-primary flex items-center justify-center">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
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
              className="bg-gradient-to-r from-ds-primary to-[var(--ds-primary)]/80 text-ds-on-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              {inferring ? t("inferring") : t("runInference")}
            </button>
          </div>

          <div className="px-6 pb-5 space-y-4">
            {/* Inference Progress */}
            {inferring && inferProgress && (
              <ProgressBar
                label={
                  inferProgress.phase
                    ? t("inferProgressPhase", { phase: inferProgress.phase })
                    : t("inferProgressGeneral")
                }
                completed={inferProgress.step}
                total={inferProgress.total}
              />
            )}

            {/* Last inference time */}
            <StatCard
              label={t("lastInference")}
              value={inferResult?.timestamp ? timeAgo(inferResult.timestamp) : "—"}
            />

            {/* ── Status Banner ── */}
            {inferResult && <InferenceStatusBanner result={inferResult} t={t} />}

            {inferResult && (
              <>
                {/* Classification */}
                <div className="bg-ds-surface-container-low/50 rounded-lg p-4 space-y-2">
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
                    <StatCard label={t("skipped")} value={String(inferResult.classify.skipped)} />
                  </div>
                  {inferResult.classify.errors.length > 0 && (
                    <ErrorList errors={inferResult.classify.errors} t={t} />
                  )}
                </div>

                {/* Brand */}
                <div className="bg-ds-surface-container-low/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[16px] text-ds-primary">
                      branding_watermark
                    </span>
                    <span className="text-sm font-bold">{t("brand")}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label={t("updated")} value={String(inferResult.brand.updated)} />
                    <StatCard label={t("skipped")} value={String(inferResult.brand.skipped)} />
                  </div>
                  {inferResult.brand.errors.length > 0 && (
                    <ErrorList errors={inferResult.brand.errors} t={t} />
                  )}
                </div>

                {/* Capabilities */}
                <div className="bg-ds-surface-container-low/50 rounded-lg p-4 space-y-2">
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
        </SectionCard>
      </div>

      {/* F-AO2-07: classifier review queue (only renders when pending > 0) */}
      <PendingClassificationQueue t={t} />

      {/* F-RL-06: rate-limit global defaults */}
      <RateLimitDefaultsCard t={t} />

      {/* F-OE-03: welcome bonus amount (USD) */}
      <WelcomeBonusCard t={t} />

      {/* F-TL-02: template categories CRUD */}
      <TemplateCategoriesCard t={t} />
    </PageContainer>
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
      <div className="text-[10px] font-bold text-ds-outline uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-lg font-[var(--font-heading)] font-bold ${valueColor ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function InferenceStatusBanner({
  result,
  t,
}: {
  result: InferenceResult;
  t: ReturnType<typeof useTranslations>;
}) {
  const totalErrors =
    result.classify.errors.length + result.brand.errors.length + result.capabilities.errors.length;
  const totalUpdated =
    result.classify.classified + result.brand.updated + result.capabilities.updated;
  const totalNewAliases = result.classify.newAliases;
  const totalSkipped = result.classify.skipped + result.brand.skipped + result.capabilities.skipped;

  // Determine banner variant
  if (totalErrors > 0) {
    return (
      <div className="flex items-center gap-2 text-ds-error bg-ds-error-container px-4 py-2.5 rounded-lg text-xs font-semibold">
        <span className="material-symbols-outlined text-[16px]">error</span>
        {t("inferBannerError", { errors: totalErrors })}
      </div>
    );
  }

  if (totalUpdated === 0 && totalNewAliases === 0 && totalSkipped === 0) {
    return (
      <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-4 py-2.5 rounded-lg text-xs font-semibold">
        <span className="material-symbols-outlined text-[16px]">check_circle</span>
        {t("inferBannerUpToDate")}
      </div>
    );
  }

  if (totalUpdated > 0 || totalNewAliases > 0) {
    const parts: string[] = [];
    if (result.classify.classified > 0)
      parts.push(t("inferBannerClassified", { count: result.classify.classified }));
    if (totalNewAliases > 0) parts.push(t("inferBannerNewAliases", { count: totalNewAliases }));
    if (result.brand.updated > 0)
      parts.push(t("inferBannerBrandUpdated", { count: result.brand.updated }));
    if (result.capabilities.updated > 0)
      parts.push(t("inferBannerCapUpdated", { count: result.capabilities.updated }));

    return (
      <div className="flex items-center gap-2 text-ds-status-success bg-ds-status-success-container px-4 py-2.5 rounded-lg text-xs font-semibold">
        <span className="material-symbols-outlined text-[16px]">task_alt</span>
        {parts.join(", ")}
      </div>
    );
  }

  // Only skipped items, no updates
  return (
    <div className="flex items-center gap-2 text-ds-status-warning bg-ds-status-warning-container px-4 py-2.5 rounded-lg text-xs font-semibold">
      <span className="material-symbols-outlined text-[16px]">warning</span>
      {t("inferBannerSkipped", { count: totalSkipped })}
    </div>
  );
}

// F-AO2-04: 4-state summary banner for model-sync runs. Mirrors
// InferenceStatusBanner's look so operators see the same visual
// grammar for both pipelines.
function SyncStatusBanner({
  result,
  t,
}: {
  result: SyncResult;
  t: ReturnType<typeof useTranslations>;
}) {
  const { totalNewModels, totalNewChannels, totalDisabledChannels, totalFailedProviders } =
    result.summary;

  if (totalFailedProviders > 0) {
    return (
      <div className="flex items-center gap-2 text-ds-error bg-ds-error-container px-4 py-2.5 rounded-lg text-xs font-semibold">
        <span className="material-symbols-outlined text-[16px]">error</span>
        {t("syncBannerError", { failed: totalFailedProviders })}
      </div>
    );
  }

  if (totalNewModels === 0 && totalNewChannels === 0 && totalDisabledChannels === 0) {
    return (
      <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-4 py-2.5 rounded-lg text-xs font-semibold">
        <span className="material-symbols-outlined text-[16px]">check_circle</span>
        {t("syncBannerUpToDate")}
      </div>
    );
  }

  if (totalNewModels > 0 || totalNewChannels > 0) {
    const parts: string[] = [];
    if (totalNewModels > 0) parts.push(t("syncBannerNewModels", { count: totalNewModels }));
    if (totalNewChannels > 0) parts.push(t("syncBannerNewChannels", { count: totalNewChannels }));
    return (
      <div className="flex items-center gap-2 text-ds-status-success bg-ds-status-success-container px-4 py-2.5 rounded-lg text-xs font-semibold">
        <span className="material-symbols-outlined text-[16px]">task_alt</span>
        {parts.join(", ")}
      </div>
    );
  }

  // Only disabled channels, no additions
  return (
    <div className="flex items-center gap-2 text-ds-status-warning bg-ds-status-warning-container px-4 py-2.5 rounded-lg text-xs font-semibold">
      <span className="material-symbols-outlined text-[16px]">warning</span>
      {t("syncBannerDisabled", { count: totalDisabledChannels })}
    </div>
  );
}

function ProgressBar({
  label,
  completed,
  total,
}: {
  label: string;
  completed: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="bg-ds-surface-container-low/80 rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ds-on-surface">{label}</span>
        <span className="font-bold text-ds-primary">
          {completed}/{total}
        </span>
      </div>
      <div className="h-2 bg-ds-outline-variant rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-ds-primary to-ds-primary/70 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ErrorList({ errors, t }: { errors: string[]; t: ReturnType<typeof useTranslations> }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? errors : errors.slice(0, 3);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 text-ds-error text-[11px] font-bold mb-1">
        <span className="material-symbols-outlined text-[14px]">error</span>
        {t("errorCount", { count: errors.length })}
      </div>
      <div className="space-y-1">
        {shown.map((err, i) => (
          <div
            key={i}
            className="text-[11px] text-ds-error bg-ds-error-container px-3 py-1.5 rounded truncate"
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

// ============================================================
// F-RL-06: RateLimitDefaultsCard
// ============================================================

const RL_KEYS = [
  { key: "GLOBAL_DEFAULT_RPM", label: "Default RPM" },
  { key: "GLOBAL_DEFAULT_TPM", label: "Default TPM" },
  { key: "GLOBAL_DEFAULT_IMAGE_RPM", label: "Image RPM" },
  { key: "GLOBAL_DEFAULT_BURST_COUNT", label: "Burst count" },
  { key: "GLOBAL_DEFAULT_BURST_WINDOW_SEC", label: "Burst window (s)" },
  { key: "GLOBAL_DEFAULT_SPEND_PER_MIN", label: "Spend / min (USD)" },
  { key: "GLOBAL_DEFAULT_KEY_RPM", label: "Key RPM cap" },
  { key: "GLOBAL_DEFAULT_USER_RPM", label: "User RPM cap" },
] as const;

function RateLimitDefaultsCard({ t }: { t: ReturnType<typeof useTranslations> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ data: { key: string; value: string }[] }>("/api/admin/config")
      .then((res) => {
        const map: Record<string, string> = {};
        for (const row of res.data ?? []) map[row.key] = row.value;
        setValues(map);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      for (const k of RL_KEYS) {
        const v = values[k.key]?.trim();
        if (!v) continue;
        await apiFetch("/api/admin/config", {
          method: "PUT",
          body: JSON.stringify({ key: k.key, value: v }),
        });
      }
      toast.success(t("rlDefaultsSaved"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard data-testid="rl-defaults">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-ds-primary-container text-ds-primary flex items-center justify-center">
          <span className="material-symbols-outlined">speed</span>
        </div>
        <div>
          <h3 className="heading-2">{t("rlDefaultsTitle")}</h3>
          <p className="text-xs text-ds-on-surface-variant">{t("rlDefaultsDesc")}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {RL_KEYS.map((k) => (
          <div key={k.key}>
            <label className="text-[10px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
              {k.label}
            </label>
            <input
              type="number"
              min={0}
              value={values[k.key] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [k.key]: e.target.value }))}
              disabled={!loaded}
              className="mt-1 w-full bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-6">
        <Button
          variant="gradient-primary"
          type="button"
          onClick={save}
          disabled={saving || !loaded}
        >
          {saving ? t("saving") : t("saveChanges")}
        </Button>
      </div>
    </SectionCard>
  );
}

// ============================================================
// F-AO2-07: Pending classifier review queue
// ============================================================

interface PendingRow {
  id: string;
  suggestedAlias: string | null;
  suggestedAliasId: string | null;
  suggestedBrand: string | null;
  confidence: number | null;
  reason: string | null;
  createdAt: string;
  model: { id: string; name: string; displayName: string; modality: string };
}

interface AliasOption {
  id: string;
  name: string;
  modality: string;
}

function ReassignPopover({
  row,
  onReassign,
  disabled,
}: {
  row: PendingRow;
  onReassign: (aliasId: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [aliases, setAliases] = useState<AliasOption[]>([]);
  const [loadingAliases, setLoadingAliases] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingAliases(true);
    apiFetch<{ data: AliasOption[] }>(
      `/api/admin/model-aliases?modality=${encodeURIComponent(row.model.modality)}&limit=200`,
    )
      .then((res) => setAliases(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingAliases(false));
  }, [open, row.model.modality]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = aliases.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 text-xs font-bold text-ds-primary border border-ds-primary/30 rounded-lg hover:bg-ds-primary/5 disabled:opacity-50 transition-colors"
      >
        Reassign
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-ds-surface-container-lowest rounded-xl shadow-xl border border-ds-outline-variant/20 overflow-hidden">
          <div className="p-2 border-b border-ds-outline-variant/10">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search aliases..."
              className="w-full text-xs bg-ds-surface-container-low rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-ds-primary/30"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loadingAliases ? (
              <div className="py-4 text-center text-xs text-ds-on-surface-variant">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-ds-on-surface-variant">No aliases</div>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="w-full text-left px-4 py-2 text-xs hover:bg-ds-primary/5 transition-colors"
                  onClick={() => {
                    setOpen(false);
                    onReassign(a.id);
                  }}
                >
                  {a.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingClassificationQueue({ t }: { t: ReturnType<typeof useTranslations> }) {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: PendingRow[] }>("/api/admin/pending-classifications");
      setRows(res.data ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (
    row: PendingRow,
    action: "approve" | "reject" | "reassign",
    aliasId?: string,
  ) => {
    setBusy(row.id);
    try {
      await apiFetch(`/api/admin/pending-classifications/${row.id}`, {
        method: "POST",
        body: JSON.stringify(action === "reassign" ? { action, aliasId } : { action }),
      });
      toast.success(
        action === "approve"
          ? t("queueApproved")
          : action === "reassign"
            ? "Reassigned"
            : t("queueRejected"),
      );
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading && rows.length === 0) return null;
  if (rows.length === 0) return null;

  return (
    <SectionCard
      title={t("queueTitle", { count: rows.length })}
      actions={
        <button
          type="button"
          onClick={load}
          className="text-xs font-bold text-ds-primary hover:underline"
        >
          {t("queueRefresh")}
        </button>
      }
    >
      <ul className="divide-y divide-ds-outline-variant/20">
        {rows.map((row) => (
          <li key={row.id} className="py-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">{row.model.displayName || row.model.name}</span>
                <StatusChip variant="neutral">{row.model.modality}</StatusChip>
                {row.confidence != null && (
                  <StatusChip variant={row.confidence >= 0.7 ? "info" : "warning"}>
                    {(row.confidence * 100).toFixed(0)}%
                  </StatusChip>
                )}
              </div>
              <div className="text-xs text-ds-on-surface-variant mt-1">
                → {row.suggestedAlias ?? t("queueNoSuggestion")}
                {row.suggestedBrand ? ` · ${row.suggestedBrand}` : ""}
              </div>
              {row.reason && (
                <div className="text-xs text-ds-outline mt-1 italic">{row.reason}</div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="gradient-primary"
                size="sm"
                disabled={busy === row.id || !row.suggestedAliasId}
                onClick={() => act(row, "approve")}
              >
                {t("queueApprove")}
              </Button>
              <ReassignPopover
                row={row}
                disabled={busy === row.id}
                onReassign={(aliasId) => act(row, "reassign", aliasId)}
              />
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => act(row, "reject")}
                className="px-3 py-1.5 text-xs font-bold text-ds-on-surface-variant hover:text-ds-error disabled:opacity-50"
              >
                {t("queueReject")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ============================================================
// F-OE-03: Welcome bonus amount (USD) card
// ============================================================

const WELCOME_BONUS_KEY = "WELCOME_BONUS_USD";

function WelcomeBonusCard({ t }: { t: ReturnType<typeof useTranslations> }) {
  const [value, setValue] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ data: { key: string; value: string }[] }>("/api/admin/config")
      .then((res) => {
        const row = (res.data ?? []).find((r) => r.key === WELCOME_BONUS_KEY);
        setValue(row?.value ?? "1.00");
        setLoaded(true);
      })
      .catch(() => {
        setValue("1.00");
        setLoaded(true);
      });
  }, []);

  const save = async () => {
    const trimmed = value.trim();
    const num = Number(trimmed);
    if (!trimmed || !Number.isFinite(num) || num < 0) {
      toast.error(t("welcomeBonusInvalid"));
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/admin/config", {
        method: "PUT",
        body: JSON.stringify({ key: WELCOME_BONUS_KEY, value: trimmed }),
      });
      toast.success(t("welcomeBonusSaved"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard data-testid="welcome-bonus">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-ds-status-success-container text-ds-status-success flex items-center justify-center">
          <span className="material-symbols-outlined">redeem</span>
        </div>
        <div>
          <h3 className="heading-2">{t("welcomeBonusTitle")}</h3>
          <p className="text-xs text-ds-on-surface-variant">{t("welcomeBonusDesc")}</p>
        </div>
      </div>
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-xs">
          <label className="text-[10px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
            {t("welcomeBonusLabel")}
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!loaded}
            className="mt-1 w-full bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <Button
          variant="gradient-primary"
          type="button"
          onClick={save}
          disabled={saving || !loaded}
        >
          {saving ? t("saving") : t("saveChanges")}
        </Button>
      </div>
    </SectionCard>
  );
}

// ============================================================
// F-TL-02: Template categories CRUD card
// ============================================================

interface TemplateCategory {
  id: string;
  label: string;
  labelEn: string;
  icon: string;
}

const DEFAULT_CATS: TemplateCategory[] = [
  { id: "dev-review", label: "开发审查", labelEn: "Dev Review", icon: "code_review" },
  { id: "writing", label: "内容创作", labelEn: "Writing", icon: "edit_note" },
  { id: "translation", label: "翻译", labelEn: "Translation", icon: "translate" },
  { id: "analysis", label: "数据分析", labelEn: "Analysis", icon: "analytics" },
  { id: "customer-service", label: "客服", labelEn: "Customer Service", icon: "support_agent" },
  { id: "other", label: "其他", labelEn: "Other", icon: "category" },
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

function TemplateCategoriesCard({ t }: { t: ReturnType<typeof useTranslations> }) {
  const [rows, setRows] = useState<TemplateCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ data: TemplateCategory[] }>("/api/admin/template-categories")
      .then((res) => {
        setRows(res.data?.length ? res.data : DEFAULT_CATS);
        setLoaded(true);
      })
      .catch(() => {
        setRows(DEFAULT_CATS);
        setLoaded(true);
      });
  }, []);

  const updateRow = (idx: number, patch: Partial<TemplateCategory>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { id: "", label: "", labelEn: "", icon: "category" }]);
  };

  const removeRow = (idx: number) => {
    const target = rows[idx];
    if (target?.id === "other") {
      toast.error(t("tplCatRequireOther"));
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetDefaults = () => {
    setRows(DEFAULT_CATS);
  };

  const save = async () => {
    const trimmed = rows.map((r) => ({
      id: r.id.trim(),
      label: r.label.trim(),
      labelEn: r.labelEn.trim(),
      icon: r.icon.trim(),
    }));

    for (const r of trimmed) {
      if (!r.id || !r.label || !r.labelEn || !r.icon) {
        toast.error(t("tplCatMissingFields"));
        return;
      }
      if (!SLUG_RE.test(r.id)) {
        toast.error(t("tplCatInvalidId"));
        return;
      }
    }

    const seen = new Set<string>();
    for (const r of trimmed) {
      if (seen.has(r.id)) {
        toast.error(t("tplCatDuplicateId", { id: r.id }));
        return;
      }
      seen.add(r.id);
    }

    if (!trimmed.some((r) => r.id === "other")) {
      toast.error(t("tplCatRequireOther"));
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch<{ data: TemplateCategory[] }>("/api/admin/template-categories", {
        method: "PUT",
        body: JSON.stringify({ categories: trimmed }),
      });
      setRows(res.data);
      toast.success(t("tplCatSaved"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard data-testid="template-categories">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
          <span className="material-symbols-outlined">category</span>
        </div>
        <div>
          <h3 className="heading-2">{t("tplCatTitle")}</h3>
          <p className="text-xs text-ds-on-surface-variant">{t("tplCatDesc")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
          <div className="col-span-3">{t("tplCatId")}</div>
          <div className="col-span-3">{t("tplCatLabel")}</div>
          <div className="col-span-3">{t("tplCatLabelEn")}</div>
          <div className="col-span-2">{t("tplCatIcon")}</div>
          <div className="col-span-1" />
        </div>

        {rows.map((row, idx) => (
          <div key={`${row.id}-${idx}`} className="grid grid-cols-12 gap-2 items-center">
            <input
              className="col-span-3 bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="slug"
              value={row.id}
              onChange={(e) => updateRow(idx, { id: e.target.value })}
              disabled={!loaded}
            />
            <input
              className="col-span-3 bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm"
              placeholder="中文名"
              value={row.label}
              onChange={(e) => updateRow(idx, { label: e.target.value })}
              disabled={!loaded}
            />
            <input
              className="col-span-3 bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm"
              placeholder="English"
              value={row.labelEn}
              onChange={(e) => updateRow(idx, { labelEn: e.target.value })}
              disabled={!loaded}
            />
            <div className="col-span-2 flex items-center gap-2">
              <span
                className="material-symbols-outlined text-[18px] text-ds-primary"
                aria-hidden="true"
              >
                {row.icon || "category"}
              </span>
              <input
                className="flex-1 bg-ds-surface-container-low rounded-lg px-2 py-2 text-xs font-mono"
                placeholder="icon_name"
                value={row.icon}
                onChange={(e) => updateRow(idx, { icon: e.target.value })}
                disabled={!loaded}
              />
            </div>
            <button
              type="button"
              className="col-span-1 text-xs font-bold text-ds-on-surface-variant hover:text-ds-error disabled:opacity-30"
              onClick={() => removeRow(idx)}
              disabled={!loaded || row.id === "other"}
              title={t("tplCatRemove")}
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-6 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addRow}
            disabled={!loaded}
            className="text-xs font-bold text-ds-primary border border-ds-primary/30 rounded-lg px-3 py-1.5 hover:bg-ds-primary/5 disabled:opacity-50"
          >
            + {t("tplCatAdd")}
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            disabled={!loaded}
            className="text-xs font-semibold text-ds-on-surface-variant hover:text-ds-primary disabled:opacity-50"
          >
            {t("tplCatResetDefaults")}
          </button>
        </div>
        <Button
          variant="gradient-primary"
          type="button"
          onClick={save}
          disabled={saving || !loaded}
        >
          {saving ? t("saving") : t("saveChanges")}
        </Button>
      </div>
    </SectionCard>
  );
}
