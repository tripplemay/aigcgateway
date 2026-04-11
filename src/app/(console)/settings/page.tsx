"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
  role?: string;
}

interface LoginRecord {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  stats: { keyCount: number; callCount: number };
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
  const { current, projects, select, refresh, loading: projLoading } = useProject();
  const [activeTab, setActiveTab] = useState<"account" | "project">("account");

  // ── Account tab state ──
  const [name, setName] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ── Project tab state ──
  const [projName, setProjName] = useState("");
  const [projDesc, setProjDesc] = useState("");
  const [projInitialized, setProjInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // ── Data: profile ──
  const { data: profile, refetch: refetchProfile } = useAsyncData<Profile>(async () => {
    return apiFetch<Profile>("/api/auth/profile");
  }, []);

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

  // ── Data: project detail ──
  const { data: projectDetail, refetch: refetchProject } = useAsyncData<ProjectDetail>(async () => {
    if (!current) return null as unknown as ProjectDetail;
    return apiFetch<ProjectDetail>(`/api/projects/${current.id}`);
  }, [current?.id]);

  useEffect(() => {
    if (projectDetail && !projInitialized) {
      setProjName(projectDetail.name);
      setProjDesc(projectDetail.description ?? "");
      setProjInitialized(true);
    }
  }, [projectDetail, projInitialized]);

  useEffect(() => {
    setProjInitialized(false);
  }, [current?.id]);

  // ── Account: save name (native DOM listener — proven pattern) ──
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

  // ── Project: save (inline onClick — identical pattern to deleteProject) ──
  const handleProjectSave = () => {
    if (!current) {
      toast.error("No project");
      return;
    }
    setSaving(true);
    apiFetch(`/api/projects/${current.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: projName, description: projDesc }),
    })
      .then(() => {
        toast.success(t("projectUpdated"));
        refresh();
        refetchProject();
      })
      .catch((e: unknown) => {
        toast.error((e as Error).message);
      })
      .finally(() => {
        setSaving(false);
      });
  };

  // ── Account: change password ──
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

  // ── Project: delete ──
  const deleteProject = async () => {
    if (!current || deleteConfirm !== current.name) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/projects/${current.id}`, { method: "DELETE" });
      toast.success(t("projectDeleted"));
      const remaining = projects.filter((p) => p.id !== current.id);
      if (remaining.length > 0) {
        select(remaining[0].id);
      }
      refresh();
      router.push("/dashboard");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  // ── Render ──
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-ds-on-surface mb-2 font-[var(--font-heading)]">
          {t("title")}
        </h1>
        <p className="text-ds-on-surface-variant">{t("subtitle")}</p>
      </header>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-8 bg-ds-surface-container-low rounded-xl p-1 w-fit">
        {(["account", "project"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-bold font-[var(--font-heading)] transition-all",
              activeTab === tab
                ? "bg-ds-surface-container-lowest shadow-sm text-ds-primary"
                : "text-ds-on-surface-variant hover:text-ds-on-surface",
            )}
          >
            {t(tab === "account" ? "tabAccount" : "tabProject")}
          </button>
        ))}
      </div>

