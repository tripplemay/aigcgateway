"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { toast } from "sonner";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import "material-symbols/outlined.css";

// ============================================================
// Types (unchanged)
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

const AMOUNTS = [10, 50, 100, 200, 500];
const TYPE_STYLE: Record<string, string> = {
  RECHARGE: "bg-ds-secondary-container text-ds-on-secondary-container",
  DEDUCTION: "bg-ds-primary/10 text-ds-primary",
  REFUND: "bg-ds-tertiary-fixed/50 text-ds-tertiary",
  ADJUSTMENT: "bg-slate-100 text-slate-600",
};

// ============================================================
// Component
// ============================================================

export default function BalancePage() {
  const t = useTranslations("balance");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();
  const [info, setInfo] = useState<BalanceInfo | null>(null);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [amount, setAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState("");
  const [payMethod, setPayMethod] = useState("alipay");
  const [threshold, setThreshold] = useState("");

  const load = async () => {
    if (!current) return;
    const [b, tx] = await Promise.all([
      apiFetch<BalanceInfo>(`/api/projects/${current.id}/balance`),
      apiFetch<{ data: TxnRow[]; pagination: { total: number } }>(
        `/api/projects/${current.id}/transactions?page=${page}`,
      ),
    ]);
    setInfo(b);
    setTxns(tx.data);
    setTotal(tx.pagination.total);
    if (b.alertThreshold != null) setThreshold(String(b.alertThreshold));
  };
  useEffect(() => {
    load();
  }, [current, page]);

  const doRecharge = async () => {
    if (!current) return;
    const amt = customAmount ? Number(customAmount) : amount;
    if (amt < 1 || amt > 10000) {
      toast.error(t("amountError"));
      return;
    }
    try {
      const res = await apiFetch<{ paymentUrl?: string }>(`/api/projects/${current.id}/recharge`, {
        method: "POST",
        body: JSON.stringify({ amount: amt, paymentMethod: payMethod }),
      });
      setRechargeOpen(false);
      if (res.paymentUrl) {
        toast.success(t("redirecting"));
        window.open(res.paymentUrl, "_blank");
      } else {
        toast.success(t("orderCreated"));
      }
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
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
  if (!info) return null;

  const isLow = info.alertThreshold != null && info.balance <= info.alertThreshold;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const effectiveAmount = customAmount ? Number(customAmount) : amount;

  // ── Render — 1:1 replica of Balance (Full Redesign) code.html lines 153-365 ──
  return (
    <>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* ═══ Page Heading — code.html lines 156-163 ═══ */}
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)]">
            {t("title")}
          </h2>
        </div>

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
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-5xl font-extrabold font-[var(--font-heading)] ${isLow ? "text-ds-error" : "text-ds-on-surface"}`}
                >
                  {formatCurrency(info.balance, 2)}
                </span>
                <span className="text-slate-400 font-medium">USD</span>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-8">
                {info.lastRecharge && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                      {t("lastRecharge")}
                    </p>
                    <p className="font-semibold text-ds-on-background">
                      {timeAgo(info.lastRecharge.createdAt)} ·{" "}
                      {formatCurrency(info.lastRecharge.amount, 2)}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setRechargeOpen(true)}
                  className="ml-auto bg-gradient-to-br from-ds-primary to-ds-primary-container text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-ds-primary/30 hover:scale-[1.02] transition-transform"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  {t("recharge")}
                </button>
              </div>
            </div>
          </div>

          {/* Alert Threshold Card — code.html lines 195-210 */}
          <div className="bg-ds-surface-container-low p-8 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-ds-tertiary">
                  notifications_active
                </span>
                <h3 className="font-[var(--font-heading)] font-bold text-lg">
                  {t("alertThreshold")}
                </h3>
              </div>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                {t("alertDescription") ??
                  "Notify me when my balance drops below this amount."}
              </p>
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
                load();
              }}
              className="w-full bg-ds-on-background text-white py-3 rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors"
            >
              {tc("save")} Threshold
            </button>
          </div>
        </div>

        {/* ═══ Transaction History — code.html lines 213-306 ═══ */}
        <section className="bg-ds-surface-container-lowest rounded-xl shadow-[0px_20px_40px_rgba(19,27,46,0.04)] overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h3 className="font-[var(--font-heading)] font-bold text-xl">{t("transactions")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-ds-surface-container-low/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {t("time")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {t("type")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {t("description")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {t("amount")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {t("balanceAfter")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {txns.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-ds-on-background">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(tx.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${TYPE_STYLE[tx.type] ?? TYPE_STYLE.ADJUSTMENT}`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-600 truncate max-w-xs">
                        {tx.description ?? "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">
                      <span className={tx.amount >= 0 ? "text-green-600 font-bold" : "text-slate-600"}>
                        {tx.amount >= 0 ? "+" : ""}
                        {formatCurrency(tx.amount, 6)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-semibold text-ds-on-background">
                      {formatCurrency(tx.balanceAfter, 2)}
                    </td>
                  </tr>
                ))}
                {txns.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-ds-outline">
                      No transactions
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination — code.html lines 290-305 */}
          <div className="px-6 py-6 border-t border-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, total)} of {total} transactions
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg border border-slate-100 hover:bg-slate-50 disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      pageNum === page
                        ? "bg-ds-primary text-white font-bold"
                        : "hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="px-2 text-slate-300">...</span>}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-slate-100 hover:bg-slate-50 disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ Recharge Modal — code.html lines 310-364 ═══ */}
      {rechargeOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/20">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold font-[var(--font-heading)]">{t("rechargeTitle")}</h2>
              <button
                onClick={() => setRechargeOpen(false)}
                className="text-slate-400 hover:text-ds-on-background"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-8">
              <p className="text-sm text-slate-500 mb-6 font-medium">{t("selectAmount")}</p>

              {/* Quick Amount Selection — code.html lines 321-328 */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                {AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => {
                      setAmount(a);
                      setCustomAmount("");
                    }}
                    className={`py-3 border-2 rounded-xl font-bold transition-colors ${
                      amount === a && !customAmount
                        ? "border-ds-primary text-ds-primary bg-ds-primary/5"
                        : "border-slate-100 text-slate-600 hover:border-ds-primary/40"
                    }`}
                  >
                    ${a}
                  </button>
                ))}
              </div>

              {/* Custom Input — code.html lines 330-335 */}
              <div className="mb-8">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {t("customAmount")} (USD)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-4 flex items-center text-slate-400 font-bold">
                    $
                  </span>
                  <input
                    className="w-full bg-ds-surface-container-low border-none rounded-xl py-4 pl-10 pr-4 text-lg font-bold focus:ring-2 focus:ring-ds-primary/20 outline-none"
                    placeholder="Enter amount"
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                </div>
              </div>

              {/* Payment Methods — code.html lines 338-354 */}
              <div className="space-y-3 mb-10">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {t("paymentMethod")}
                </label>
                <div
                  onClick={() => setPayMethod("alipay")}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                    payMethod === "alipay"
                      ? "border-ds-primary bg-ds-primary/5"
                      : "border-slate-100 hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`material-symbols-outlined ${payMethod === "alipay" ? "text-ds-primary" : "text-slate-400"}`}
                    >
                      account_balance
                    </span>
                    <span className="font-bold text-ds-on-background">{t("alipay")}</span>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full ${payMethod === "alipay" ? "border-4 border-ds-primary" : "border-2 border-slate-200"}`}
                  />
                </div>
                <div
                  onClick={() => setPayMethod("wechat")}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                    payMethod === "wechat"
                      ? "border-ds-primary bg-ds-primary/5"
                      : "border-slate-100 hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`material-symbols-outlined ${payMethod === "wechat" ? "text-ds-primary" : "text-slate-400"}`}
                    >
                      qr_code_2
                    </span>
                    <span className="font-bold text-slate-600">{t("wechatPay")}</span>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full ${payMethod === "wechat" ? "border-4 border-ds-primary" : "border-2 border-slate-200"}`}
                  />
                </div>
              </div>

              {/* Actions — code.html lines 356-361 */}
              <div className="flex gap-4">
                <button
                  onClick={() => setRechargeOpen(false)}
                  className="flex-1 py-4 px-6 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={doRecharge}
                  className="flex-[2] py-4 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-ds-primary to-ds-primary-container shadow-xl shadow-ds-primary/30 active:scale-95 transition-transform"
                >
                  {t("confirmRecharge")} ${effectiveAmount.toFixed(2)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
