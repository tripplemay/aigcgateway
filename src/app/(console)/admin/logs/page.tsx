"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { formatCNY, timeAgo } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { TableCard } from "@/components/table-card";
import { StatusChip } from "@/components/status-chip";

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

interface SystemLogEntry {
  id: string;
  category: string;
  level: string;
  message: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

interface SystemLogsResponse {
  data: SystemLogEntry[];
  pagination: { total: number; page: number; pageSize: number };
}

type TabKey = "api" | "system";

// ============================================================
// Page
// ============================================================

export default function AdminLogsPage() {
  const t = useTranslations("adminLogs");
  const tc = useTranslations("common");
  const [activeTab, setActiveTab] = useState<TabKey>("api");

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* ═══ Tab Switcher ═══ */}
      <div className="flex bg-ds-surface-container-low p-1 rounded-xl w-fit">
        {(["api", "system"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? "text-ds-primary bg-ds-surface-container-lowest rounded-lg shadow-sm"
                : "text-ds-on-surface-variant hover:text-ds-on-surface"
            }`}
          >
            {tab === "api" ? t("tabApiCalls") : t("tabSystemLogs")}
          </button>
        ))}
      </div>

      {activeTab === "api" ? <ApiCallsTab /> : <SystemLogsTab />}
    </PageContainer>
  );
}

// ============================================================
// API Calls Tab
// ============================================================

function ApiCallsTab() {
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
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-ds-surface-container-low p-1 rounded-xl">
          {["", "SUCCESS", "ERROR", "FILTERED"].map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${statusFilter === s ? "text-ds-primary bg-ds-surface-container-lowest rounded-lg shadow-sm" : "text-ds-on-surface-variant hover:text-ds-on-surface"}`}
            >
              {s || tc("all")}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-ds-outline text-lg">
          search
        </span>
        <input
          className="w-full bg-ds-surface-container-low border-none rounded-full pl-12 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-ds-primary/20 placeholder:text-ds-outline outline-none"
          placeholder={tl("searchPlaceholder")}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
      </div>

      {/* Table */}
      <TableCard>
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
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-ds-outline"
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
                    <span className="text-xs font-semibold text-ds-outline" title={l.createdAt}>
                      {timeAgo(l.createdAt)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-mono text-ds-primary bg-ds-primary-container px-2 py-0.5 rounded">
                      {l.traceId.slice(0, 12)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium">{l.projectName}</td>
                  <td className="px-6 py-4 text-xs font-bold text-ds-on-surface">{l.modelName}</td>
                  <td className="px-6 py-4 text-xs text-ds-on-surface-variant" title={l.channelId}>
                    {l.channelProvider}/{l.channelRealModelId}
                  </td>
                  <td className="px-6 py-4">
                    {l.status === "SUCCESS" ? (
                      <StatusChip variant="success">OK</StatusChip>
                    ) : l.status === "FILTERED" ? (
                      <StatusChip variant="warning">FILTERED</StatusChip>
                    ) : (
                      <StatusChip variant="error">{l.status}</StatusChip>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-ds-on-surface">
                    {l.promptTokens?.toLocaleString() ?? "—"}/
                    {l.completionTokens?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-ds-on-surface">
                    {l.costPrice != null ? formatCNY(l.costPrice, exchangeRate) : "—"}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-ds-on-surface">
                    {l.sellPrice != null ? formatCNY(l.sellPrice, exchangeRate) : "—"}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-ds-on-surface">
                    {l.latencyMs != null ? `${(l.latencyMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {/* Pagination */}
        <Pagination total={total} page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableCard>
    </>
  );
}

// ============================================================
// System Logs Tab
// ============================================================

function SystemLogsTab() {
  const t = useTranslations("adminLogs");
  const tc = useTranslations("common");
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  const { data, loading } = useAsyncData<SystemLogsResponse>(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (categoryFilter) params.set("category", categoryFilter);
    if (levelFilter) params.set("level", levelFilter);
    return apiFetch<SystemLogsResponse>(`/api/admin/system-logs?${params}`);
  }, [page, categoryFilter, levelFilter]);

  const logs = data?.data ?? [];
  const total = data?.pagination?.total ?? logs.length;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-ds-surface-container-low p-1 rounded-xl">
          {["", "SYNC", "INFERENCE", "HEALTH_CHECK", "AUTO_RECOVERY"].map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategoryFilter(c);
                setPage(1);
              }}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${categoryFilter === c ? "text-ds-primary bg-ds-surface-container-lowest rounded-lg shadow-sm" : "text-ds-on-surface-variant hover:text-ds-on-surface"}`}
            >
              {c || tc("all")}
            </button>
          ))}
        </div>
        <div className="flex bg-ds-surface-container-low p-1 rounded-xl">
          {["", "INFO", "WARN", "ERROR"].map((l) => (
            <button
              key={l}
              onClick={() => {
                setLevelFilter(l);
                setPage(1);
              }}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${levelFilter === l ? "text-ds-primary bg-ds-surface-container-lowest rounded-lg shadow-sm" : "text-ds-on-surface-variant hover:text-ds-on-surface"}`}
            >
              {l || tc("all")}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <TableCard>
        <table className="w-full text-left border-collapse">
          <thead className="bg-ds-surface-container-low/50">
            <tr>
              {[t("syslogTime"), t("syslogCategory"), t("syslogLevel"), t("syslogMessage")].map(
                (h) => (
                  <th
                    key={h}
                    className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-ds-outline"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-ds-outline">
                  {tc("loading")}
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-ds-outline">
                  {t("noSystemLogs")}
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr
                  key={l.id}
                  className="hover:bg-ds-surface-container-low transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-semibold text-ds-outline" title={l.createdAt}>
                      {timeAgo(l.createdAt)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <CategoryBadge category={l.category} />
                  </td>
                  <td className="px-6 py-4">
                    <LevelBadge level={l.level} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-medium text-ds-on-surface">{l.message}</div>
                    {expandedId === l.id && l.detail && (
                      <pre className="mt-2 text-[11px] text-ds-on-surface-variant bg-ds-surface-container-low rounded-lg p-3 overflow-x-auto max-h-48">
                        {JSON.stringify(l.detail, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination total={total} page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableCard>
    </>
  );
}

// ============================================================
// Shared sub-components
// ============================================================

function Pagination({
  total,
  page,
  totalPages,
  onPageChange,
}: {
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const t = useTranslations("adminLogs");
  return (
    <div className="px-6 py-4 bg-ds-surface-container-low/30 flex items-center justify-between">
      <span className="text-xs font-medium text-ds-on-surface-variant">
        {total.toLocaleString()} {t("records")}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="p-1.5 rounded-lg hover:bg-white text-ds-outline disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-lg">chevron_left</span>
        </button>
        <span className="px-3 py-1 rounded-lg bg-white shadow-sm text-ds-primary font-bold text-xs">
          {page}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg hover:bg-white text-ds-outline disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-lg">chevron_right</span>
        </button>
      </div>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const variantMap: Record<string, "info" | "neutral" | "success" | "warning"> = {
    SYNC: "info",
    INFERENCE: "neutral",
    HEALTH_CHECK: "success",
    AUTO_RECOVERY: "warning",
  };
  return <StatusChip variant={variantMap[category] ?? "neutral"}>{category}</StatusChip>;
}

function LevelBadge({ level }: { level: string }) {
  const variantMap: Record<string, "info" | "warning" | "error" | "neutral"> = {
    INFO: "info",
    WARN: "warning",
    ERROR: "error",
  };
  return <StatusChip variant={variantMap[level] ?? "neutral"}>{level}</StatusChip>;
}
