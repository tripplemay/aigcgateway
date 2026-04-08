"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";

// ============================================================
// Types
// ============================================================

interface LogDetail {
  traceId: string;
  modelName: string;
  status: string;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  sellPrice: number | null;
  latencyMs: number | null;
  ttftMs: number | null;
  tokensPerSecond: number | null;
  createdAt: string;
  promptSnapshot?: Array<{ role: string; content: string }>;
  requestParams?: Record<string, unknown>;
  responseContent?: string | null;
  errorMessage?: string | null;
}

// ============================================================
// Component — 1:1 replica of Audit Log Detail code.html lines 167-358
// ============================================================

export default function LogDetailPage() {
  const t = useTranslations("logs");
  const { current, loading: projLoading } = useProject();
  const params = useParams<{ traceId: string }>();

  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [scoreSaving, setScoreSaving] = useState(false);

  const { data: detail, loading } = useAsyncData<LogDetail | null>(async () => {
    if (!current || !params.traceId) return null;
    return apiFetch<LogDetail>(`/api/projects/${current.id}/logs/${params.traceId}`);
  }, [current, params.traceId]);

  const submitQualityScore = async (score: number) => {
    if (!current || !params.traceId || scoreSaving) return;
    setScoreSaving(true);
    try {
      await apiFetch(`/api/projects/${current.id}/logs/${params.traceId}/quality`, {
        method: "PATCH",
        body: JSON.stringify({ score }),
      });
      setQualityScore(score);
      toast.success(t("qualityScored"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setScoreSaving(false);
    }
  };

  if (projLoading || loading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;
  if (!detail) return <div className="text-center py-20 text-ds-outline">{t("traceNotFound")}</div>;

  const statusColor =
    detail.status === "SUCCESS"
      ? "bg-green-100 text-green-700 border-green-200"
      : detail.status === "FILTERED"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-red-100 text-red-700 border-red-200";

  const promptCount = detail.promptSnapshot?.length ?? 0;

  return (
    <div className="space-y-8 max-w-[1400px]">
      {/* ═══ Breadcrumb ═══ */}
      <nav className="flex items-center gap-2 text-sm">
        <Link
          href="/logs"
          className="text-ds-on-surface-variant/60 hover:text-ds-primary transition-colors"
        >
          {t("title")}
        </Link>
        <span className="text-ds-outline-variant">/</span>
        <span className="font-bold text-ds-primary">{t("traceDetail")}</span>
      </nav>

      {/* ═══ Trace Header — code.html lines 170-197 ═══ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)]">
              {detail.traceId.slice(0, 12)}
            </h2>
            <span className={`px-3 py-1 text-[10px] font-bold rounded-full border ${statusColor}`}>
              {detail.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-ds-on-surface-variant/70 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">calendar_today</span>
              {new Date(detail.createdAt).toLocaleString()}
            </span>
            <span className="w-1 h-1 bg-ds-outline-variant rounded-full" />
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">timer</span>
              {detail.latencyMs != null ? `${detail.latencyMs}ms` : "—"}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              navigator.clipboard.writeText(detail.traceId);
              toast.success(t("copied"));
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-ds-surface-container-low text-ds-on-surface hover:bg-ds-surface-container transition-all rounded-xl"
          >
            <span className="material-symbols-outlined text-base">content_copy</span>
            {t("copyTraceId")}
          </button>
        </div>
      </div>

      {/* ═══ Stats Bento Row — code.html lines 200-237 ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-ds-surface-container-lowest p-5 rounded-xl shadow-sm flex items-center gap-4 group hover:bg-ds-primary/5 transition-all">
          <div className="w-12 h-12 rounded-full bg-ds-surface-container flex items-center justify-center text-ds-primary group-hover:bg-ds-primary group-hover:text-white transition-all">
            <span className="material-symbols-outlined">smart_toy</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ds-on-surface-variant font-bold">
              Model
            </p>
            <p className="text-base font-bold text-ds-on-surface">{detail.modelName}</p>
          </div>
        </div>
        <div className="bg-ds-surface-container-lowest p-5 rounded-xl shadow-sm flex items-center gap-4 group hover:bg-ds-primary/5 transition-all">
          <div className="w-12 h-12 rounded-full bg-ds-surface-container flex items-center justify-center text-ds-primary group-hover:bg-ds-primary group-hover:text-white transition-all">
            <span className="material-symbols-outlined">toll</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ds-on-surface-variant font-bold">
              Tokens
            </p>
            <p className="text-base font-bold text-ds-on-surface">
              {detail.totalTokens?.toLocaleString() ?? "—"}
            </p>
          </div>
        </div>
        <div className="bg-ds-surface-container-lowest p-5 rounded-xl shadow-sm flex items-center gap-4 group hover:bg-ds-primary/5 transition-all">
          <div className="w-12 h-12 rounded-full bg-ds-surface-container flex items-center justify-center text-ds-primary group-hover:bg-ds-primary group-hover:text-white transition-all">
            <span className="material-symbols-outlined">payments</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ds-on-surface-variant font-bold">
              Cost
            </p>
            <p className="text-base font-bold text-ds-on-surface">
              {detail.sellPrice != null ? `$${detail.sellPrice.toFixed(4)}` : "—"}
            </p>
          </div>
        </div>
        <div className="bg-ds-surface-container-lowest p-5 rounded-xl shadow-sm flex items-center gap-4 group hover:bg-ds-primary/5 transition-all">
          <div className="w-12 h-12 rounded-full bg-ds-surface-container flex items-center justify-center text-ds-primary group-hover:bg-ds-primary group-hover:text-white transition-all">
            <span className="material-symbols-outlined">speed</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ds-on-surface-variant font-bold">
              Throughput
            </p>
            <p className="text-base font-bold text-ds-on-surface">
              {detail.tokensPerSecond ? `${detail.tokensPerSecond} t/s` : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Main Layout Grid — code.html lines 239-357 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Content Flow */}
        <div className="lg:col-span-8 space-y-8">
          {/* Prompt Messages — code.html lines 243-271 */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2 font-[var(--font-heading)]">
                <span className="material-symbols-outlined text-ds-primary">chat_bubble</span>
                {t("promptMessages")}
              </h3>
              <span className="text-xs font-medium text-ds-on-surface-variant bg-ds-surface-container px-2 py-1 rounded">
                {promptCount} Messages
              </span>
            </div>
            <div className="space-y-6">
              {detail.promptSnapshot?.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "system"
                      ? "bg-ds-surface-container-low/50 p-6 rounded-2xl space-y-3 relative overflow-hidden"
                      : "bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm space-y-3 relative overflow-hidden border-l-4 border-ds-primary"
                  }
                >
                  {m.role === "system" && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-ds-secondary/30" />
                  )}
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest ${
                        m.role === "system" ? "text-ds-secondary" : "text-ds-primary"
                      }`}
                    >
                      {m.role.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-ds-on-surface/90 whitespace-pre-wrap">
                    {m.content}
                  </p>
                </div>
              ))}
              {(!detail.promptSnapshot || detail.promptSnapshot.length === 0) && (
                <p className="text-sm text-slate-400 italic">{t("noPromptMessages")}</p>
              )}
            </div>
          </section>

          {/* Response Content — code.html lines 274-292 */}
          <section className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2 font-[var(--font-heading)]">
              <span className="material-symbols-outlined text-ds-primary">auto_awesome</span>
              {t("responseContent")}
            </h3>
            {detail.responseContent ? (
              <div className="bg-ds-surface-container-lowest p-8 rounded-2xl shadow-sm">
                <div className="text-sm leading-7 text-ds-on-surface/80 whitespace-pre-wrap">
                  {detail.responseContent}
                </div>
                {detail.finishReason && (
                  <p className="pt-4 border-t border-ds-outline-variant/10 text-xs italic text-ds-on-surface-variant mt-4">
                    {t("finishReason")}: {detail.finishReason}
                  </p>
                )}
              </div>
            ) : detail.errorMessage ? (
              <div className="bg-red-50 p-8 rounded-2xl border-l-4 border-red-500">
                <p className="text-sm text-red-700 leading-relaxed whitespace-pre-wrap">
                  {detail.errorMessage}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">{t("noResponseContent")}</p>
            )}
          </section>

          {/* Quality Score */}
          <section className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2 font-[var(--font-heading)]">
              <span className="material-symbols-outlined text-ds-primary">star</span>
              {t("qualityScore")}
            </h3>
            <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm">
              <p className="text-sm text-ds-on-surface-variant mb-4">{t("qualityScoreDesc")}</p>
              <div className="flex items-center gap-2">
                {[0.0, 0.25, 0.5, 0.75, 1.0].map((score) => (
                  <button
                    key={score}
                    disabled={scoreSaving}
                    onClick={() => submitQualityScore(score)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      qualityScore === score
                        ? "bg-ds-primary text-white shadow-md"
                        : "bg-ds-surface-container-low text-ds-on-surface hover:bg-ds-surface-container-high"
                    } disabled:opacity-50`}
                  >
                    {score === 0 ? "0" : score === 0.25 ? "0.25" : score === 0.5 ? "0.5" : score === 0.75 ? "0.75" : "1.0"}
                  </button>
                ))}
              </div>
              {qualityScore !== null && (
                <p className="mt-3 text-xs text-ds-primary font-bold">
                  {t("qualityScored")}: {qualityScore}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Technical Details — code.html lines 295-356 */}
        <div className="lg:col-span-4 space-y-8">
          {/* Request Parameters */}
          {detail.requestParams && (
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-ds-on-surface-variant flex items-center gap-2">
                <span className="material-symbols-outlined text-base">code</span>
                {t("requestParameters")}
              </h3>
              <div className="bg-slate-900 rounded-2xl p-5 font-mono text-[11px] leading-relaxed overflow-x-auto">
                <pre className="text-indigo-200">
                  {JSON.stringify(detail.requestParams, null, 2)}
                </pre>
              </div>
            </section>
          )}

          {/* Metadata — code.html lines 320-346 */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-ds-on-surface-variant flex items-center gap-2">
              <span className="material-symbols-outlined text-base">info</span>
              {t("metadata")}
            </h3>
            <div className="bg-ds-surface-container-low rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-ds-outline-variant/10">
                <span className="text-xs font-medium text-ds-on-surface-variant">{t("model")}</span>
                <span className="text-xs font-bold text-ds-on-surface">{detail.modelName}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-ds-outline-variant/10">
                <span className="text-xs font-medium text-ds-on-surface-variant">{t("promptTokens")}</span>
                <span className="text-xs font-bold text-ds-on-surface">
                  {detail.promptTokens?.toLocaleString() ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-ds-outline-variant/10">
                <span className="text-xs font-medium text-ds-on-surface-variant">{t("completionTokens")}</span>
                <span className="text-xs font-bold text-ds-on-surface">
                  {detail.completionTokens?.toLocaleString() ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-ds-outline-variant/10">
                <span className="text-xs font-medium text-ds-on-surface-variant">TTFT</span>
                <span className="text-xs font-bold text-ds-on-surface">
                  {detail.ttftMs != null ? `${detail.ttftMs}ms` : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-ds-on-surface-variant">{t("trace")}</span>
                <span className="text-xs font-bold text-ds-on-surface font-mono">
                  {detail.traceId.slice(0, 12)}...
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
