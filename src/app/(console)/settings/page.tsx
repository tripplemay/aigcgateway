"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

// ============================================================
// Types
// ============================================================

interface Profile {
  email: string;
  name: string | null;
}

interface LoginRecord {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "—";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Edge")) return "Edge";
  if (ua.includes("curl")) return "curl";
  return ua.slice(0, 30);
}

// ============================================================
// Component
// ============================================================

export default function SettingsPage() {
  const t = useTranslations("settings");
  const ta = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const { loading: projLoading } = useProject();

  const [name, setName] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ── Data: profile ──
  const { data: profile, refetch: refetchProfile } = useAsyncData<Profile>(async () => {
    return apiFetch<Profile>("/api/auth/profile");
  }, []);

  // Sync name from profile data only once on initial load
  useEffect(() => {
    if (profile && !nameInitialized) {
      setName(profile.name ?? "");
      setNameInitialized(true);
    }
  }, [profile, nameInitialized]);

  // ── Data: login history ──
  const { data: historyData } = useAsyncData<{ data: LoginRecord[] }>(async () => {
    return apiFetch<{ data: LoginRecord[] }>("/api/auth/login-history");
  }, []);

  const loginHistory = historyData?.data ?? [];
  const nameRef = useRef(name);
  nameRef.current = name;

  const saveBtnRef = useRef<HTMLButtonElement>(null);

  const doSaveName = useCallback(() => {
    const currentName = nameRef.current;
    const token = localStorage.getItem("token");
    fetch("/api/auth/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: currentName }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        toast.success(t("nameUpdated"));
        refetchProfile();
      })
      .catch((e: unknown) => {
        toast.error((e as Error).message);
      });
  }, [t, refetchProfile]);

  // Attach native DOM click listener to bypass React synthetic events
  useEffect(() => {
    const btn = saveBtnRef.current;
    if (!btn) return;
    const handler = (e: Event) => {
      e.preventDefault();
      doSaveName();
    };
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
  }, [doSaveName]);

  const changePassword = async () => {
    if (newPassword.length < 8) {
      toast.error(ta("passwordMin"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(ta("passwordMismatch"));
      return;
    }
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      toast.success(t("passwordChanged"));
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  // ── Render — 1:1 replica of design-draft/settings/code.html lines 181-296 ──
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header — code.html lines 182-185 */}
      <header className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-ds-on-surface mb-2 font-[var(--font-heading)]">
          {t("title")}
        </h1>
        <p className="text-ds-on-surface-variant">{t("subtitle")}</p>
      </header>

      {/* code.html line 186: grid-cols-3 layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ═══ Left Column (col-span-2) ═══ */}
        <div className="lg:col-span-2 space-y-8">
          {/* Profile Card — code.html lines 189-218 */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-ds-primary">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  person
                </span>
              </div>
              <div>
                <h2 className="text-xl font-bold font-[var(--font-heading)]">{t("profileInfo")}</h2>
                <p className="text-sm text-ds-on-surface-variant">{t("profileDesc")}</p>
              </div>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant ml-1">
                    {t("email")}
                  </label>
                  <div className="relative">
                    <input
                      className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-ds-on-surface-variant cursor-not-allowed font-medium outline-none"
                      readOnly
                      value={profile?.email ?? ""}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-300 text-sm">
                      lock
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant ml-1">
                    {t("name")}
                  </label>
                  <input
                    className="w-full bg-white border-b-2 border-ds-outline-variant/30 focus:border-ds-primary px-1 py-3 transition-colors outline-none font-medium"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("namePlaceholder")}
                  />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button
                  ref={saveBtnRef}
                  type="button"
                  onClick={doSaveName}
                  data-testid="save-profile-btn"
                  className="px-6 py-2.5 bg-ds-primary text-white font-semibold rounded-lg hover:bg-ds-primary-container transition-all active:scale-95 shadow-lg shadow-ds-primary/10"
                >
                  {t("saveChanges")}
                </button>
              </div>
            </div>
          </section>

          {/* Login History — Table component */}
          <section className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
            <div className="p-8 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-ds-error-container/20 flex items-center justify-center text-ds-error">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    shield
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold font-[var(--font-heading)]">
                    {t("securityLog")}
                  </h2>
                  <p className="text-sm text-ds-on-surface-variant">{t("securityLogDesc")}</p>
                </div>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-8 py-4">{t("ip")}</TableHead>
                  <TableHead className="px-8 py-4">{t("userAgent")}</TableHead>
                  <TableHead className="px-8 py-4">{t("time")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-ds-outline-variant/10">
                {loginHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="px-8 py-12 text-center text-ds-outline">
                      {t("noLoginHistory")}
                    </TableCell>
                  </TableRow>
                ) : (
                  loginHistory.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="px-8 py-4 text-sm font-medium">
                        {record.ip || t("unknown")}
                      </TableCell>
                      <TableCell className="px-8 py-4 text-sm text-slate-600">
                        {parseUserAgent(record.userAgent)}
                      </TableCell>
                      <TableCell className="px-8 py-4 text-sm text-ds-on-surface-variant">
                        {new Date(record.createdAt).toLocaleString(locale)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
        </div>

        {/* ═══ Right Column ═══ */}
        <div className="space-y-8">
          {/* Change Password — code.html lines 248-269 */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
            <div className="mb-8">
              <h2 className="text-xl font-bold font-[var(--font-heading)] mb-1">{t("security")}</h2>
              <p className="text-sm text-ds-on-surface-variant">{t("securityDesc")}</p>
            </div>
            <div className="space-y-5">
              {[
                { label: t("currentPassword"), value: oldPassword, set: setOldPassword },
                { label: t("newPassword"), value: newPassword, set: setNewPassword },
                { label: t("confirmNewPassword"), value: confirmPassword, set: setConfirmPassword },
              ].map((f) => (
                <div key={f.label} className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant">
                    {f.label}
                  </label>
                  <input
                    type="password"
                    className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-ds-primary/10 outline-none"
                    placeholder="••••••••"
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={changePassword}
                className="w-full mt-4 py-3 border-2 border-ds-primary text-ds-primary font-bold rounded-lg hover:bg-ds-primary hover:text-white transition-all active:scale-[0.98]"
              >
                {t("changePassword")}
              </button>
            </div>
          </section>

          {/* Sign Out — code.html lines 272-283 */}
          <section className="bg-ds-error-container/20 rounded-xl p-8 relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-xl font-bold font-[var(--font-heading)] text-ds-on-error-container mb-2">
                {t("sessionControl")}
              </h2>
              <p className="text-sm text-ds-on-error-container/70 mb-6">{t("signOutDesc")}</p>
              <button
                onClick={() => {
                  localStorage.removeItem("token");
                  localStorage.removeItem("projectId");
                  document.cookie = "token=; path=/; max-age=0";
                  router.push("/login");
                }}
                className="w-full py-3 bg-ds-error text-white font-bold rounded-lg shadow-lg shadow-ds-error/20 hover:opacity-90 transition-opacity active:scale-[0.98]"
              >
                {t("signOut")}
              </button>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
              <span
                className="material-symbols-outlined text-8xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                logout
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
