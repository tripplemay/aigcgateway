"use client";
import { useEffect, useState, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { timeAgo, formatCNY } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { PageLoader } from "@/components/page-loader";
import { TableCard } from "@/components/table-card";
import { TableLoader } from "@/components/table-loader";
import { StatusChip } from "@/components/status-chip";
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
  const locale = useLocale();
  const exchangeRate = useExchangeRate();
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
      <PageContainer data-testid="logs-loading">
        <PageLoader />
      </PageContainer>
    );
  if (!current) return <EmptyState onCreated={() => router.refresh()} />;

  return (
    <PageContainer data-testid="logs-page">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
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
        }
      />

      <SearchBar
        placeholder={t("searchPlaceholder")}
        value={searchQ}
        onChange={(v) => {
          setSearchQ(v);
          setPage(1);
        }}
        className="w-full"
      />

      <TableCard>
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
              <TableLoader colSpan={8} />
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
                      {timeAgo(l.createdAt, locale)}
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
                      <StatusChip variant="success">200 OK</StatusChip>
                    ) : l.status === "FILTERED" ? (
                      <StatusChip variant="warning">FILTERED</StatusChip>
                    ) : (
                      <StatusChip variant="error">ERROR</StatusChip>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-600">
                      {l.totalTokens ? l.totalTokens.toLocaleString() : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <span className="text-xs font-medium text-slate-600">
                      {l.sellPrice != null ? formatCNY(l.sellPrice, exchangeRate) : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <span className="text-xs font-medium text-slate-600">
                      {l.latencyMs != null ? `${l.latencyMs.toLocaleString()}ms` : "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

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
      </TableCard>
    </PageContainer>
  );
}
