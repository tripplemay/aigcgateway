"use client";
/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-03 — admin /admin/reconciliation 面板。
 *
 * BL-RECON-UX-PHASE1 F-RC-02 增强：
 *   - 默认 sortDir=desc（最新在顶，用户明确要求）；表头日期列可切 asc/desc
 *   - 日期范围 picker（默认 today-30 / today）+ Tier 按钮组（All/1/2）
 *   + 模型搜索（debounce 300ms）+ 分页（20/50/100/200，默认 50）
 *   - CSV 导出按钮（>10000 行 toast 错误）
 *   - 阈值配置 SectionCard：4 个 input → PUT /api/admin/config × 4
 *   - cards/trend 与明细表两路 fetch（spec § Risks 第 3 项）
 *
 * 区块：
 *   1) Provider summary cards（顶部，固定 30 天聚合）
 *   2) 30 天 delta 趋势折线
 *   3) 阈值配置（新区块）
 *   4) 手动重跑
 *   5) 明细表（带筛选 + 分页 + 排序 + CSV 导出）
 */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const TrendChart = dynamic(() => import("./trend-chart").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full" />,
});

interface ReconRow {
  id: string;
  providerId: string;
  providerName: string;
  providerDisplayName: string;
  reportDate: string;
  tier: number;
  modelName: string | null;
  upstreamAmount: number;
  gatewayAmount: number;
  delta: number;
  deltaPercent: number | null;
  status: "MATCH" | "MINOR_DIFF" | "BIG_DIFF";
  details: Record<string, unknown>;
  computedAt: string;
}

interface ReconResponse {
  data: ReconRow[];
  meta: { total: number; page: number; pageSize: number };
}

interface SystemConfigRow {
  key: string;
  value: string;
  description?: string | null;
}

interface RerunResult {
  reportDate: string;
  providersInspected: number;
  rowsWritten: number;
  bigDiffs: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  MATCH: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "MATCH",
  },
  MINOR_DIFF: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", label: "MINOR" },
  BIG_DIFF: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", label: "BIG" },
};

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;

const THRESHOLD_KEYS = {
  matchDelta: "RECONCILIATION_MATCH_DELTA_USD",
  matchPercent: "RECONCILIATION_MATCH_PERCENT",
  minorDelta: "RECONCILIATION_MINOR_DELTA_USD",
  minorPercent: "RECONCILIATION_MINOR_PERCENT",
} as const;

