"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

interface UserDetail {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  projects: Array<{ id: string; name: string; balance: number; callCount: number; keyCount: number; }>;
}

export default function UserDetailPage() {
  const t = useTranslations("adminUsers");
  const tc = useTranslations("common");
  const params = useParams();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeProjectId, setRechargeProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => { const r = await apiFetch<UserDetail>(`/api/admin/users/${params.id}`); setUser(r); }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const doRecharge = async () => {
    try {
      await apiFetch(`/api/admin/users/${params.id}/projects/${rechargeProjectId}/recharge`, { method: "POST", body: JSON.stringify({ amount: Number(amount), description }) });
      toast.success(t("manualRecharge"));
      setRechargeOpen(false);
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (!user) return <div className="text-ds-outline py-12 text-center">{tc("loading")}</div>;

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/admin/users" className="text-ds-on-surface-variant/60 hover:text-ds-primary transition-colors">Users</Link>
          <span className="text-ds-outline-variant">/</span>
          <span className="text-ds-primary font-medium">{user.name ?? user.email}</span>
        </nav>

        <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
          {user.name ?? user.email}
        </h2>

        {/* User Info Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t("email"), value: user.email, icon: "email" },
            { label: t("role"), value: user.role, icon: "admin_panel_settings" },
            { label: t("projects"), value: String(user.projects.length), icon: "folder" },
            { label: t("registered"), value: new Date(user.createdAt).toLocaleDateString(), icon: "calendar_today" },
          ].map((c) => (
            <div key={c.label} className="bg-ds-surface-container-lowest p-5 rounded-xl shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-ds-primary-container text-sm">{c.icon}</span>
                <span className="text-[10px] font-bold text-ds-outline uppercase tracking-widest">{c.label}</span>
              </div>
              <p className="text-sm font-bold text-ds-on-surface truncate">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Projects Table */}
        <div className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <h3 className="font-[var(--font-heading)] font-bold text-lg">Projects</h3>
          </div>
          <table className="w-full text-left">
            <thead className="bg-ds-surface-container-low/50">
              <tr>
                {[tc("name"), t("balance"), t("calls"), "Keys", tc("actions")].map((h) => (
                  <th key={h} className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {user.projects.map((p) => (
                <tr key={p.id} className="hover:bg-ds-surface-container-low transition-colors">
                  <td className="px-6 py-4 text-sm font-bold text-ds-on-surface">{p.name}</td>
                  <td className="px-6 py-4 text-sm font-mono">{formatCurrency(p.balance, 2)}</td>
                  <td className="px-6 py-4 text-sm">{p.callCount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm">{p.keyCount}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => { setRechargeProjectId(p.id); setAmount(""); setDescription(""); setRechargeOpen(true); }} className="text-xs font-bold text-ds-primary hover:underline">
                      {t("manualRecharge")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Admin actions — disabled per decision */}
        <div className="grid grid-cols-2 gap-4">
          <button disabled className="bg-ds-surface-container-low p-4 rounded-xl text-sm font-bold text-ds-on-surface-variant opacity-50 cursor-not-allowed flex items-center gap-2">
            <span className="material-symbols-outlined">block</span> Deactivate User (Coming Soon)
          </button>
          <button disabled className="bg-ds-surface-container-low p-4 rounded-xl text-sm font-bold text-ds-on-surface-variant opacity-50 cursor-not-allowed flex items-center gap-2">
            <span className="material-symbols-outlined">restart_alt</span> Reset Balance (Coming Soon)
          </button>
        </div>
      </div>

      {/* Recharge Modal */}
      {rechargeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-ds-surface-container-low flex justify-between items-center">
              <h2 className="text-xl font-extrabold tracking-tight font-[var(--font-heading)]">{t("manualRecharge")}</h2>
              <button onClick={() => setRechargeOpen(false)} className="text-ds-on-surface-variant hover:text-ds-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-8 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">{t("amountUsd")}</label>
                <input type="number" placeholder="50" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-ds-primary/20 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">{t("reason")}</label>
                <textarea placeholder={t("reason")} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-ds-primary/20 outline-none resize-none" />
              </div>
            </div>
            <div className="px-8 py-6 bg-ds-surface-container-low/50 flex justify-end gap-4">
              <button onClick={() => setRechargeOpen(false)} className="px-6 py-2.5 font-bold text-sm text-ds-on-surface-variant">{tc("cancel")}</button>
              <button onClick={doRecharge} className="bg-ds-primary-container text-ds-on-primary-container px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-ds-primary/20">{tc("confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
