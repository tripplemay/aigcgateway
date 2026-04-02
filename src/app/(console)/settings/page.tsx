"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import "material-symbols/outlined.css";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const ta = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [alertEmail, setAlertEmail] = useState(true);
  const router = useRouter();

  useEffect(() => {
    apiFetch<{ email: string; name: string | null }>("/api/auth/profile")
      .then((u) => { setEmail(u.email); setName(u.name ?? ""); })
      .catch(() => {});
  }, []);

  const saveName = async () => {
    try {
      await apiFetch("/api/auth/profile", { method: "PATCH", body: JSON.stringify({ name }) });
      toast.success(t("nameUpdated"));
    } catch (e) { toast.error((e as Error).message); }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) { toast.error(ta("passwordMin")); return; }
    if (newPassword !== confirmPassword) { toast.error(ta("passwordMismatch")); return; }
    try {
      await apiFetch("/api/auth/change-password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });
      toast.success(t("passwordChanged"));
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">{t("title")}</h2>

      {/* Profile */}
      <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-ds-primary">person</span>
          <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("profile")}</h3>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">{t("email")}</label>
          <input disabled value={email} className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm outline-none opacity-60 cursor-not-allowed" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">{t("name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-ds-primary/20 outline-none" />
        </div>
        <button onClick={saveName} className="bg-ds-primary-container text-ds-on-primary-container px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-ds-primary/20 hover:scale-[1.02] transition-transform">
          {tc("save")}
        </button>
      </div>

      {/* Change Password */}
      <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-ds-primary">lock</span>
          <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("changePassword")}</h3>
        </div>
        {[
          { label: t("currentPassword"), value: oldPassword, set: setOldPassword },
          { label: t("newPassword"), value: newPassword, set: setNewPassword, placeholder: t("newPasswordPlaceholder") },
          { label: t("confirmNewPassword"), value: confirmPassword, set: setConfirmPassword },
        ].map((f) => (
          <div key={f.label} className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">{f.label}</label>
            <input type="password" value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder ?? ""} className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-ds-primary/20 outline-none" />
          </div>
        ))}
        <button onClick={changePassword} className="bg-ds-primary-container text-ds-on-primary-container px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-ds-primary/20 hover:scale-[1.02] transition-transform">
          {t("changePassword")}
        </button>
      </div>

      {/* Notifications */}
      <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="material-symbols-outlined text-ds-primary">notifications</span>
          <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("notifications")}</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ds-on-surface">{t("lowBalanceAlert")}</p>
            <p className="text-xs text-ds-on-surface-variant">{t("lowBalanceDesc")}</p>
          </div>
          <Switch checked={alertEmail} onCheckedChange={setAlertEmail} />
        </div>
      </div>

      {/* Sign Out */}
      <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm border border-ds-error/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ds-on-surface">{t("signOut")}</p>
            <p className="text-xs text-ds-on-surface-variant">{t("signOutDesc")}</p>
          </div>
          <button
            onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("projectId"); router.push("/login"); }}
            className="bg-ds-error text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-ds-error/20 hover:scale-[1.02] transition-transform"
          >
            {t("signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
