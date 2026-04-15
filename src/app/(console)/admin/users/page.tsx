"use client";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCNY, timeAgo } from "@/lib/utils";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { TableCard } from "@/components/table-card";

// ============================================================
// Types
// ============================================================

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  projectCount: number;
  totalBalance: number;
  totalCalls: number;
  createdAt: string;
}

// ============================================================
// Page
// ============================================================

export default function AdminUsersPage() {
  const t = useTranslations("adminUsers");
  const tc = useTranslations("common");
  const exchangeRate = useExchangeRate();

  const { data, loading } = useAsyncData<{ data: UserRow[] }>(
    () => apiFetch<{ data: UserRow[] }>("/api/admin/users"),
    [],
  );

  const users = data?.data ?? [];

  if (loading && !data) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <TableCard>
        <table className="w-full text-left">
          <thead className="bg-ds-surface-container-low/50">
            <tr>
              {[
                tc("name"),
                t("email"),
                t("projects"),
                t("balance"),
                t("calls"),
                t("registered"),
                tc("actions"),
              ].map((h) => (
                <th
                  key={h}
                  className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-ds-surface-container-low transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-ds-on-surface">{u.name ?? "—"}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                <td className="px-6 py-4 text-sm font-medium">{u.projectCount}</td>
                <td className="px-6 py-4 text-sm font-mono">
                  {formatCNY(u.totalBalance, exchangeRate, 2)}
                </td>
                <td className="px-6 py-4 text-sm font-medium">{u.totalCalls.toLocaleString()}</td>
                <td className="px-6 py-4 text-xs text-slate-500" title={u.createdAt}>
                  {timeAgo(u.createdAt)}
                </td>
                <td className="px-6 py-4">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="text-xs font-bold text-ds-primary hover:underline flex items-center gap-1"
                  >
                    {t("detail")}{" "}
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </PageContainer>
  );
}
