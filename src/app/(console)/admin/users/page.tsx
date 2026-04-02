"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency, timeAgo } from "@/lib/utils";
import Link from "next/link";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  projectCount: number;
  totalBalance: number;
  totalCalls: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const t = useTranslations("adminUsers");
  const tc = useTranslations("common");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: UserRow[] }>("/api/admin/users").then((r) => { setUsers(r.data); setLoading(false); });
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">{t("title")}</h2>

      <div className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-ds-surface-container-low/50">
            <tr>
              {[tc("name"), t("email"), t("projects"), t("balance"), t("calls"), t("registered"), tc("actions")].map((h) => (
                <th key={h} className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-ds-outline">{tc("loading")}</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-ds-surface-container-low transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-ds-on-surface">{u.name ?? "—"}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                <td className="px-6 py-4 text-sm font-medium">{u.projectCount}</td>
                <td className="px-6 py-4 text-sm font-mono">{formatCurrency(u.totalBalance, 2)}</td>
                <td className="px-6 py-4 text-sm font-medium">{u.totalCalls.toLocaleString()}</td>
                <td className="px-6 py-4 text-xs text-slate-500" title={u.createdAt}>{timeAgo(u.createdAt)}</td>
                <td className="px-6 py-4">
                  <Link href={`/admin/users/${u.id}`} className="text-xs font-bold text-ds-primary hover:underline flex items-center gap-1">
                    {t("detail")} <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
