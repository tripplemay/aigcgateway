"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";

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

  // ── Render — code.html lines 181-296 ──
  return (
    /* code.html line 181 */
    <div className="max-w-5xl mx-auto">
      {/* Header — lines 182-185 */}
      <header className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-ds-on-surface mb-2 font-[var(--font-heading)]">{t("title")}</h1>
        <p className="text-ds-on-surface-variant">Configure your algorithmic environment and account preferences.</p>
      </header>

      {/* code.html line 186: grid-cols-3 layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ═══ Left Column (col-span-2) — lines 188-243 ═══ */}
        <div className="lg:col-span-2 space-y-8">

          {/* Profile Card — lines 189-218 */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-ds-primary">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
              </div>
              <div>
                <h2 className="text-xl font-bold font-[var(--font-heading)]">Profile Information</h2>
                <p className="text-sm text-ds-on-surface-variant">Update your public identity on the gateway.</p>
              </div>
            </div>
            {/* Form — lines 199-217 */}
            <div className="space-y-6">
              {/* code.html line 200: grid-cols-2 for email + name */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant ml-1">{t("email")}</label>
                  <div className="relative">
                    <input className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-ds-on-surface-variant cursor-not-allowed font-medium outline-none" readOnly value={email} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-300 text-sm">lock</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant ml-1">{t("name")}</label>
                  <input className="w-full bg-white border-b-2 border-ds-outline-variant/30 focus:border-ds-primary px-1 py-3 transition-colors outline-none font-medium" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button onClick={saveName} className="px-6 py-2.5 bg-ds-primary text-white font-semibold rounded-lg hover:bg-ds-primary-container transition-all active:scale-95 shadow-lg shadow-ds-primary/10">
                  Save Changes
                </button>
              </div>
            </div>
          </section>

          {/* Notifications Card — lines 221-243 */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-ds-tertiary-fixed-dim/20 flex items-center justify-center text-ds-tertiary">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>notifications_active</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold font-[var(--font-heading)]">Notification Preferences</h2>
                  <p className="text-sm text-ds-on-surface-variant">Control how you receive system alerts.</p>
                </div>
              </div>
            </div>
            {/* Toggle — lines 233-241 */}
            <div className="flex items-start justify-between p-4 bg-ds-surface-container-low rounded-xl">
              <div className="space-y-1">
                <p className="font-semibold text-ds-on-surface">{t("lowBalanceAlert")}</p>
                <p className="text-sm text-ds-on-surface-variant leading-relaxed">{t("lowBalanceDesc")}</p>
              </div>
              {/* Custom toggle — lines 238-240 */}
              <button
                onClick={() => setAlertEmail(!alertEmail)}
                className={`relative w-11 h-6 rounded-full transition-colors mt-1 ${alertEmail ? "bg-ds-primary" : "bg-slate-300"}`}
              >
                <span className={`absolute top-[2px] w-5 h-5 bg-white rounded-full transition-all ${alertEmail ? "left-[22px]" : "left-[2px]"}`} />
              </button>
            </div>
          </section>
        </div>

        {/* ═══ Right Column — lines 246-293 ═══ */}
        <div className="space-y-8">

          {/* Change Password — lines 248-269 */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
            <div className="mb-8">
              <h2 className="text-xl font-bold font-[var(--font-heading)] mb-1">Security</h2>
              <p className="text-sm text-ds-on-surface-variant">Update your credentials.</p>
            </div>
            <div className="space-y-5">
              {[
                { label: t("currentPassword"), value: oldPassword, set: setOldPassword },
                { label: t("newPassword"), value: newPassword, set: setNewPassword },
                { label: t("confirmNewPassword"), value: confirmPassword, set: setConfirmPassword },
              ].map((f) => (
                <div key={f.label} className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant">{f.label}</label>
                  <input type="password" className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-ds-primary/10 outline-none" placeholder="••••••••" value={f.value} onChange={(e) => f.set(e.target.value)} />
                </div>
              ))}
              <button onClick={changePassword} className="w-full mt-4 py-3 border-2 border-ds-primary text-ds-primary font-bold rounded-lg hover:bg-ds-primary hover:text-white transition-all active:scale-[0.98]">
                {t("changePassword")}
              </button>
            </div>
          </section>

          {/* Sign Out — lines 272-283 */}
          <section className="bg-ds-error-container/20 rounded-xl p-8 relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-xl font-bold font-[var(--font-heading)] text-ds-on-error-container mb-2">Session Control</h2>
              <p className="text-sm text-ds-on-error-container/70 mb-6">{t("signOutDesc")}</p>
              <button
                onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("projectId"); router.push("/login"); }}
                className="w-full py-3 bg-ds-error text-white font-bold rounded-lg shadow-lg shadow-ds-error/20 hover:opacity-90 transition-opacity active:scale-[0.98]"
              >
                {t("signOut")}
              </button>
            </div>
            {/* Decorative icon — lines 280-282 */}
            <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
              <span className="material-symbols-outlined text-8xl" style={{ fontVariationSettings: "'FILL' 1" }}>logout</span>
            </div>
          </section>

          {/* System Status Mini Card — lines 285-292 */}
          <div className="bg-gradient-to-br from-ds-inverse-surface to-[#1a202c] rounded-xl p-6 text-white">
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">System Status</span>
            </div>
            <p className="text-sm font-medium mb-1">API Latency: <span className="text-emerald-400">—</span></p>
            <p className="text-xs text-slate-400">All regions operational</p>
          </div>
        </div>
      </div>
    </div>
  );
}
