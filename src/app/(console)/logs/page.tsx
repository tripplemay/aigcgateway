"use client";
import { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { timeAgo } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { SearchBar } from "@/components/search-bar";
import { Pagination } from "@/components/pagination";
import { useRouter } from "next/navigation";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

// ============================================================
// Types
// ============================================================

interface LogEntry {
  traceId: string;
  modelName: string;
  status: string;
  totalTokens: number | null;
  sellPrice: number | null;
  latencyMs: number | null;
  createdAt: string;
  promptPreview?: string;
}

const PAGE_SIZE = 20;

// ============================================================
// Component
// ============================================================

export default function LogsPage() {
  const t = useTranslations("logs");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();

  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQ(searchQ), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQ]);

  // ── Data loading via useAsyncData ──
  const { data: logsData, loading } = useAsyncData<{
    data: LogEntry[];
    pagination?: { total: number };
  }>(async () => {
    if (!current) return { data: [], pagination: { total: 0 } };
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter) params.set("status", statusFilter);
    if (modelFilter) params.set("model", modelFilter);
    const url = debouncedQ
      ? `/api/projects/${current.id}/logs/search?q=${encodeURIComponent(debouncedQ)}&page=${page}`
      : `/api/projects/${current.id}/logs?${params}`;
    return apiFetch<{ data: LogEntry[]; pagination?: { total: number } }>(url);
  }, [current, page, statusFilter, modelFilter, debouncedQ]);

  const logs = logsData?.data ?? [];
  const total = logsData?.pagination?.total ?? logs.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Extract unique model names for the filter dropdown
  const modelNames = [...new Set(logs.map((l) => l.modelName))].sort();

  const statusOptions = [
    { value: "", label: tc("all") },
    { value: "SUCCESS", label: t("success") },
    { value: "ERROR", label: t("errors") },
    { value: "FILTERED", label: t("filtered") },
  ];

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  return (
    <>
      {/* ═══ Page Header & Filters — design-draft/logs/code.html lines 155-175 ═══ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
            {t("title")}
          </h2>
          <p className="text-slate-500 font-medium mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter chips */}
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
          {/* Model filter dropdown */}
          <select
            value={modelFilter}
            onChange={(e) => {
              setModelFilter(e.target.value);
              setPage(1);
            }}
            className="bg-ds-surface-container-low px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border-none outline-none appearance-none cursor-pointer"
          >
            <option value="">
              {t("model")} ({tc("all")})
            </option>
            {modelNames.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ═══ Search bar ═══ */}
      <div className="mb-6">
        <SearchBar
          placeholder={t("searchPlaceholder")}
          value={searchQ}
          onChange={(v) => {
            setSearchQ(v);
            setPage(1);
          }}
          className="w-full"
        />
      </div>

      {/* ═══ Logs Table ═══ */}
      <div className="bg-ds-surface-container-lowest rounded-2xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6 py-4">{t("time")}</TableHead>
              <TableHead className="px-6 py-4">{t("trace")}</TableHead>
              <TableHead className="px-6 py-4">{t("model")}</TableHead>
              <TableHead className="px-6 py-4">{t("prompt")}</TableHead>
              <TableHead className="px-6 py-4">{tc("status")}</TableHead>
              <TableHead className="px-6 py-4">{t("tokens")}</TableHead>
              <TableHead className="px-6 py-4 text-right">{t("cost")}</TableHead>
              <TableHead className="px-6 py-4 text-right">{t("latency")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-50">
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-12 text-center text-ds-outline">
                  {tc("loading")}
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-12 text-center text-ds-outline">
                  {t("noLogsFound")}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((l) => (
                <TableRow
                  key={l.traceId}
                  onClick={() => router.push(`/logs/${l.traceId}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="px-6 py-4">
                    <span className="text-xs font-semibold text-slate-400" title={l.createdAt}>
                      {timeAgo(l.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <span className="text-sm font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {l.traceId.slice(0, 12)}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-slate-700">{l.modelName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-4 max-w-[240px]">
                    <p className="text-xs text-slate-500 truncate">{l.promptPreview || "—"}</p>
                  </TableCell>
                  <TableCell className="px-6 py-4">
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
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-600">
                      {l.totalTokens ? l.totalTokens.toLocaleString() : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <span className="text-xs font-medium text-slate-600">
                      {l.sellPrice != null ? `$${l.sellPrice.toFixed(4)}` : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <span className="text-xs font-medium text-slate-600">
                      {l.latencyMs != null ? `${l.latencyMs}ms` : "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={total}
            pageSize={PAGE_SIZE}
            className="px-6 py-4 bg-ds-surface-container-low/30"
          />
        )}
      </div>

      {/* ═══ Metrics Grid (Asymmetric Insight Panel) ═══ */}
      <div className="mt-8 grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-[var(--font-heading)] font-bold text-ds-on-surface">
              {t("latencyTrends")}
            </h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-indigo-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">{t("avgP95")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">{t("median")}</span>
              </div>
            </div>
          </div>
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
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-xl shadow-indigo-200">
            <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">
              {t("costOptimization")}
            </h4>
            <p className="text-2xl font-extrabold font-[var(--font-heading)] mb-4">
              {t("saveUpTo")}
            </p>
            <p className="text-xs opacity-90 leading-relaxed mb-6">
              {t("costOptimizationDesc", { model: "gpt-4o-mini" })}
            </p>
            <button className="w-full py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl text-xs font-bold transition-colors">
              {t("applySavings")}
            </button>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t("totalLogsVolume")}
              </h4>
              <span className="material-symbols-outlined text-slate-300">analytics</span>
            </div>
            <p className="text-3xl font-extrabold font-[var(--font-heading)] text-ds-on-surface">
              {total > 1000 ? `${(total / 1000).toFixed(1)}K` : total}
            </p>
            <p className="text-[10px] font-bold text-emerald-600 mt-1">{t("totalRecords")}</p>
          </div>
        </div>
      </div>
    </>
  );
}
