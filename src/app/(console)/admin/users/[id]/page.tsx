"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { formatCNY } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { toast } from "sonner";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { StatusChip } from "@/components/status-chip";

// ── Types ──

interface UserDetail {
  id: string;
  name: string | null;
  email: string;
  role: string;
  balance: number;
  suspended: boolean;
  deletedAt: string | null;
  lastActive: string | null;
  keyCount: number;
  createdAt: string;
  projects: Array<{
    id: string;
    name: string;
    callCount: number;
    keyCount: number;
    createdAt: string;
  }>;
}

interface TxnItem {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

interface TxnResponse {
  data: TxnItem[];
  pagination: { page: number; pageSize: number; total: number };
}

const TXN_TYPE_STYLES: Record<string, string> = {
  DEDUCTION: "bg-ds-surface-container-high text-ds-on-surface-variant",
  ADJUSTMENT: "bg-ds-primary-fixed text-ds-primary",
  RECHARGE: "bg-ds-status-success-container text-ds-status-success",
};

// ── Page ──

export default function UserDetailPage() {
  const t = useTranslations("adminUsers");
  const tc = useTranslations("common");
  const exchangeRate = useExchangeRate();
  const params = useParams();
  const router = useRouter();

  // Recharge modal
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  // Danger zone modals
  const [suspendConfirm, setSuspendConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");

  // Transactions page
  const [txnPage, setTxnPage] = useState(1);

  const {
    data: user,
    loading,
    refetch,
  } = useAsyncData<UserDetail>(
    () => apiFetch<UserDetail>(`/api/admin/users/${params.id}`),
    [params.id],
  );

  const { data: txnData, refetch: refetchTxn } = useAsyncData<TxnResponse>(
    () =>
      apiFetch<TxnResponse>(
        `/api/admin/users/${params.id}/transactions?page=${txnPage}&pageSize=10`,
      ),
    [params.id, txnPage],
  );

  const doRecharge = async () => {
    try {
      await apiFetch(`/api/admin/users/${params.id}/recharge`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), description }),
      });
      toast.success(t("recharged"));
      setRechargeOpen(false);
      setAmount("");
      setDescription("");
      refetch();
      refetchTxn();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doSuspend = async (suspended: boolean) => {
    try {
      await apiFetch(`/api/admin/users/${params.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ suspended }),
      });
      toast.success(suspended ? t("userSuspended") : t("userUnsuspended"));
      setSuspendConfirm(false);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDelete = async () => {
    try {
      await apiFetch(`/api/admin/users/${params.id}`, { method: "DELETE" });
      toast.success(t("userDeleted"));
      setDeleteConfirm(false);
      router.push("/admin/users");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading && !user) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pt-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  if (!user) return null;

  const totalCalls = user.projects.reduce((s, p) => s + p.callCount, 0);
  const txns = txnData?.data ?? [];
  const txnPagination = txnData?.pagination;

  return (
    <>
      <PageContainer>
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/admin/users"
            className="text-ds-on-surface-variant/60 hover:text-ds-primary transition-colors"
          >
            {t("title")}
          </Link>
          <span className="material-symbols-outlined text-xs text-ds-on-surface-variant">
            chevron_right
          </span>
          <span className="font-semibold">{user.name ?? user.email}</span>
        </nav>

        {/* Hero: Profile (4 col) + Stats (8 col) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Profile Card */}
          <div className="lg:col-span-4 bg-ds-surface-container-lowest p-8 rounded-xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 flex gap-2">
              <StatusChip variant="info">{user.role}</StatusChip>
              {user.suspended && <StatusChip variant="error">{t("suspended")}</StatusChip>}
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-xl ring-4 ring-ds-primary-fixed bg-ds-surface-container-low flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-ds-primary">person</span>
                </div>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight mb-1">
                {user.name ?? user.email}
              </h2>
              <p className="text-ds-on-surface-variant text-sm mb-6">{user.email}</p>
              <div className="grid grid-cols-2 w-full gap-4 pt-6 border-t border-ds-surface-container-low">
                <div>
                  <p className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest mb-1">
                    {t("joined")}
                  </p>
                  <p className="text-sm font-semibold">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest mb-1">
                    {t("lastActive")}
                  </p>
                  <p className="text-sm font-semibold">
                    {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : "\u2014"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Balance */}
            <div className="bg-ds-surface-container-low p-6 rounded-xl flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="p-3 bg-ds-surface rounded-lg text-ds-primary">
                  <span className="material-symbols-outlined">account_balance_wallet</span>
                </div>
                <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                  {t("balance")}
                </span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-extrabold">
                  {formatCNY(user.balance, exchangeRate, 2)}
                </p>
                <button
                  onClick={() => {
                    setAmount("");
                    setDescription("");
                    setRechargeOpen(true);
                  }}
                  className="mt-2 text-ds-primary text-xs font-bold hover:underline"
                >
                  {t("recharge")}
                </button>
              </div>
            </div>
            {/* API Calls */}
            <div className="bg-ds-surface-container-low p-6 rounded-xl flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="p-3 bg-ds-surface rounded-lg text-ds-secondary">
                  <span className="material-symbols-outlined">bolt</span>
                </div>
                <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                  {t("apiCalls")}
                </span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-extrabold">{totalCalls.toLocaleString()}</p>
              </div>
            </div>
            {/* Projects */}
            <div className="bg-ds-surface-container-low p-6 rounded-xl flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="p-3 bg-ds-surface rounded-lg text-ds-tertiary">
                  <span className="material-symbols-outlined">folder_managed</span>
                </div>
                <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                  {t("projects")}
                </span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-extrabold">
                  {String(user.projects.length).padStart(2, "0")}
                </p>
              </div>
            </div>
            {/* API Keys */}
            <div className="bg-ds-surface-container-low p-6 rounded-xl flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="p-3 bg-ds-surface rounded-lg text-ds-on-surface-variant">
                  <span className="material-symbols-outlined">vpn_key</span>
                </div>
                <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                  {t("apiKeys")}
                </span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-extrabold">{String(user.keyCount).padStart(2, "0")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Projects + Balance History */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Project Cards */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <h3 className="text-lg font-bold">{t("registeredProjects")}</h3>
            <div className="flex flex-col gap-3">
              {user.projects.map((p) => (
                <div
                  key={p.id}
                  className="bg-ds-surface p-4 rounded-xl flex items-center gap-4 group hover:bg-ds-surface-container-low transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-ds-primary/10 flex items-center justify-center text-ds-primary group-hover:bg-ds-surface transition-colors">
                    <span className="material-symbols-outlined">rocket_launch</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold">{p.name}</h4>
                    <p className="text-xs text-ds-on-surface-variant">
                      {p.callCount.toLocaleString()} {t("calls")} &bull; {p.keyCount} {t("keys")}
                    </p>
                  </div>
                </div>
              ))}
              {user.projects.length === 0 && (
                <p className="text-sm text-ds-on-surface-variant text-center py-6">
                  {t("noProjects")}
                </p>
              )}
            </div>
          </div>

          {/* Balance History */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <h3 className="text-lg font-bold">{t("balanceHistory")}</h3>
            <div className="bg-ds-surface rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-ds-surface-container-low">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-ds-on-surface-variant">
                      {t("colDate")}
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-ds-on-surface-variant">
                      {t("colType")}
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-ds-on-surface-variant text-right">
                      {t("colAmount")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ds-surface-container-low">
                  {txns.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-sm text-ds-on-surface-variant"
                      >
                        {t("noTransactions")}
                      </td>
                    </tr>
                  ) : (
                    txns.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-ds-surface-container-low/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs text-ds-on-surface-variant">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip
                            variant={
                              tx.type === "RECHARGE"
                                ? "success"
                                : tx.type === "ADJUSTMENT"
                                  ? "info"
                                  : "neutral"
                            }
                          >
                            {tx.type}
                          </StatusChip>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`text-xs font-bold ${tx.amount >= 0 ? "text-ds-status-success" : "text-ds-on-surface-variant"}`}
                          >
                            {tx.amount >= 0 ? "+" : ""}
                            {formatCNY(tx.amount, exchangeRate, 4)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {txnPagination && txnPagination.total > txnPagination.pageSize && (
                <div className="flex justify-between items-center px-4 py-3 border-t border-ds-surface-container-low">
                  <span className="text-[10px] text-ds-on-surface-variant">
                    {t("showingPage", {
                      page: txnPagination.page,
                      total: Math.ceil(txnPagination.total / txnPagination.pageSize),
                    })}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={txnPage <= 1}
                      onClick={() => setTxnPage((p) => p - 1)}
                      className="text-xs font-bold text-ds-primary disabled:opacity-40"
                    >
                      {t("prev")}
                    </button>
                    <button
                      disabled={txnPage >= Math.ceil(txnPagination.total / txnPagination.pageSize)}
                      onClick={() => setTxnPage((p) => p + 1)}
                      className="text-xs font-bold text-ds-primary disabled:opacity-40"
                    >
                      {t("next")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-ds-error-container/20 border border-ds-error/10 rounded-2xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <h4 className="font-bold text-ds-error text-lg mb-1">{t("dangerZone")}</h4>
            <p className="text-ds-on-surface-variant text-sm">{t("dangerZoneDesc")}</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setSuspendConfirm(true)}
              className="px-6 py-2 bg-ds-surface border border-ds-outline-variant rounded-lg text-ds-on-surface-variant font-bold text-xs uppercase tracking-widest hover:bg-ds-surface-container-low transition-colors"
            >
              {user.suspended ? t("unsuspendAccount") : t("suspendAccount")}
            </button>
            <button
              onClick={() => {
                setDeleteEmail("");
                setDeleteConfirm(true);
              }}
              className="px-6 py-2 bg-ds-error text-ds-on-error rounded-lg font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-opacity"
            >
              {t("deleteProfile")}
            </button>
          </div>
        </section>
      </PageContainer>

      {/* Recharge Modal */}
      {rechargeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-ds-surface-container-low flex justify-between items-center">
              <h2 className="text-xl font-extrabold tracking-tight">{t("recharge")}</h2>
              <button
                onClick={() => setRechargeOpen(false)}
                className="text-ds-on-surface-variant hover:text-ds-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-8 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                  {t("amountUsd")}
                </label>
                <Input
                  type="number"
                  placeholder="50"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                  {t("reason")}
                </label>
                <textarea
                  placeholder={t("reason")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-ds-primary/20 outline-none resize-none"
                />
              </div>
            </div>
            <div className="px-8 py-6 bg-ds-surface-container-low/50 flex justify-end gap-4">
              <button
                onClick={() => setRechargeOpen(false)}
                className="px-6 py-2.5 font-bold text-sm text-ds-on-surface-variant"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={doRecharge}
                className="bg-ds-primary-container text-ds-on-primary-container px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-ds-primary/20"
              >
                {tc("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Confirm */}
      {suspendConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-sm rounded-2xl shadow-2xl p-8 space-y-6">
            <h2 className="text-lg font-extrabold">
              {user.suspended ? t("unsuspendConfirmTitle") : t("suspendConfirmTitle")}
            </h2>
            <p className="text-sm text-ds-on-surface-variant">
              {user.suspended ? t("unsuspendConfirmDesc") : t("suspendConfirmDesc")}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSuspendConfirm(false)}
                className="px-4 py-2 text-sm font-bold text-ds-on-surface-variant"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={() => doSuspend(!user.suspended)}
                className="px-6 py-2 bg-ds-error text-ds-on-error rounded-lg text-sm font-bold"
              >
                {tc("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-sm rounded-2xl shadow-2xl p-8 space-y-6">
            <h2 className="text-lg font-extrabold text-ds-error">{t("deleteConfirmTitle")}</h2>
            <p className="text-sm text-ds-on-surface-variant">{t("deleteConfirmDesc")}</p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ds-on-surface-variant">
                {t("typeEmailToConfirm")}
              </label>
              <Input
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                placeholder={user.email}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-bold text-ds-on-surface-variant"
              >
                {tc("cancel")}
              </button>
              <button
                disabled={deleteEmail !== user.email}
                onClick={doDelete}
                className="px-6 py-2 bg-ds-error text-ds-on-error rounded-lg text-sm font-bold disabled:opacity-40"
              >
                {t("deleteProfile")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
