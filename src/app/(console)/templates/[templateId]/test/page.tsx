"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, timeAgo } from "@/lib/utils";

interface Variable {
  name: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
}

interface StepMessage {
  role: string;
  content: string;
}

interface StepDetail {
  id: string;
  order: number;
  role: string;
  action: {
    id: string;
    name: string;
    model: string;
    activeVersionId: string | null;
    versions: Array<{
      versionNumber: number;
      messages: StepMessage[];
      variables: Variable[];
    }>;
  };
}

interface TemplateDetail {
  id: string;
  name: string;
  description: string | null;
  steps: StepDetail[];
}

interface TestStep {
  order: number;
  actionId: string;
  actionName: string;
  model: string;
  input: StepMessage[];
  output: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: string | null;
  latencyMs: number | null;
  status: "success" | "error" | "skipped";
  error?: string;
}

interface TestRunResult {
  runId: string;
  mode: "dry_run" | "execute";
  status: "success" | "error" | "partial";
  steps: TestStep[];
  totalTokens: number;
  totalCost: string;
  totalLatency: number;
}

interface TestRunSummary {
  id: string;
  mode: string;
  status: string;
  totalTokens: number | null;
  totalCost: string | null;
  totalLatency: number | null;
  createdAt: string;
}

interface TestRunDetail extends TestRunSummary {
  templateId: string;
  variables: Record<string, string>;
  steps: TestStep[];
}

const LONG_TEXT_THRESHOLD = 60;

