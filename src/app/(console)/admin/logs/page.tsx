"use client";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCNY, timeAgo } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/use-exchange-rate";

// ============================================================
// Types
// ============================================================

interface LogEntry {
  traceId: string;
  projectName: string;
  modelName: string;
  channelId: string;
  channelProvider: string;
  channelRealModelId: string;
  status: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costPrice: number | null;
  sellPrice: number | null;
  latencyMs: number | null;
  createdAt: string;
}

interface LogsResponse {
  data: LogEntry[];
  pagination?: { total: number };
}

// ============================================================
// Page
// ============================================================

export default function AdminLogsPage() {
  const t = useTranslations("adminLogs");
  const tl = useTranslations("logs");
  const tc = useTranslations("common");
  const exchangeRate = useExchangeRate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");

  const { data, loading } = useAsyncData<LogsResponse>(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (statusFilter) params.set("status", statusFilter);
    const url = committedSearch
      ? `/api/admin/logs/search?q=${encodeURIComponent(committedSearch)}&page=${page}`
      : `/api/admin/logs?${params}`;
    return apiFetch<LogsResponse>(url);
  }, [page, statusFilter, committedSearch]);

  const logs = data?.data ?? [];
  const total = data?.pagination?.total ?? logs.length;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const doSearch = () => {
    setPage(1);
    setCommittedSearch(searchQ);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Page Header — code.html lines 179-203 ═══ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
            {t("title")}
          </h2>
          <p className="text-ds-on-surface-variant font-medium mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-ds-surface-container-low p-1 rounded-xl">
            {["", "SUCCESS", "ERROR", "FILTERED"].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${statusFilter === s ? "text-indigo-700 bg-white rounded-lg shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {s || tc("all")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Search — code.html search area ═══ */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
          search
        </span>
        <input
          className="w-full bg-ds-surface-container-low border-none rounded-full pl-12 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-ds-primary/20 placeholder:text-slate-400 outline-none"
          placeholder={tl("searchPlaceholder")}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
      </div>

      {/* ═══ Table — code.html lines 232-435 ═══ */}
      <div className="bg-ds-surface-container-lowest rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-ds-surface-container-low/50">
            <tr>
              {[
                tl("time"),
                tl("trace"),
                t("project"),
                tl("model"),
                t("channel"),
                tc("status"),
                tl("tokens"),
                tl("cost"),
                t("sell"),
                tl("latency"),
              ].map((h) => (
                <th
                  key={h}
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-ds-outline">
                  {tc("loading")}
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.traceId} className="hover:bg-ds-surface-container-low transition-colors">
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
                  <td className="px-6 py-4 text-xs font-medium">{l.projectName}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-700">{l.modelName}</td>
                  <td className="px-6 py-4 text-xs text-slate-500" title={l.channelId}>
                    {l.channelProvider}/{l.channelRealModelId}
                  </td>
                  <td className="px-6 py-4">
                    {l.status === "SUCCESS" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700">
                        OK
                      </span>
                    ) : l.status === "FILTERED" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700">
                        FILTERED
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700">
                        {l.status}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600">
                    {l.promptTokens?.toLocaleString() ?? "—"}/
                    {l.completionTokens?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600">
                    {l.costPrice != null ? formatCNY(l.costPrice, exchangeRate) : "—"}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600">
                    {l.sellPrice != null ? formatCNY(l.sellPrice, exchangeRate) : "—"}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600">
                    {l.latencyMs != null ? `${(l.latencyMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {/* Pagination */}
        <div className="px-6 py-4 bg-ds-surface-container-low/30 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            {total.toLocaleString()} {t("records")}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-white text-slate-400 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            <span className="px-3 py-1 rounded-lg bg-white shadow-sm text-indigo-600 font-bold text-xs">
              {page}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-white text-slate-400 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
