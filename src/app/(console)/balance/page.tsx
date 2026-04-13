"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { toast } from "sonner";
import { formatCNY, timeAgo } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/use-exchange-rate";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { PageLoader } from "@/components/page-loader";
import { TableLoader } from "@/components/table-loader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { RechargeDialog } from "@/components/balance/recharge-dialog";

// ============================================================
// Types
// ============================================================

interface BalanceInfo {
  balance: number;
  alertThreshold: number | null;
  lastRecharge: { amount: number; createdAt: string } | null;
}
interface TxnRow {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  status: string;
  description: string | null;
  createdAt: string;
}
interface TxnResponse {
  data: TxnRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;
const TXN_TYPES = ["", "RECHARGE", "DEDUCTION", "REFUND", "ADJUSTMENT"] as const;
const TYPE_STYLE: Record<string, string> = {
  RECHARGE: "bg-ds-secondary-container text-ds-on-secondary-container",
  DEDUCTION: "bg-ds-primary/10 text-ds-primary",
  REFUND: "bg-ds-tertiary-fixed/50 text-ds-tertiary",
  ADJUSTMENT: "bg-slate-100 text-slate-600",
};
const TYPE_I18N: Record<string, string> = {
  "": "allTypes",
  RECHARGE: "typeRecharge",
  DEDUCTION: "typeDeduction",
  REFUND: "typeRefund",
  ADJUSTMENT: "typeAdjustment",
};

// ============================================================
// Component
// ============================================================

export default function BalancePage() {
  const t = useTranslations("balance");
  const locale = useLocale();
  const { current, loading: projLoading } = useProject();
  const exchangeRate = useExchangeRate();

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [thresholdLoaded, setThresholdLoaded] = useState(false);

  // ── Data: balance info ──
  const {
    data: info,
    loading: infoLoading,
    refetch: refetchInfo,
  } = useAsyncData<BalanceInfo>(async () => {
    if (!current) return null as unknown as BalanceInfo;
    const b = await apiFetch<BalanceInfo>(`/api/projects/${current.id}/balance`);
    if (!thresholdLoaded && b.alertThreshold != null) {
      setThreshold(String(b.alertThreshold));
      setThresholdLoaded(true);
    }
    return b;
  }, [current]);

  // ── Data: transactions (server-side pagination) ──
  const typeParam = typeFilter ? `&type=${typeFilter}` : "";
  const { data: txnData, loading: txnLoading } = useAsyncData<TxnResponse>(async () => {
    if (!current)
      return { data: [], pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 } };
    return apiFetch<TxnResponse>(
      `/api/projects/${current.id}/transactions?page=${page}&pageSize=${PAGE_SIZE}${typeParam}`,
    );
  }, [current, page, typeFilter]);

  const txns = txnData?.data ?? [];
  const totalPages = txnData?.pagination.totalPages ?? 1;
  const total = txnData?.pagination.total ?? 0;

  const handleTypeChange = (type: string) => {
    setTypeFilter(type);
    setPage(1);
  };

