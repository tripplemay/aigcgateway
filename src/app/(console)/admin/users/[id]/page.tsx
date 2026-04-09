"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

// ============================================================
// Types
// ============================================================

interface UserDetail {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  projects: Array<{ id: string; name: string; balance: number; callCount: number; keyCount: number }>;
}

// ============================================================
// Page
// ============================================================

export default function UserDetailPage() {
  const t = useTranslations("adminUsers");
  const tc = useTranslations("common");
  const params = useParams();
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeProjectId, setRechargeProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const { data: user, loading, refetch } = useAsyncData<UserDetail>(
    () => apiFetch<UserDetail>(`/api/admin/users/${params.id}`),
    [params.id],
  );

  const doRecharge = async () => {
    try {
      await apiFetch(`/api/admin/users/${params.id}/projects/${rechargeProjectId}/recharge`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), description }),
      });
      toast.success(t("manualRecharge"));
      setRechargeOpen(false);
      refetch();
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

  const totalBalance = user.projects.reduce((s, p) => s + p.balance, 0);
  const totalCalls = user.projects.reduce((s, p) => s + p.callCount, 0);

  return (
    <>
      <div className="space-y-8">
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
          {/* Profile Identity Card */}
          <div className="lg:col-span-4 bg-ds-surface-container-lowest p-8 rounded-xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <span className="bg-ds-secondary-container text-ds-on-secondary-container px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
                {user.role}
              </span>
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
                  <p className="text-sm font-semibold">&mdash;</p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <p className="text-3xl font-extrabold">{formatCurrency(totalBalance, 2)}</p>
              </div>
            </div>
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
          </div>
        </section>

        {/* Projects + Balance History */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Project Cards */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">{t("registeredProjects")}</h3>
              <Link
                href="/admin/users"
                className="text-ds-primary text-xs font-bold uppercase tracking-widest hover:underline"
              >
                {t("viewAll")}
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {user.projects.map((p) => (
                <div
                  key={p.id}
                  className="bg-ds-surface p-4 rounded-xl flex items-center gap-4 group hover:bg-ds-surface-container-low transition-colors cursor-pointer"
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
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold">{formatCurrency(p.balance, 2)}</span>
                    <span className="text-[9px] uppercase tracking-tighter text-ds-on-surface-variant">
                      {t("balance")}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setRechargeProjectId(p.id);
                      setAmount("");
                      setDescription("");
                      setRechargeOpen(true);
                    }}
                    className="text-ds-primary text-xs font-bold hover:underline"
                  >
                    {t("manualRecharge")}
                  </button>
                </div>
              ))}
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
                <tbody>
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-ds-on-surface-variant">
                      {t("noTransactions")}
                    </td>
                  </tr>
                </tbody>
              </table>
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
              disabled
              className="px-6 py-2 bg-ds-surface border border-ds-outline-variant rounded-lg text-ds-on-surface-variant font-bold text-xs uppercase tracking-widest hover:bg-ds-surface-container-low transition-colors disabled:opacity-50"
            >
              {t("suspendAccount")}
            </button>
            <button
              disabled
              className="px-6 py-2 bg-ds-error text-ds-on-error rounded-lg font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {t("deleteProfile")}
            </button>
          </div>
        </section>
      </div>

      {/* Recharge Modal */}
      {rechargeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-ds-surface-container-low flex justify-between items-center">
              <h2 className="text-xl font-extrabold tracking-tight">{t("manualRecharge")}</h2>
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
    </>
  );
}
