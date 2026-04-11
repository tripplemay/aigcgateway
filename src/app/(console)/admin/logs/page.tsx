"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Page Header ═══ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
            {t("title")}
          </h2>
          <p className="text-ds-on-surface-variant font-medium mt-1">{t("subtitle")}</p>
        </div>
      </div>

      {/* ═══ Tab Switcher ═══ */}
      <div className="flex bg-ds-surface-container-low p-1 rounded-xl w-fit">
        {(["api", "system"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? "text-indigo-700 bg-white rounded-lg shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "api" ? t("tabApiCalls") : t("tabSystemLogs")}
          </button>
        ))}
      </div>

      {activeTab === "api" ? <ApiCallsTab /> : <SystemLogsTab />}
    </div>
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
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${statusFilter === s ? "text-indigo-700 bg-white rounded-lg shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {s || tc("all")}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
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

      {/* Table */}
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
        <Pagination
          total={total}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
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
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${categoryFilter === c ? "text-indigo-700 bg-white rounded-lg shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
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
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${levelFilter === l ? "text-indigo-700 bg-white rounded-lg shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {l || tc("all")}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-ds-surface-container-lowest rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-ds-surface-container-low/50">
            <tr>
              {[
                t("syslogTime"),
                t("syslogCategory"),
                t("syslogLevel"),
                t("syslogMessage"),
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
                    <span className="text-xs font-semibold text-slate-400" title={l.createdAt}>
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
                    <div className="text-xs font-medium text-slate-700">{l.message}</div>
                    {expandedId === l.id && l.detail && (
                      <pre className="mt-2 text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3 overflow-x-auto max-h-48">
                        {JSON.stringify(l.detail, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination
          total={total}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
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
      <span className="text-xs font-medium text-slate-500">
        {total.toLocaleString()} {t("records")}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="p-1.5 rounded-lg hover:bg-white text-slate-400 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-lg">chevron_left</span>
        </button>
        <span className="px-3 py-1 rounded-lg bg-white shadow-sm text-indigo-600 font-bold text-xs">
          {page}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg hover:bg-white text-slate-400 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-lg">chevron_right</span>
        </button>
      </div>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, string> = {
    SYNC: "text-blue-700 bg-blue-50",
    INFERENCE: "text-violet-700 bg-violet-50",
    HEALTH_CHECK: "text-emerald-700 bg-emerald-50",
    AUTO_RECOVERY: "text-amber-700 bg-amber-50",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colorMap[category] ?? "text-slate-600 bg-slate-100"}`}
    >
      {category}
    </span>
  );
}

function LevelBadge({ level }: { level: string }) {
  const colorMap: Record<string, string> = {
    INFO: "text-blue-600 bg-blue-50",
    WARN: "text-amber-600 bg-amber-50",
    ERROR: "text-rose-600 bg-rose-50",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colorMap[level] ?? "text-slate-600 bg-slate-100"}`}
    >
      {level}
    </span>
  );
}