  if (projLoading)
    return (
      <PageContainer data-testid="balance-loading">
        <PageLoader />
      </PageContainer>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  const isLow = info?.alertThreshold != null && info.balance <= info.alertThreshold;

  return (
    <>
      <PageContainer data-testid="balance-page">
        <PageHeader title={t("title")} />

        {/* ═══ Bento Grid: Balance + Threshold — code.html lines 165-211 ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Balance Card — code.html lines 167-193 */}
          <div className="md:col-span-2 bg-ds-surface-container-lowest p-8 rounded-xl shadow-[0px_20px_40px_rgba(19,27,46,0.04)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <span
                className="material-symbols-outlined text-[120px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                account_balance_wallet
              </span>
            </div>
            <div className="relative z-10">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">
                {t("currentBalance")}
              </p>
              {infoLoading || !info ? (
                <Skeleton className="h-12 w-48" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-5xl font-extrabold font-[var(--font-heading)] ${isLow ? "text-ds-error" : "text-ds-on-surface"}`}
                    >
                      {formatCNY(info.balance, exchangeRate, 2)}
                    </span>
                  </div>
                  <div className="mt-8 flex flex-wrap items-center gap-8">
                    {info.lastRecharge && (
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                          {t("lastRecharge")}
                        </p>
                        <p className="font-semibold text-ds-on-background">
                          {timeAgo(info.lastRecharge.createdAt, locale)} ·{" "}
                          {formatCNY(info.lastRecharge.amount, exchangeRate, 2)}
                        </p>
                      </div>
                    )}
                    <Button
                      variant="gradient-primary"
                      size="lg"
                      onClick={() => setRechargeOpen(true)}
                      className="ml-auto"
                    >
                      <span className="material-symbols-outlined text-base">add_circle</span>
                      {t("recharge")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Alert Threshold Card — code.html lines 195-210 */}
          <div className="bg-ds-surface-container-low p-8 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-ds-tertiary">
                  notifications_active
                </span>
                <h3 className="heading-3">{t("alertThreshold")}</h3>
              </div>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">{t("alertDescription")}</p>
              <div className="relative mb-6">
                <span className="absolute inset-y-0 left-4 flex items-center text-slate-400 font-medium">
                  $
                </span>
                <input
                  className="w-full bg-ds-surface-container-lowest border-none rounded-xl py-4 pl-10 pr-4 text-xl font-bold focus:ring-2 focus:ring-ds-primary/20 shadow-inner outline-none"
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder={t("alertPlaceholder")}
                />
              </div>
            </div>
            <button
              onClick={async () => {
                if (!current) return;
                await apiFetch(`/api/projects/${current.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ alertThreshold: Number(threshold) || null }),
                });
                toast.success(t("thresholdSaved"));
                refetchInfo();
              }}
              className="w-full bg-ds-on-background text-white py-3 rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors"
            >
              {t("saveThreshold")}
            </button>
          </div>
        </div>

        {/* ═══ Transaction History — code.html lines 213-306 ═══ */}
        <section className="bg-ds-surface-container-lowest rounded-xl shadow-[0px_20px_40px_rgba(19,27,46,0.04)] overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h3 className="heading-2">{t("transactions")}</h3>
            {/* Type filter */}
            <div className="flex items-center gap-2">
              {TXN_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => handleTypeChange(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                    typeFilter === type
                      ? "bg-ds-primary text-white"
                      : "bg-ds-surface-container-low text-slate-500 hover:bg-ds-surface-container-high"
                  }`}
                >
                  {t(TYPE_I18N[type])}
                </button>
              ))}
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-4">{t("time")}</TableHead>
                <TableHead className="px-6 py-4">{t("type")}</TableHead>
                <TableHead className="px-6 py-4">{t("description")}</TableHead>
                <TableHead className="px-6 py-4">{t("amount")}</TableHead>
                <TableHead className="px-6 py-4">{t("balanceAfter")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-ds-outline-variant/10">
              {txnLoading ? (
                <TableLoader colSpan={5} />
              ) : txns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="px-6 py-12 text-center text-ds-outline">
                    {t("noTransactions")}
                  </TableCell>
                </TableRow>
              ) : (
                txns.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-ds-on-background">
                        {new Date(tx.createdAt).toLocaleDateString(locale)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(tx.createdAt).toLocaleTimeString(locale)}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${TYPE_STYLE[tx.type] ?? TYPE_STYLE.ADJUSTMENT}`}
                      >
                        {t(TYPE_I18N[tx.type] ?? "typeAdjustment")}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="text-sm text-slate-600 truncate max-w-xs">
                        {tx.description ?? "\u2014"}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap font-medium">
                      <span
                        className={tx.amount >= 0 ? "text-green-600 font-bold" : "text-slate-600"}
                      >
                        {tx.amount >= 0 ? "+" : ""}
                        {formatCNY(tx.amount, exchangeRate, 6)}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap font-semibold text-ds-on-background">
                      {formatCNY(tx.balanceAfter, exchangeRate, 2)}
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
              className="px-6 py-4 bg-ds-surface-container-high/30 border-t border-ds-outline-variant/10"
            />
          )}
        </section>
      </PageContainer>

      {/* ═══ Recharge Dialog ═══ */}
      <RechargeDialog
        open={rechargeOpen}
        onOpenChange={setRechargeOpen}
        onRecharged={refetchInfo}
      />
    </>
  );
}
