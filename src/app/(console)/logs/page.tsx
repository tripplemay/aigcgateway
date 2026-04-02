"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { timeAgo } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

// ============================================================
// Types (unchanged)
// ============================================================

interface LogEntry {
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
  promptPreview?: string;
  promptSnapshot?: Array<{ role: string; content: string }>;
  requestParams?: Record<string, unknown>;
  responseContent?: string | null;
  errorMessage?: string | null;
}

// ============================================================
// Component
// ============================================================

export default function LogsPage() {
  const t = useTranslations("logs");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogEntry | null>(null);
  const [debouncedQ, setDebouncedQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQ(searchQ), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQ]);

  const load = useCallback(async () => {
    if (!current) return;
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (statusFilter) params.set("status", statusFilter);
    if (startDate) params.set("startTime", new Date(startDate).toISOString());
    if (endDate) params.set("endTime", new Date(endDate + "T23:59:59").toISOString());
    const url = debouncedQ
      ? `/api/projects/${current.id}/logs/search?q=${encodeURIComponent(debouncedQ)}&page=${page}`
      : `/api/projects/${current.id}/logs?${params}`;
    const r = await apiFetch<{ data: LogEntry[]; pagination?: { total: number } }>(url);
    setLogs(r.data);
    setTotal(r.pagination?.total ?? r.data.length);
  }, [current, page, statusFilter, debouncedQ, startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDetail = async (traceId: string) => {
    if (!current) return;
    if (selectedTrace === traceId) {
      setSelectedTrace(null);
      setDetail(null);
      return;
    }
    const r = await apiFetch<LogEntry>(`/api/projects/${current.id}/logs/${traceId}`);
    setDetail(r);
    setSelectedTrace(traceId);
  };

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const statusOptions = [
    { value: "", label: tc("all") },
    { value: "SUCCESS", label: "Success" },
    { value: "ERROR", label: "Errors" },
    { value: "FILTERED", label: "Filtered" },
  ];

  // ── Render — 1:1 replica of Logs (Full Redesign) code.html lines 153-401 ──
  return (
    <>
      {/* ═══ Page Header & Filters — code.html lines 155-175 ═══ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
            {t("title")}
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Real-time observability and inference telemetry
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter chips — code.html lines 161-165 */}
          <div className="flex bg-ds-surface-container-low p-1 rounded-xl">
            {statusOptions.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setStatusFilter(s.value);
                  setPage(1);
                }}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  statusFilter === s.value
                    ? "text-indigo-700 bg-white rounded-lg shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {/* Date filters */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="bg-ds-surface-container-low px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border-none outline-none"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="bg-ds-surface-container-low px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border-none outline-none"
            />
          </div>
        </div>
      </div>

      {/* ═══ Search bar ═══ */}
      <div className="relative mb-6">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
          search
        </span>
        <input
          className="w-full bg-ds-surface-container-low border-none rounded-full pl-12 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-ds-primary/20 transition-all placeholder:text-slate-400 outline-none"
          placeholder={t("searchPlaceholder")}
          type="text"
          value={searchQ}
          onChange={(e) => {
            setSearchQ(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* ═══ Logs Table — code.html lines 177-348 ═══ */}
      <div className="bg-ds-surface-container-lowest rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-ds-surface-container-low/50">
            <tr>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t("time")}
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t("trace")}
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t("model")}
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t("prompt")}
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {tc("status")}
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t("tokens")}
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">
                {t("cost")}
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">
                {t("latency")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.map((l) => (
              <>
                {/* Log Row — code.html lines 193-221 */}
                <tr
                  key={l.traceId}
                  onClick={() => loadDetail(l.traceId)}
                  className="hover:bg-ds-surface-container-low group cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-semibold text-slate-400" title={l.createdAt}>
                      {timeAgo(l.createdAt)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {l.traceId.slice(0, 12)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-slate-700">{l.modelName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 max-w-[240px]">
                    <p className="text-xs text-slate-500 truncate">{l.promptPreview || "—"}</p>
                  </td>
                  <td className="px-6 py-4">
                    {l.status === "SUCCESS" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight bg-green-100 text-green-700">
                        200 OK
                      </span>
                    ) : l.status === "FILTERED" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight bg-amber-100 text-amber-700">
                        FILTERED
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight bg-red-100 text-red-700">
                        ERROR
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-600">
                      {l.totalTokens ? l.totalTokens.toLocaleString() : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-xs font-medium text-slate-600">
                      {l.sellPrice != null ? `$${l.sellPrice.toFixed(4)}` : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-xs font-medium text-slate-600">
                      {l.latencyMs != null ? `${l.latencyMs}ms` : "—"}
                    </span>
                  </td>
                </tr>

                {/* Expanded Detail — code.html lines 223-297 */}
                {selectedTrace === l.traceId && detail && (
                  <tr key={`${l.traceId}-detail`} className="bg-indigo-50/30">
                    <td className="p-0" colSpan={8}>
                      <div className="px-8 py-8 flex flex-col gap-8">
                        {/* Metrics grid — code.html lines 226-246 */}
                        <div className="grid grid-cols-4 gap-6">
                          <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100/50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                              Trace ID
                            </p>
                            <p className="text-sm font-mono text-slate-800">{detail.traceId}</p>
                          </div>
                          <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100/50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                              Timestamp
                            </p>
                            <p className="text-sm font-medium text-slate-800">
                              {new Date(detail.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100/50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                              Total Tokens
                            </p>
                            <p className="text-sm font-medium text-slate-800">
                              {detail.totalTokens?.toLocaleString() ?? "—"}
                              {detail.promptTokens ? ` (${detail.promptTokens} prompt)` : ""}
                            </p>
                          </div>
                          <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100/50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                              {t("latency")}
                            </p>
                            <p className="text-sm font-medium text-slate-800">
                              {detail.latencyMs != null ? `${detail.latencyMs}ms` : "—"}
                              {detail.ttftMs != null ? ` (TTFT ${detail.ttftMs}ms)` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Prompt & Response — code.html lines 247-282 */}
                        <div className="grid grid-cols-2 gap-8">
                          {/* Prompt Messages */}
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                              <span className="material-symbols-outlined text-sm">input</span>{" "}
                              {t("prompt")}
                            </h4>
                            <div className="space-y-3">
                              {detail.promptSnapshot?.map((m, i) => (
                                <div
                                  key={i}
                                  className={
                                    m.role === "system"
                                      ? "bg-slate-100/80 p-4 rounded-xl"
                                      : "bg-white p-4 rounded-xl border border-slate-100"
                                  }
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        m.role === "system"
                                          ? "bg-slate-200 text-slate-600"
                                          : "bg-indigo-100 text-indigo-700"
                                      }`}
                                    >
                                      {m.role.toUpperCase()}
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                    {m.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Model Response */}
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                              <span className="material-symbols-outlined text-sm">output</span>{" "}
                              {t("response")}
                            </h4>
                            {detail.responseContent ? (
                              <div className="bg-white p-6 rounded-xl border-l-4 border-indigo-500 shadow-sm relative">
                                <span className="absolute top-4 right-4 text-[10px] font-bold text-indigo-400 uppercase">
                                  Assistant
                                </span>
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                  {detail.responseContent}
                                </p>
                                {detail.finishReason && (
                                  <div className="mt-4 pt-4 border-t border-slate-50">
                                    <span className="text-[10px] text-slate-400">
                                      Finish Reason: {detail.finishReason}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : detail.errorMessage ? (
                              <div className="bg-red-50 p-6 rounded-xl border-l-4 border-red-500">
                                <p className="text-sm text-red-700 leading-relaxed whitespace-pre-wrap">
                                  {detail.errorMessage}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400 italic">No response content</p>
                            )}
                          </div>
                        </div>

                        {/* JSON Parameters — code.html lines 283-295 */}
                        {detail.requestParams && (
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                              {t("parameters")}
                            </h4>
                            <div className="bg-[#1e1e2e] p-4 rounded-xl font-mono text-xs text-indigo-200 overflow-x-auto">
                              <pre>{JSON.stringify(detail.requestParams, null, 2)}</pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-ds-outline">
                  No logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination — code.html lines 332-347 */}
        <div className="px-6 py-4 bg-ds-surface-container-low/30 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            {t("showing") ?? "Showing"} {(page - 1) * 20 + 1}-{Math.min(page * 20, total)}{" "}
            {tc("of") ?? "of"} {total.toLocaleString()} {t("traces") ?? "traces"}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-white text-slate-400 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                    pageNum === page
                      ? "bg-white shadow-sm text-indigo-600 font-bold"
                      : "hover:bg-white text-slate-500"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            {totalPages > 5 && page < totalPages - 2 && (
              <>
                <span className="px-2 text-slate-400">...</span>
                <button
                  onClick={() => setPage(totalPages)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-slate-500 font-medium text-xs transition-colors"
                >
                  {totalPages}
                </button>
              </>
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-white text-slate-400 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Metrics Grid (Asymmetric Insight Panel) — code.html lines 349-400 ═══ */}
      <div className="mt-8 grid grid-cols-12 gap-6">
        {/* Left: Latency Trends — lines 351-383 */}
        <div className="col-span-12 lg:col-span-8 bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-[var(--font-heading)] font-bold text-ds-on-surface">
              Recent Latency Trends
            </h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-indigo-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Avg P95</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Median</span>
              </div>
            </div>
          </div>
          {/* Faux chart bars — lines 366-382 */}
          <div className="h-48 w-full flex items-end justify-between gap-1">
            {[60, 45, 70, 85, 40, 55, 65, 75, 30, 90, 50, 60, 40, 70, 85].map((h, i) => (
              <div
                key={i}
                className={`w-full rounded-t-sm ${i === 4 || i === 11 ? "bg-indigo-600" : i === 3 ? "bg-indigo-200" : "bg-indigo-100"}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        {/* Right: Insight Cards — lines 384-399 */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Cost Optimization — lines 385-390 */}
          <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-xl shadow-indigo-200">
            <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">
              Cost Optimization
            </h4>
            <p className="text-2xl font-extrabold font-[var(--font-heading)] mb-4">
              Save up to 32%
            </p>
            <p className="text-xs opacity-90 leading-relaxed mb-6">
              Switching your frequent queries to{" "}
              <span className="font-bold underline">gpt-4o-mini</span> could significantly reduce
              your infra costs based on last 7 days of traffic.
            </p>
            <button className="w-full py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl text-xs font-bold transition-colors">
              Apply Savings
            </button>
          </div>
          {/* Total Logs Volume — lines 391-398 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Total Logs Volume
              </h4>
              <span className="material-symbols-outlined text-slate-300">analytics</span>
            </div>
            <p className="text-3xl font-extrabold font-[var(--font-heading)] text-ds-on-surface">
              {total > 1000 ? `${(total / 1000).toFixed(1)}K` : total}
            </p>
            <p className="text-[10px] font-bold text-emerald-600 mt-1">Total records</p>
          </div>
        </div>
      </div>
    </>
  );
}