      {/* ═══ Project Tab ═══ */}
      {activeTab === "project" ? (
        !current ? (
          <div className="text-center py-20 text-ds-on-surface-variant">
            {t("noProjectSelected")}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Project Info */}
            <div className="lg:col-span-2 space-y-8">
              {/* Project Selector */}
              {projects.length > 1 && (
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant">
                    {t("selectProject")}
                  </label>
                  <select
                    value={current.id}
                    onChange={(e) => {
                      select(e.target.value);
                      setProjInitialized(false);
                    }}
                    className="bg-ds-surface-container-low border-none rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-ds-primary/20 outline-none"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-ds-primary">
                    <span
                      className="material-symbols-outlined"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      folder_managed
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold font-[var(--font-heading)]">
                      {t("projectInfo")}
                    </h2>
                    <p className="text-sm text-ds-on-surface-variant">{t("projectInfoDesc")}</p>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant ml-1">
                      {t("projectName")}
                    </label>
                    <input
                      className="w-full bg-white border-b-2 border-ds-outline-variant/30 focus:border-ds-primary px-1 py-3 transition-colors outline-none font-medium"
                      value={projName}
                      onChange={(e) => setProjName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant ml-1">
                      {t("projectDescription")}
                    </label>
                    <textarea
                      className="w-full bg-white border-b-2 border-ds-outline-variant/30 focus:border-ds-primary px-1 py-3 transition-colors outline-none font-medium resize-none"
                      rows={3}
                      value={projDesc}
                      onChange={(e) => setProjDesc(e.target.value)}
                      placeholder={t("projectDescPlaceholder")}
                    />
                  </div>
                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      onClick={handleProjectSave}
                      disabled={saving}
                      data-testid="save-project-btn"
                      className="px-6 py-2.5 bg-ds-primary text-white font-semibold rounded-lg hover:bg-ds-primary-container transition-all active:scale-95 shadow-lg shadow-ds-primary/10 disabled:opacity-60"
                    >
                      {saving ? t("saving") : t("saveChanges")}
                    </button>
                  </div>
                </div>
              </section>

              {/* Statistics */}
              <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-xl bg-ds-primary-container/20 flex items-center justify-center text-ds-primary">
                    <span
                      className="material-symbols-outlined"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      bar_chart
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold font-[var(--font-heading)]">
                      {t("projectStats")}
                    </h2>
                    <p className="text-sm text-ds-on-surface-variant">{t("projectStatsDesc")}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-ds-surface-container-low rounded-xl p-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant mb-2">
                      {t("apiKeyCount")}
                    </p>
                    <p className="text-3xl font-black text-ds-on-surface font-[var(--font-heading)]">
                      {projectDetail?.stats.keyCount ?? "—"}
                    </p>
                  </div>
                  <div className="bg-ds-surface-container-low rounded-xl p-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant mb-2">
                      {t("callCount")}
                    </p>
                    <p className="text-3xl font-black text-ds-on-surface font-[var(--font-heading)]">
                      {projectDetail?.stats.callCount?.toLocaleString() ?? "—"}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Right: Danger Zone */}
            <div className="space-y-8">
              <section className="bg-ds-error-container/20 rounded-xl p-8 relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-xl font-bold font-[var(--font-heading)] text-ds-on-error-container mb-2">
                    {t("dangerZone")}
                  </h2>
                  <p className="text-sm text-ds-on-error-container/70 mb-6">
                    {t("deleteProjectDesc")}
                  </p>
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-ds-on-error-container/70">
                      {t("typeProjectName", { name: current.name })}
                    </label>
                    <input
                      className="w-full bg-white/80 border-2 border-ds-error/20 rounded-lg px-4 py-2.5 outline-none focus:border-ds-error text-sm"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={current.name}
                    />
                    <button
                      type="button"
                      onClick={deleteProject}
                      disabled={deleteConfirm !== current.name || deleting}
                      className="w-full py-3 bg-ds-error text-white font-bold rounded-lg shadow-lg shadow-ds-error/20 hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deleting ? t("deletingProject") : t("deleteProject")}
                    </button>
                  </div>
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                  <span
                    className="material-symbols-outlined text-8xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    delete_forever
                  </span>
                </div>
              </section>
            </div>
          </div>
        )
      ) : (
        /* ═══ Account Tab ═══ */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Profile Card */}
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
                  <h2 className="text-xl font-bold font-[var(--font-heading)]">
                    {t("profileInfo")}
                  </h2>
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

            {/* Login History */}
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

          {/* Right Column */}
          <div className="space-y-8">
            {/* Change Password */}
            <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
              <div className="mb-8">
                <h2 className="text-xl font-bold font-[var(--font-heading)] mb-1">
                  {t("security")}
                </h2>
                <p className="text-sm text-ds-on-surface-variant">{t("securityDesc")}</p>
              </div>
              <div className="space-y-5">
                {[
                  { label: t("currentPassword"), value: oldPassword, set: setOldPassword },
                  { label: t("newPassword"), value: newPassword, set: setNewPassword },
                  {
                    label: t("confirmNewPassword"),
                    value: confirmPassword,
                    set: setConfirmPassword,
                  },
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

            {/* Admin: Exchange Rate */}
            {profile?.role === "ADMIN" && <ExchangeRateSection />}

            {/* Sign Out */}
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
      )}
    </div>
  );
}

function ExchangeRateSection() {
  const t = useTranslations("settings");
  const [rate, setRate] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ data: Array<{ key: string; value: string }> }>("/api/admin/config")
      .then((res) => {
        const item = res.data.find((c) => c.key === "USD_TO_CNY_RATE");
        setRate(item?.value ?? "7.3");
        setLoaded(true);
      })
      .catch(() => {
        setRate("7.3");
        setLoaded(true);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/config", {
        method: "PUT",
        body: JSON.stringify({
          key: "USD_TO_CNY_RATE",
          value: rate,
          description: "USD 转 CNY 汇率",
        }),
      });
      toast.success(t("saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
      <h2 className="text-xl font-bold font-[var(--font-heading)] mb-2">{t("exchangeRate")}</h2>
      <p className="text-sm text-ds-on-surface-variant mb-6">{t("exchangeRateDesc")}</p>
      <div className="flex items-center gap-4">
        <span className="text-sm font-bold text-ds-on-surface-variant">1 USD =</span>
        <input
          type="number"
          step="0.01"
          min="0"
          className="w-32 bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
        <span className="text-sm font-bold text-ds-on-surface-variant">CNY</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-ds-primary text-white font-bold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "..." : t("save")}
        </button>
      </div>
    </section>
  );
}