export default function TemplateTestPage() {
  const t = useTranslations("templates");
  const locale = useLocale();
  const params = useParams();
  const templateId = params.templateId as string;
  const { current } = useProject();

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const [running, setRunning] = useState<"dry_run" | "execute" | null>(null);
  const [result, setResult] = useState<TestRunResult | null>(null);

  const [history, setHistory] = useState<TestRunSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const variableDefs = useMemo(() => {
    if (!template) return [] as Variable[];
    const map = new Map<string, Variable>();
    for (const step of template.steps) {
      const ver = step.action.versions?.[0];
      if (!ver) continue;
      const defs = (ver.variables ?? []) as Variable[];
      for (const def of defs) {
        if (def.name === "previous_output") continue;
        if (!map.has(def.name)) map.set(def.name, def);
      }
    }
    return [...map.values()];
  }, [template]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setTemplateLoading(true);
    setTemplateError(null);
    apiFetch<TemplateDetail>(`/api/projects/${current.id}/templates/${templateId}`)
      .then((data) => {
        if (cancelled) return;
        setTemplate(data);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setTemplateError(err.message);
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [current, templateId]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    apiFetch<{ data: TestRunSummary[] }>(`/api/templates/${templateId}/test-runs`)
      .then((resp) => {
        if (cancelled) return;
        setHistory(resp.data);
      })
      .catch(() => {
        // silent — history is non-critical
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId, result]);

  useEffect(() => {
    if (!template) return;
    setVariableValues((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const def of variableDefs) {
        if (next[def.name] === undefined) {
          next[def.name] = def.defaultValue ?? "";
        }
      }
      return next;
    });
  }, [template, variableDefs]);

  const handleVariableChange = (name: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleRun = async (mode: "dry_run" | "execute") => {
    if (running) return;
    setRunning(mode);
    try {
      const resp = await apiFetch<{ data: TestRunResult }>(`/api/templates/${templateId}/test`, {
        method: "POST",
        body: JSON.stringify({ mode, variables: variableValues }),
      });
      setResult(resp.data);
    } catch (err) {
      toast.error(`${t("testRunFailed")}: ${(err as Error).message}`);
    } finally {
      setRunning(null);
    }
  };

  const handleLoadHistory = async (runId: string) => {
    try {
      const resp = await apiFetch<{ data: TestRunDetail }>(
        `/api/templates/${templateId}/test-runs/${runId}`,
      );
      setVariableValues((prev) => ({ ...prev, ...(resp.data.variables ?? {}) }));
      setResult({
        runId: resp.data.id,
        mode: resp.data.mode as "dry_run" | "execute",
        status: resp.data.status as "success" | "error" | "partial",
        steps: resp.data.steps,
        totalTokens: resp.data.totalTokens ?? 0,
        totalCost: resp.data.totalCost ?? "0",
        totalLatency: resp.data.totalLatency ?? 0,
      });
    } catch (err) {
      toast.error(`${t("testLoadHistoryFailed")}: ${(err as Error).message}`);
    }
  };

  if (templateLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </PageContainer>
    );
  }

  if (templateError || !template) {
    return (
      <PageContainer>
        <SectionCard title={t("testForkRequiredTitle")}>
          <p className="text-sm text-ds-on-surface-variant">
            {templateError ?? t("testForkRequiredDesc")}
          </p>
          <div className="mt-4">
            <Link
              href="/templates"
              className="text-sm font-semibold text-ds-primary hover:underline"
            >
              ← {t("title")}
            </Link>
          </div>
        </SectionCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <nav className="flex items-center gap-2 text-sm text-ds-on-surface-variant/60">
        <Link href="/templates" className="hover:text-ds-primary transition-colors">
          {t("title")}
        </Link>
        <span className="material-symbols-outlined text-xs">chevron_right</span>
        <Link
          href={`/templates/${templateId}`}
          className="hover:text-ds-primary transition-colors"
        >
          {template.name}
        </Link>
        <span className="material-symbols-outlined text-xs">chevron_right</span>
        <span className="text-ds-on-surface font-medium">{t("test")}</span>
      </nav>

      <PageHeader
        title={t("testTitle", { name: template.name })}
        subtitle={t("testSubtitle")}
        actions={
          <Link
            href={`/templates/${templateId}`}
            className="text-sm font-semibold text-ds-on-surface-variant hover:text-ds-primary inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            {t("testBackToDetail")}
          </Link>
        }
      />

      <div className="grid grid-cols-12 gap-6">
        {/* Left 40% */}
        <div className="col-span-12 lg:col-span-5 space-y-6">
          <SectionCard title={t("templateInfo")}>
            <div className="space-y-3">
              {template.steps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-center gap-3 p-3 bg-ds-surface-container-low rounded-xl"
                >
                  <div className="w-8 h-8 rounded-lg bg-ds-primary/10 text-ds-primary flex items-center justify-center text-sm font-bold">
                    {step.order + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ds-on-surface truncate">
                      {step.action.name}
                    </div>
                    <div className="text-xs text-ds-on-surface-variant truncate">
                      {step.action.model}
                    </div>
                  </div>
                  <StatusChip variant="neutral">{step.role}</StatusChip>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title={t("testVariables")}
            actions={
              <HistoryPresetDropdown
                history={history}
                onLoad={handleLoadHistory}
                loading={historyLoading}
                noneLabel={t("testLoadHistoryNone")}
                triggerLabel={t("testLoadFromHistory")}
                locale={locale}
              />
            }
          >
            {variableDefs.length === 0 ? (
              <p className="text-sm text-ds-on-surface-variant italic">
                {t("testVariablesEmpty")}
              </p>
            ) : (
              <div className="space-y-4">
                {variableDefs.map((def) => {
                  const value = variableValues[def.name] ?? "";
                  const longText = value.length > LONG_TEXT_THRESHOLD || def.name.length > 20;
                  return (
                    <div key={def.name} className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant">
                        <span className="font-mono text-ds-primary normal-case">{`{{${def.name}}}`}</span>
                        {def.required && (
                          <span className="text-[10px] text-red-500 font-bold">*</span>
                        )}
                      </label>
                      {def.description && (
                        <p className="text-xs text-ds-on-surface-variant/80">{def.description}</p>
                      )}
                      {longText ? (
                        <textarea
                          rows={4}
                          value={value}
                          onChange={(e) => handleVariableChange(def.name, e.target.value)}
                          placeholder={def.defaultValue ?? ""}
                          className="w-full px-3 py-2 rounded-lg bg-ds-surface-container-low border border-transparent focus:border-ds-primary focus:outline-none text-sm font-mono resize-y"
                        />
                      ) : (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => handleVariableChange(def.name, e.target.value)}
                          placeholder={def.defaultValue ?? ""}
                          className="w-full px-3 py-2 rounded-lg bg-ds-surface-container-low border border-transparent focus:border-ds-primary focus:outline-none text-sm"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="lg"
              disabled={!!running}
              onClick={() => handleRun("dry_run")}
              className="flex-1"
            >
              {running === "dry_run" ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  {t("testPreviewing")}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">visibility</span>
                  {t("testPreviewFree")}
                </>
              )}
            </Button>
            <Button
              variant="gradient-primary"
              size="lg"
              disabled={!!running}
              onClick={() => handleRun("execute")}
              className="flex-1"
            >
              {running === "execute" ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  {t("testExecuting")}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">science</span>
                  {t("testExecute")}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right 60% */}
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <ResultsPanel
            result={result}
            history={history}
            historyLoading={historyLoading}
            locale={locale}
            onLoadHistory={handleLoadHistory}
          />
        </div>
      </div>
    </PageContainer>
  );
}

interface HistoryPresetDropdownProps {
  history: TestRunSummary[];
  onLoad: (runId: string) => void;
  loading: boolean;
  noneLabel: string;
  triggerLabel: string;
  locale: string;
}

function HistoryPresetDropdown({
  history,
  onLoad,
  loading,
  noneLabel,
  triggerLabel,
  locale,
}: HistoryPresetDropdownProps) {
  const [open, setOpen] = useState(false);
  if (loading) {
    return <Skeleton className="h-8 w-32" />;
  }
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={history.length === 0}
      >
        <span className="material-symbols-outlined text-sm">history</span>
        {history.length === 0 ? noneLabel : triggerLabel}
        <span className="material-symbols-outlined text-sm">expand_more</span>
      </Button>
      {open && history.length > 0 && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-ds-surface-container-lowest rounded-xl shadow-lg border border-ds-outline-variant/10 z-10 max-h-80 overflow-y-auto">
          {history.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => {
                onLoad(run.id);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 hover:bg-ds-surface-container-low border-b border-ds-outline-variant/5 last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ds-on-surface">
                  {timeAgo(run.createdAt, locale)}
                </span>
                <StatusForRun status={run.status} />
              </div>
              <div className="text-[11px] text-ds-on-surface-variant/80 mt-0.5">
                {run.mode === "dry_run" ? "preview" : "execute"}
                {run.totalCost ? ` · $${Number(run.totalCost).toFixed(4)}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusForRun({ status }: { status: string }) {
  const variant =
    status === "success" ? "success" : status === "partial" ? "warning" : "error";
  const icon = status === "success" ? "check" : status === "partial" ? "warning" : "close";
  return (
    <StatusChip variant={variant}>
      <span className="material-symbols-outlined text-[10px] mr-0.5">{icon}</span>
      {status}
    </StatusChip>
  );
}

interface ResultsPanelProps {
  result: TestRunResult | null;
  history: TestRunSummary[];
  historyLoading: boolean;
  locale: string;
  onLoadHistory: (runId: string) => void;
}

function ResultsPanel({
  result,
  history,
  historyLoading,
  locale,
  onLoadHistory,
}: ResultsPanelProps) {
  const t = useTranslations("templates");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (order: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  };

  useEffect(() => {
    if (result) {
      // auto-expand first step for convenience
      const firstStep = result.steps[0];
      if (firstStep) {
        setExpanded(new Set([firstStep.order]));
      }
    }
  }, [result?.runId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!result) {
    return (
      <>
        <SectionCard title={t("testResults")}>
          <div className="py-12 text-center">
            <span className="material-symbols-outlined text-5xl text-ds-outline-variant/40 mb-3 block">
              science
            </span>
            <p className="text-sm text-ds-on-surface-variant">{t("testResultsEmpty")}</p>
          </div>
        </SectionCard>
        <HistoryList
          history={history}
          loading={historyLoading}
          locale={locale}
          onLoad={onLoadHistory}
        />
      </>
    );
  }

  const isDryRun = result.mode === "dry_run";

  return (
    <>
      <SectionCard
        title={t("testResults")}
        actions={
          <StatusChip
            variant={
              result.status === "success"
                ? "success"
                : result.status === "partial"
                  ? "warning"
                  : "error"
            }
          >
            {result.status === "success"
              ? t("testStatusSuccess")
              : result.status === "partial"
                ? t("testStatusPartial")
                : t("testStatusError")}
          </StatusChip>
        }
      >
        <div className="space-y-4">
          {result.steps.map((step) => {
            const isExpanded = expanded.has(step.order);
            const isError = step.status === "error";
            return (
              <div
                key={step.order}
                className={cn(
                  "rounded-xl border overflow-hidden",
                  isError
                    ? "border-red-300 bg-red-50/40"
                    : "border-ds-outline-variant/10 bg-ds-surface-container-low",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(step.order)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0",
                      isError ? "bg-red-100 text-red-700" : "bg-ds-primary/10 text-ds-primary",
                    )}
                  >
                    {step.order + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ds-on-surface truncate">
                      {step.actionName}
                    </div>
                    <div className="text-xs text-ds-on-surface-variant truncate">
                      {step.model}
                      {step.totalTokens ? ` · ${step.totalTokens} tokens` : ""}
                      {step.cost && Number(step.cost) > 0
                        ? ` · $${Number(step.cost).toFixed(6)}`
                        : ""}
                      {step.latencyMs ? ` · ${step.latencyMs}ms` : ""}
                    </div>
                  </div>
                  {isError ? (
                    <StatusChip variant="error">{t("testStepError")}</StatusChip>
                  ) : (
                    <span
                      className={cn(
                        "material-symbols-outlined text-ds-on-surface-variant transition-transform",
                        isExpanded ? "rotate-180" : "",
                      )}
                    >
                      expand_more
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 text-xs">
                    {step.error && (
                      <div className="p-3 rounded-lg bg-red-100 text-red-800 font-mono whitespace-pre-wrap">
                        {step.error}
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ds-on-surface-variant mb-1">
                        {t("testStepInput")}
                      </p>
                      <pre className="p-3 rounded-lg bg-ds-surface-container-lowest text-[11px] font-mono whitespace-pre-wrap break-words max-h-60 overflow-auto">
                        {step.input
                          .map((m) => `[${m.role}]\n${m.content}`)
                          .join("\n\n---\n\n") || "—"}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ds-on-surface-variant mb-1">
                        {t("testStepOutput")}
                      </p>
                      {isDryRun ? (
                        <p className="p-3 rounded-lg bg-ds-surface-container-lowest text-ds-on-surface-variant italic">
                          {t("testDryRunOutputNotice")}
                        </p>
                      ) : (
                        <pre className="p-3 rounded-lg bg-ds-surface-container-lowest text-[11px] font-mono whitespace-pre-wrap break-words max-h-60 overflow-auto">
                          {step.output ?? "—"}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {!isDryRun && (
        <SectionCard title={t("testSummary")}>
          <div className="grid grid-cols-3 gap-4">
            <SummaryCell
              label={t("testSummaryTokens")}
              value={result.totalTokens.toLocaleString()}
            />
            <SummaryCell
              label={t("testSummaryCost")}
              value={`$${Number(result.totalCost).toFixed(6)}`}
            />
            <SummaryCell
              label={t("testSummaryLatency")}
              value={`${result.totalLatency}ms`}
            />
          </div>
        </SectionCard>
      )}

      <HistoryList
        history={history}
        loading={historyLoading}
        locale={locale}
        onLoad={onLoadHistory}
        activeId={result.runId}
      />
    </>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 bg-ds-surface-container-low rounded-xl">
      <div className="text-[10px] font-bold uppercase tracking-widest text-ds-on-surface-variant mb-1">
        {label}
      </div>
      <div className="text-xl font-extrabold text-ds-primary tabular-nums">{value}</div>
    </div>
  );
}

interface HistoryListProps {
  history: TestRunSummary[];
  loading: boolean;
  locale: string;
  onLoad: (runId: string) => void;
  activeId?: string;
}

function HistoryList({ history, loading, locale, onLoad, activeId }: HistoryListProps) {
  const t = useTranslations("templates");
  return (
    <SectionCard title={t("testHistory")}>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-ds-on-surface-variant italic">{t("testHistoryEmpty")}</p>
      ) : (
        <div className="divide-y divide-ds-outline-variant/5">
          {history.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onLoad(run.id)}
              className={cn(
                "w-full flex items-center gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-ds-surface-container-low transition-colors text-left",
                run.id === activeId ? "bg-ds-primary/5" : "",
              )}
            >
              <StatusForRun status={run.status} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ds-on-surface">
                  {timeAgo(run.createdAt, locale)}
                </div>
                <div className="text-xs text-ds-on-surface-variant">
                  {run.mode === "dry_run" ? t("testModeDryRun") : t("testModeExecute")}
                  {run.totalTokens ? ` · ${run.totalTokens} tokens` : ""}
                  {run.totalCost ? ` · $${Number(run.totalCost).toFixed(6)}` : ""}
                  {run.totalLatency ? ` · ${run.totalLatency}ms` : ""}
                </div>
              </div>
              <span className="material-symbols-outlined text-ds-on-surface-variant/60">
                chevron_right
              </span>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
