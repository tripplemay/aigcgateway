"use client";
/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-03 — admin /admin/reconciliation 面板。
 *
 * 4 区块：
 *   1) Provider summary cards（顶部）：今日/本周/本月 delta + status 颜色
 *   2) 30 天 delta 趋势折线（按 provider 分线）
 *   3) BIG_DIFF 明细表（过滤 + 钻取 details JSON）
 *   4) 手动重跑控件（选 date+provider → POST /rerun）
 */
import { useMemo, useState } from "react";
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

export default function ReconciliationPage() {
  const t = useTranslations("adminReconciliation");

  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterProvider, setFilterProvider] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rerunDate, setRerunDate] = useState(formatToday());
  const [rerunProvider, setRerunProvider] = useState("");
  const [rerunBusy, setRerunBusy] = useState(false);

  // 拉最近 30 天对账行
  const { data: bundle, refetch: load } = useAsyncData<{
    data: ReconRow[];
  }>(async () => {
    const qs = new URLSearchParams();
    if (filterProvider) qs.set("providerId", filterProvider);
    if (filterStatus) qs.set("status", filterStatus);
    return apiFetch<{ data: ReconRow[] }>(`/api/admin/reconciliation?${qs.toString()}`);
  }, [filterProvider, filterStatus]);

  const rows = bundle?.data ?? [];

  // 顶部 cards：按 provider 聚合今日/本周/本月 delta
  const cards = useMemo(() => buildCards(rows), [rows]);

  // 趋势图数据：按 provider × reportDate group → delta
  const trend = useMemo(() => buildTrend(rows), [rows]);

  // BIG_DIFF 明细
  const bigDiffs = rows.filter((r) => r.status === "BIG_DIFF");

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
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRerunBusy(false);
    }
  };

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

      {/* BIG_DIFF 明细表 */}
      <SectionCard title={t("bigDiffTitle", { count: bigDiffs.length })}>
        <div className="flex flex-wrap gap-3 mb-3">
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
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-ds-on-surface-variant">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ds-on-surface-variant">
                <tr>
                  <th className="pb-2">{t("colDate")}</th>
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
      </SectionCard>
    </PageContainer>
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

function formatToday(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate() - 1).padStart(2, "0"); // default: yesterday
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
    const t = new Date(r.reportDate).getTime();
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
    if (t >= oneDayAgo) card.deltaToday += r.delta;
    if (t >= sevenDayAgo) card.deltaWeek += r.delta;
    if (t >= thirtyDayAgo) card.deltaMonth += r.delta;
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