export default function ReconciliationPage() {
  const t = useTranslations("adminReconciliation");

  // ----- Detail-table filter state -----
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterProvider, setFilterProvider] = useState<string>("");
  const [filterStart, setFilterStart] = useState<string>(daysAgo(30));
  const [filterEnd, setFilterEnd] = useState<string>(todayStr());
  const [filterTier, setFilterTier] = useState<"" | "1" | "2">("");
  const [filterModel, setFilterModel] = useState<string>("");
  const filterModelDebounced = useDebouncedValue(filterModel, 300);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // ----- Misc state -----
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rerunDate, setRerunDate] = useState(yesterdayStr());
  const [rerunProvider, setRerunProvider] = useState("");
  const [rerunBusy, setRerunBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // F-RC-02 §8 — cards/trend 两路 fetch：固定 30 天 / pageSize=200，不受 filter 影响
  const { data: aggregate, refetch: reloadAggregate } = useAsyncData<ReconResponse>(
    () => apiFetch<ReconResponse>(`/api/admin/reconciliation?pageSize=200&page=1&sort=desc`),
    [],
  );
  const aggregateRows = useMemo(() => aggregate?.data ?? [], [aggregate]);
  const cards = useMemo(() => buildCards(aggregateRows), [aggregateRows]);
  const trend = useMemo(() => buildTrend(aggregateRows), [aggregateRows]);

  // 明细表独立分页 fetch
  const detailQs = useMemo(() => {
    const qs = new URLSearchParams();
    if (filterStart) qs.set("start", filterStart);
    if (filterEnd) qs.set("end", filterEnd);
    if (filterProvider) qs.set("providerId", filterProvider);
    if (filterStatus) qs.set("status", filterStatus);
    if (filterTier) qs.set("tier", filterTier);
    if (filterModelDebounced) qs.set("modelSearch", filterModelDebounced);
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));
    qs.set("sort", sortDir);
    return qs.toString();
  }, [
    filterStart,
    filterEnd,
    filterProvider,
    filterStatus,
    filterTier,
    filterModelDebounced,
    page,
    pageSize,
    sortDir,
  ]);

  const { data: bundle, refetch: loadDetail } = useAsyncData<ReconResponse>(
    () => apiFetch<ReconResponse>(`/api/admin/reconciliation?${detailQs}`),
    [detailQs],
  );
  const rows = bundle?.data ?? [];
  const meta = bundle?.meta ?? { total: 0, page: 1, pageSize };
  const totalPages = Math.max(1, Math.ceil(meta.total / pageSize));
  const bigDiffCount = aggregateRows.filter((r) => r.status === "BIG_DIFF").length;

  // 切 filter 时重置到第 1 页（避免在不存在的 page 上空表）
  // sortDir 切换不重置——用户期望保持 page 体验仅顺序变化
  useEffect(() => {
    setPage(1);
  }, [
    filterStatus,
    filterProvider,
    filterStart,
    filterEnd,
    filterTier,
    filterModelDebounced,
    pageSize,
  ]);

  // ----- 阈值配置 -----
  const { data: configs, refetch: reloadConfigs } = useAsyncData<{ data: SystemConfigRow[] }>(
    () => apiFetch<{ data: SystemConfigRow[] }>(`/api/admin/config`),
    [],
  );
  const [matchDelta, setMatchDelta] = useState("0.5");
  const [matchPercent, setMatchPercent] = useState("5");
  const [minorDelta, setMinorDelta] = useState("5");
  const [minorPercent, setMinorPercent] = useState("20");
  const [thresholdsBusy, setThresholdsBusy] = useState(false);

  useEffect(() => {
    if (!configs?.data) return;
    const map = new Map(configs.data.map((c) => [c.key, c.value]));
    if (map.has(THRESHOLD_KEYS.matchDelta)) setMatchDelta(map.get(THRESHOLD_KEYS.matchDelta)!);
    if (map.has(THRESHOLD_KEYS.matchPercent))
      setMatchPercent(map.get(THRESHOLD_KEYS.matchPercent)!);
    if (map.has(THRESHOLD_KEYS.minorDelta)) setMinorDelta(map.get(THRESHOLD_KEYS.minorDelta)!);
    if (map.has(THRESHOLD_KEYS.minorPercent))
      setMinorPercent(map.get(THRESHOLD_KEYS.minorPercent)!);
  }, [configs]);

  const handleSaveThresholds = async () => {
    setThresholdsBusy(true);
    try {
      const pairs: Array<[string, string]> = [
        [THRESHOLD_KEYS.matchDelta, matchDelta],
        [THRESHOLD_KEYS.matchPercent, matchPercent],
        [THRESHOLD_KEYS.minorDelta, minorDelta],
        [THRESHOLD_KEYS.minorPercent, minorPercent],
      ];
      for (const [key, value] of pairs) {
        await apiFetch(`/api/admin/config`, {
          method: "PUT",
          body: JSON.stringify({ key, value }),
        });
      }
      toast.success(t("thresholdSaved"));
      reloadConfigs();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setThresholdsBusy(false);
    }
  };

  // ----- 手动重跑 -----
  const handleRerun = async () => {
    if (!rerunDate) return;
    setRerunBusy(true);
    try {
      const result = await apiFetch<RerunResult>("/api/admin/reconciliation/rerun", {
        method: "POST",
        body: JSON.stringify({
          date: rerunDate,
          ...(rerunProvider ? { providerId: rerunProvider } : {}),
        }),
      });
      toast.success(
        t("rerunSuccess", {
          rows: result.rowsWritten,
          bigDiffs: result.bigDiffs,
        }),
      );
      loadDetail();
      reloadAggregate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRerunBusy(false);
    }
  };

  // ----- CSV 导出 -----
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const exportQs = new URLSearchParams();
      if (filterStart) exportQs.set("start", filterStart);
      if (filterEnd) exportQs.set("end", filterEnd);
      if (filterProvider) exportQs.set("providerId", filterProvider);
      if (filterStatus) exportQs.set("status", filterStatus);
      if (filterTier) exportQs.set("tier", filterTier);
      if (filterModelDebounced) exportQs.set("modelSearch", filterModelDebounced);
      exportQs.set("sort", sortDir);

      const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
      const res = await fetch(`/api/admin/reconciliation/export?${exportQs.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let code: string | undefined;
        try {
          const body = await res.json();
          code = body?.error?.code;
        } catch {
          // ignore
        }
        if (res.status === 400 && code === "row_count_exceeds_cap") {
          toast.error(t("exportTooLarge"));
        } else {
          toast.error(`Export failed: ${res.status}`);
        }
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      const filename = m ? m[1] : `reconciliation-${todayStr()}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const toggleSort = () => setSortDir((d) => (d === "desc" ? "asc" : "desc"));

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("description")} />

      {/* Provider summary cards */}
      <SectionCard title={t("summaryCards")}>
        {cards.length === 0 ? (
          <p className="text-sm text-ds-on-surface-variant">{t("emptyToday")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {cards.map((c) => (
              <div
                key={c.providerId}
                className={`p-4 rounded-lg ${STATUS_STYLES[c.worstStatus]?.bg ?? "bg-ds-surface-container-low"}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-sm">{c.providerDisplayName}</h4>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_STYLES[c.worstStatus]?.text ?? ""}`}
                  >
                    {STATUS_STYLES[c.worstStatus]?.label ?? c.worstStatus}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-1 text-xs">
                  <dt className="text-ds-on-surface-variant">{t("today")}</dt>
                  <dd className="text-right">{fmtUsd(c.deltaToday)}</dd>
                  <dt className="text-ds-on-surface-variant">{t("week")}</dt>
                  <dd className="text-right">{fmtUsd(c.deltaWeek)}</dd>
                  <dt className="text-ds-on-surface-variant">{t("month")}</dt>
                  <dd className="text-right">{fmtUsd(c.deltaMonth)}</dd>
                </dl>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 30 天 delta 趋势 */}
      <SectionCard title={t("trendTitle")}>
        <TrendChart points={trend} />
      </SectionCard>

      {/* 阈值配置（F-RC-02 新区块） */}
      <SectionCard title={t("thresholdsTitle")}>
        <p className="text-xs text-ds-on-surface-variant mb-3">{t("thresholdsDesc")}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <ThresholdInput label={t("thMatchDelta")} value={matchDelta} onChange={setMatchDelta} />
          <ThresholdInput
            label={t("thMatchPercent")}
            value={matchPercent}
            onChange={setMatchPercent}
          />
          <ThresholdInput label={t("thMinorDelta")} value={minorDelta} onChange={setMinorDelta} />
          <ThresholdInput
            label={t("thMinorPercent")}
            value={minorPercent}
            onChange={setMinorPercent}
          />
        </div>
        <button
          onClick={handleSaveThresholds}
          disabled={thresholdsBusy}
          className="bg-ds-primary-container text-ds-on-primary-container px-6 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50"
        >
          {thresholdsBusy ? t("rerunBusy") : t("save")}
        </button>
      </SectionCard>

      {/* 手动重跑 */}
      <SectionCard title={t("rerunTitle")}>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant">
              {t("rerunDate")}
            </span>
            <input
              type="date"
              className="bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm"
              value={rerunDate}
              onChange={(e) => setRerunDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant">
              {t("rerunProvider")}
            </span>
            <input
              type="text"
              placeholder="(all)"
              className="bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm w-40"
              value={rerunProvider}
              onChange={(e) => setRerunProvider(e.target.value)}
            />
          </label>
          <button
            onClick={handleRerun}
            disabled={rerunBusy || !rerunDate}
            className="bg-ds-primary-container text-ds-on-primary-container px-6 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50"
          >
            {rerunBusy ? t("rerunBusy") : t("rerunButton")}
          </button>
        </div>
      </SectionCard>

      {/* 明细表 */}
      <SectionCard
        title={t("bigDiffTitle", { count: bigDiffCount })}
        actions={
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="bg-ds-secondary-container text-ds-on-secondary-container px-4 py-2 rounded-lg font-bold text-xs disabled:opacity-50"
          >
            {exporting ? t("rerunBusy") : t("exportCsv")}
          </button>
        }
      >
        {/* 筛选行 */}
        <div className="flex flex-wrap gap-3 mb-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
              {t("dateRangeStart")}
            </span>
            <input
              type="date"
              className="bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
              {t("dateRangeEnd")}
            </span>
            <input
              type="date"
              className="bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
            />
          </label>
          {/* Tier 按钮组 */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
              Tier
            </span>
            <div
              className="inline-flex rounded-lg overflow-hidden bg-ds-surface-container-low"
              role="group"
              aria-label="tier"
            >
              <TierButton active={filterTier === ""} onClick={() => setFilterTier("")}>
                {t("tierAll")}
              </TierButton>
              <TierButton active={filterTier === "1"} onClick={() => setFilterTier("1")}>
                {t("tierOne")}
              </TierButton>
              <TierButton active={filterTier === "2"} onClick={() => setFilterTier("2")}>
                {t("tierTwo")}
              </TierButton>
            </div>
          </div>
          <select
            className="bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">{t("allStatus")}</option>
            <option value="MATCH">MATCH</option>
            <option value="MINOR_DIFF">MINOR_DIFF</option>
            <option value="BIG_DIFF">BIG_DIFF</option>
          </select>
          <input
            type="text"
            placeholder={t("providerIdPlaceholder")}
            className="bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm w-40"
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
          />
          <input
            type="text"
            placeholder={t("modelSearchPlaceholder")}
            className="bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm w-44"
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
          />
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-ds-on-surface-variant">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ds-on-surface-variant">
                <tr>
                  <th className="pb-2">
                    <button
                      onClick={toggleSort}
                      className="inline-flex items-center gap-1 hover:text-ds-on-surface uppercase tracking-wider font-bold"
                      aria-label={sortDir === "desc" ? t("sortDesc") : t("sortAsc")}
                    >
                      {t("colDate")}
                      <span aria-hidden="true">{sortDir === "desc" ? "▼" : "▲"}</span>
                    </button>
                  </th>
                  <th className="pb-2">{t("colProvider")}</th>
                  <th className="pb-2">{t("colModel")}</th>
                  <th className="pb-2 text-right">{t("colUpstream")}</th>
                  <th className="pb-2 text-right">{t("colGateway")}</th>
                  <th className="pb-2 text-right">{t("colDelta")}</th>
                  <th className="pb-2">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <RowItem
                    key={r.id}
                    row={r}
                    expanded={expandedId === r.id}
                    onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 bar */}
        <PaginationBar
          page={meta.page}
          pageSize={pageSize}
          total={meta.total}
          totalPages={totalPages}
          onPage={(p) => setPage(p)}
          onPageSize={(ps) => setPageSize(ps)}
          pageSizeLabel={t("pageSize")}
        />
      </SectionCard>
    </PageContainer>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ThresholdInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
        {label}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        className="bg-ds-surface-container-low rounded-lg px-3 py-2 text-sm font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TierButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-2 text-sm font-bold transition-colors ${
        active
          ? "bg-ds-primary-container text-ds-on-primary-container"
          : "text-ds-on-surface-variant hover:text-ds-on-surface"
      }`}
    >
      {children}
    </button>
  );
}

function PaginationBar({
  page,
  pageSize,
  total,
  totalPages,
  onPage,
  onPageSize,
  pageSizeLabel,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (p: number) => void;
  onPageSize: (ps: number) => void;
  pageSizeLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs text-ds-on-surface-variant">
      <span>
        {total} rows · page {page} / {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="uppercase tracking-wider">{pageSizeLabel}</span>
          <select
            className="bg-ds-surface-container-low rounded-lg px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1 rounded-lg bg-ds-surface-container-low disabled:opacity-40"
        >
          ‹
        </button>
        <button
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1 rounded-lg bg-ds-surface-container-low disabled:opacity-40"
        >
          ›
        </button>
      </div>
    </div>
  );
}

function RowItem({
  row,
  expanded,
  onToggle,
}: {
  row: ReconRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = STATUS_STYLES[row.status];
  return (
    <>
      <tr className="cursor-pointer hover:bg-ds-surface-container-low/40" onClick={onToggle}>
        <td className="py-2 font-mono text-xs">{row.reportDate.slice(0, 10)}</td>
        <td className="py-2">{row.providerDisplayName}</td>
        <td className="py-2 font-mono text-xs">{row.modelName ?? "(all)"}</td>
        <td className="py-2 text-right font-mono">{fmtUsd(row.upstreamAmount)}</td>
        <td className="py-2 text-right font-mono">{fmtUsd(row.gatewayAmount)}</td>
        <td className="py-2 text-right font-mono">{fmtUsd(row.delta)}</td>
        <td className="py-2">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${style?.text}`}>
            {style?.label ?? row.status}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-ds-surface-container-low/30 p-3">
            <pre className="text-[11px] overflow-x-auto">
              {JSON.stringify(row.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================
// helpers
// ============================================================

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function todayStr(): string {
  return formatYmd(new Date());
}

function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return formatYmd(d);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return formatYmd(d);
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtUsd(n: number): string {
  return `${n >= 0 ? "+" : ""}$${n.toFixed(2)}`;
}

interface CardSummary {
  providerId: string;
  providerDisplayName: string;
  deltaToday: number;
  deltaWeek: number;
  deltaMonth: number;
  worstStatus: "MATCH" | "MINOR_DIFF" | "BIG_DIFF";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function buildCards(rows: ReconRow[]): CardSummary[] {
  const today = new Date();
  const oneDayAgo = today.getTime() - 1 * DAY_MS;
  const sevenDayAgo = today.getTime() - 7 * DAY_MS;
  const thirtyDayAgo = today.getTime() - 30 * DAY_MS;

  const byProv = new Map<string, CardSummary>();
  for (const r of rows) {
    const ts = new Date(r.reportDate).getTime();
    let card = byProv.get(r.providerId);
    if (!card) {
      card = {
        providerId: r.providerId,
        providerDisplayName: r.providerDisplayName,
        deltaToday: 0,
        deltaWeek: 0,
        deltaMonth: 0,
        worstStatus: "MATCH",
      };
      byProv.set(r.providerId, card);
    }
    if (ts >= oneDayAgo) card.deltaToday += r.delta;
    if (ts >= sevenDayAgo) card.deltaWeek += r.delta;
    if (ts >= thirtyDayAgo) card.deltaMonth += r.delta;
    if (r.status === "BIG_DIFF") card.worstStatus = "BIG_DIFF";
    else if (r.status === "MINOR_DIFF" && card.worstStatus !== "BIG_DIFF")
      card.worstStatus = "MINOR_DIFF";
  }
  return Array.from(byProv.values()).sort((a, b) =>
    a.providerDisplayName.localeCompare(b.providerDisplayName),
  );
}

interface TrendPoint {
  date: string;
  [providerName: string]: string | number;
}

function buildTrend(rows: ReconRow[]): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();
  for (const r of rows) {
    const date = r.reportDate.slice(0, 10);
    let p = byDate.get(date);
    if (!p) {
      p = { date };
      byDate.set(date, p);
    }
    const key = r.providerName;
    p[key] = (typeof p[key] === "number" ? (p[key] as number) : 0) + r.delta;
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
