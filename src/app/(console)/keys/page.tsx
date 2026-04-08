"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

// ============================================================
// Types
// ============================================================

interface ApiKeyRow {
  id: string;
  keyPrefix: string;
  maskedKey: string;
  name: string | null;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const KEYS_PER_PAGE = 5;

// ============================================================
// Component
// ============================================================

export default function KeysPage() {
  const t = useTranslations("keys");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  // Uncontrolled search: tick counter forces re-render, filter reads ref directly
  const [searchTick, setSearchTick] = useState(0);
  const triggerSearch = useCallback(() => {
    setSearchTick((n) => n + 1);
    setPage(0);
  }, []);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyDescription, setKeyDescription] = useState("");
  const [keyExpiration, setKeyExpiration] = useState("never");
  const [keyPermissions, setKeyPermissions] = useState({
    chatCompletion: true,
    imageGeneration: true,
    logAccess: true,
    projectInfo: true,
  });
  const [newKey, setNewKey] = useState<string | null>(null);

  // Revoke confirm state
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const r = await apiFetch<{ data: ApiKeyRow[] }>(`/api/projects/${current.id}/keys`);
      setKeys(r.data);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!current || creating) return;
    const expiresAt =
      keyExpiration === "never"
        ? null
        : keyExpiration === "30d"
          ? new Date(Date.now() + 30 * 86400000).toISOString()
          : keyExpiration === "90d"
            ? new Date(Date.now() + 90 * 86400000).toISOString()
            : keyExpiration === "1y"
              ? new Date(Date.now() + 365 * 86400000).toISOString()
              : null;
    const permissions: Record<string, boolean> = {};
    if (!keyPermissions.chatCompletion) permissions.chatCompletion = false;
    if (!keyPermissions.imageGeneration) permissions.imageGeneration = false;
    if (!keyPermissions.logAccess) permissions.logAccess = false;
    if (!keyPermissions.projectInfo) permissions.projectInfo = false;
    setCreating(true);
    try {
      const r = await apiFetch<{ key: string }>(`/api/projects/${current.id}/keys`, {
        method: "POST",
        body: JSON.stringify({
          name: keyName || undefined,
          description: keyDescription || undefined,
          expiresAt,
          permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
        }),
      });
      setNewKey(r.key);
      toast.success(t("created_toast"));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (!current || !revokeId || revoking) return;
    setRevoking(true);
    try {
      await apiFetch(`/api/projects/${current.id}/keys/${revokeId}`, { method: "DELETE" });
      toast.success(t("revoked_toast"));
      setRevokeId(null);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRevoking(false);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success(tc("copied"));
  };

  // Filtered + paginated keys — reads DOM ref directly, searchTick triggers re-eval
  void searchTick; // ensure React re-renders when tick changes
  const normalizedSearch = (searchRef.current?.value ?? "").trim().toLowerCase();
  const filtered = normalizedSearch
    ? keys.filter(
        (k) =>
          (k.name ?? "").toLowerCase().includes(normalizedSearch) ||
          k.maskedKey.toLowerCase().includes(normalizedSearch),
      )
    : keys;

  const totalPages = Math.max(1, Math.ceil(filtered.length / KEYS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageKeys = filtered.slice(safePage * KEYS_PER_PAGE, (safePage + 1) * KEYS_PER_PAGE);
  const activeCount = keys.filter((k) => k.status === "ACTIVE").length;

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  // ── Render — strict 1:1 replica of code.html lines 187-415 ──
  return (
    <>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* ═══ Page Header — code.html lines 190-198 ═══ */}
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-ds-primary-fixed text-ds-on-primary-fixed-variant text-[10px] font-black rounded uppercase tracking-tighter">
                {t("infrastructureSecurity")}
              </span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tighter text-ds-on-surface font-[var(--font-heading)]">
              {t("title")}
            </h1>
            <p className="text-ds-on-surface-variant text-sm mt-1">{t("subtitle")}</p>
          </div>
        </div>

        {/* ═══ Premium Stats Section — code.html lines 200-230 ═══ */}
        <section className="grid grid-cols-3 gap-6">
          {/* Card 1: Active Infrastructure — lines 201-209 */}
          <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border-l-4 border-ds-primary shadow-sm flex justify-between items-center group hover:bg-ds-surface-container transition-all duration-300">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                {t("activeInfrastructure")}
              </p>
              <h2 className="text-4xl font-black tracking-tighter text-ds-on-surface font-[var(--font-heading)]">
                {activeCount}{" "}
                <span className="text-slate-300 font-light text-2xl">/ {keys.length} keys</span>
              </h2>
            </div>
            <div className="w-12 h-12 rounded-xl bg-ds-primary/5 flex items-center justify-center text-ds-primary">
              <span
                className="material-symbols-outlined text-3xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                developer_board
              </span>
            </div>
          </div>
          {/* Card 2: Daily Capacity — lines 210-218 */}
          <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border-l-4 border-ds-tertiary shadow-sm flex justify-between items-center group hover:bg-ds-surface-container transition-all duration-300">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                {t("dailyCapacity")}
              </p>
              <h2 className="text-4xl font-black tracking-tighter text-ds-on-surface font-[var(--font-heading)]">
                1,000,000 <span className="text-slate-300 font-light text-2xl">req</span>
              </h2>
            </div>
            <div className="w-12 h-12 rounded-xl bg-ds-tertiary/5 flex items-center justify-center text-ds-tertiary">
              <span
                className="material-symbols-outlined text-3xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                speed
              </span>
            </div>
          </div>
          {/* Card 3: Quick Action CTA — lines 219-229 */}
          <div className="p-6 rounded-2xl bg-ds-primary text-ds-on-primary shadow-xl shadow-ds-primary/10 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-80 font-bold">
                {t("quickAction")}
              </p>
              <h3 className="text-xl font-bold mt-1 font-[var(--font-heading)]">
                {t("generateNewKey")}
              </h3>
            </div>
            <button
              onClick={() => {
                setKeyName("");
                setKeyDescription("");
                setKeyExpiration("never");
                setKeyPermissions({
                  chatCompletion: true,
                  imageGeneration: true,
                  logAccess: true,
                  projectInfo: true,
                });
                setNewKey(null);
                setCreateOpen(true);
              }}
              className="mt-4 w-full py-2.5 bg-white text-ds-primary font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all scale-95 active:scale-100 duration-150"
            >
              <span className="material-symbols-outlined">add</span>
              <span>{t("createKey")}</span>
            </button>
          </div>
        </section>

        {/* ═══ Key Management Table — code.html lines 232-355 ═══ */}
        <section className="bg-ds-surface-container-lowest rounded-2xl shadow-sm border border-slate-200/5 overflow-hidden">
          {/* Table header bar — lines 233-238 */}
          <div className="px-6 py-5 flex justify-between items-center border-b border-ds-outline-variant/10">
            <h3 className="text-lg font-extrabold tracking-tight font-[var(--font-heading)]">
              {t("activeKeys")}
            </h3>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                search
              </span>
              <input
                ref={searchRef}
                className="pl-9 pr-8 py-2 text-sm rounded-full bg-ds-surface-container-low border-none focus:ring-2 focus:ring-ds-primary/20 w-64 transition-all placeholder:text-slate-400 outline-none"
                placeholder={t("searchKeys")}
                type="search"
                defaultValue=""
                onChange={triggerSearch}
                onInput={triggerSearch}
              />
              {normalizedSearch && (
                <button
                  onClick={() => {
                    if (searchRef.current) searchRef.current.value = "";
                    triggerSearch();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ds-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>
          </div>
          {/* Table — lines 240-344 */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-ds-surface-container-high/30 text-[11px] uppercase tracking-widest text-slate-500 font-black">
                <tr>
                  <th className="px-6 py-4">{t("nameAndProject")}</th>
                  <th className="px-6 py-4">{t("accessKey")}</th>
                  <th className="px-6 py-4">{t("created")}</th>
                  <th className="px-6 py-4">{t("lastUsed")}</th>
                  <th className="px-6 py-4 text-center">{t("status")}</th>
                  <th className="px-6 py-4 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-outline-variant/10">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-ds-outline">
                      {tc("loading")}
                    </td>
                  </tr>
                ) : pageKeys.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-ds-outline">
                      No keys found
                    </td>
                  </tr>
                ) : (
                  pageKeys.map((k) => (
                    <tr
                      key={k.id}
                      className="hover:bg-ds-surface-container-low transition-colors group"
                    >
                      {/* Name & Project — lines 254-257 */}
                      <td className="px-6 py-5">
                        <div className="font-bold text-ds-on-surface text-sm">
                          {k.name ?? "Unnamed Key"}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                          Project: {current.name}
                        </div>
                      </td>
                      {/* Access Key — masked only, no copy (list API only returns mask) */}
                      <td className="px-6 py-5">
                        <div
                          className={`font-mono text-xs bg-ds-surface-container-low px-2 py-1 rounded inline-block ${k.status === "REVOKED" ? "text-slate-400 opacity-60" : "text-slate-600"}`}
                        >
                          {k.maskedKey}
                        </div>
                      </td>
                      {/* Created — line 266 */}
                      <td className="px-6 py-5 text-xs text-slate-500 font-medium">
                        {new Date(k.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      {/* Last Used — line 267 */}
                      <td className="px-6 py-5 text-xs text-slate-500 font-medium">
                        {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "Never"}
                      </td>
                      {/* Status — lines 268-272 */}
                      <td className="px-6 py-5 text-center">
                        {k.status === "ACTIVE" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-green-50 text-green-700 border border-green-200 uppercase tracking-tighter">
                            {t("active")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-tighter">
                            {t("revoked")}
                          </span>
                        )}
                      </td>
                      {/* Actions — lines 273-282 / 333-341 */}
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-1">
                          {k.status === "ACTIVE" ? (
                            <>
                              <Link
                                href={`/keys/${k.id}`}
                                className="p-2 text-slate-400 hover:text-ds-primary hover:bg-ds-primary/5 rounded-lg transition-all"
                              >
                                <span className="material-symbols-outlined text-lg">edit</span>
                              </Link>
                              <button
                                onClick={() => setRevokeId(k.id)}
                                className="p-2 text-slate-400 hover:text-ds-error hover:bg-ds-error/5 rounded-lg transition-all"
                              >
                                <span className="material-symbols-outlined text-lg">block</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="p-2 text-slate-400 hover:text-ds-primary hover:bg-ds-primary/5 rounded-lg transition-all">
                                <span className="material-symbols-outlined text-lg">history</span>
                              </button>
                              <button className="p-2 text-slate-400 hover:text-ds-error hover:bg-ds-error/5 rounded-lg transition-all">
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination — lines 346-354 */}
          {filtered.length > 0 && (
            <div className="px-6 py-4 bg-ds-surface-container-high/30 border-t border-ds-outline-variant/10 flex justify-between items-center text-[10px] text-slate-500 font-black uppercase tracking-widest">
              <p>{t("showingKeys", { count: pageKeys.length, total: filtered.length })}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="px-3 py-1.5 rounded-lg border border-ds-outline-variant/30 hover:bg-white transition-all disabled:opacity-50"
                >
                  {t("prev")}
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`px-3 py-1.5 rounded-lg border transition-all ${
                      i === safePage
                        ? "bg-white border-ds-outline-variant/50 shadow-sm text-ds-primary"
                        : "border-ds-outline-variant/30 hover:bg-white"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg border border-ds-outline-variant/30 hover:bg-white transition-all disabled:opacity-50"
                >
                  {t("next")}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ═══ Security Best Practices — code.html lines 357-391 ═══ */}
        <section className="space-y-6 pt-4">
          <div className="mb-2">
            <h3 className="text-2xl font-black tracking-tighter text-ds-on-surface font-[var(--font-heading)]">
              {t("securityBestPractices")}
            </h3>
            <p className="text-sm text-slate-500 mt-1">{t("securitySubtitle")}</p>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border border-slate-200/5 shadow-sm flex gap-4 transition-transform hover:scale-[1.02]">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-ds-primary/5 flex items-center justify-center text-ds-primary">
                <span className="material-symbols-outlined text-2xl">lock</span>
              </div>
              <div>
                <h4 className="font-black text-ds-on-surface mb-1 font-[var(--font-heading)]">
                  {t("neverHardcode")}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  {t("neverHardcodeDesc")}
                </p>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border border-slate-200/5 shadow-sm flex gap-4 transition-transform hover:scale-[1.02]">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-ds-tertiary/5 flex items-center justify-center text-ds-tertiary">
                <span className="material-symbols-outlined text-2xl">autorenew</span>
              </div>
              <div>
                <h4 className="font-black text-ds-on-surface mb-1 font-[var(--font-heading)]">
                  {t("rotateKeys")}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  {t("rotateKeysDesc")}
                </p>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border border-slate-200/5 shadow-sm flex gap-4 transition-transform hover:scale-[1.02]">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-ds-secondary/5 flex items-center justify-center text-ds-secondary">
                <span className="material-symbols-outlined text-2xl">policy</span>
              </div>
              <div>
                <h4 className="font-black text-ds-on-surface mb-1 font-[var(--font-heading)]">
                  {t("leastPrivilege")}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  {t("leastPrivilegeDesc")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Footer — code.html lines 393-406 ═══ */}
        <footer className="py-12 border-t border-ds-outline-variant/10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              <span>AIGC Gateway Security v4.2.1-stable</span>
            </div>
            <div className="flex gap-8">
              <button
                className="hover:text-ds-primary transition-colors"
                onClick={() => toast.info(t("comingSoon"))}
              >
                Privacy Policy
              </button>
              <button
                className="hover:text-ds-primary transition-colors"
                onClick={() => toast.info(t("comingSoon"))}
              >
                Terms of Service
              </button>
              <button
                className="hover:text-ds-primary transition-colors"
                onClick={() => toast.info(t("comingSoon"))}
              >
                System Status
              </button>
            </div>
            <p>&copy; 2024 Algorithmic Atelier. All rights reserved.</p>
          </div>
        </footer>
      </div>

      {/* ═══ FAB — code.html lines 411-415 ═══ */}
      <div className="fixed bottom-8 right-8 z-50">
        <button
          onClick={() => {
            setKeyName("");
            setNewKey(null);
            setCreateOpen(true);
          }}
          className="w-14 h-14 rounded-2xl bg-ds-primary text-white shadow-2xl shadow-ds-primary/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
        >
          <span
            className="material-symbols-outlined text-3xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            add
          </span>
        </button>
      </div>

      {/* ═══ Create API Key Modal — Create API Key Modal code.html lines 186-262 ═══ */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#131b2e]/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col font-[var(--font-heading)]">
            {newKey ? (
              /* Key created success state */
              <>
                <div className="px-8 py-6 bg-ds-surface-container-low flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-extrabold tracking-tight text-ds-on-surface">
                      {t("keyCreated")}
                    </h2>
                    <p className="text-ds-on-surface-variant text-xs mt-1">{t("keyWarning")}</p>
                  </div>
                  <button
                    onClick={() => setCreateOpen(false)}
                    className="text-ds-on-surface-variant hover:text-ds-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="flex items-center gap-2 bg-ds-surface-container-low px-4 py-3 rounded-lg">
                    <input
                      readOnly
                      value={newKey}
                      className="flex-1 bg-transparent border-none text-sm font-mono text-ds-on-surface outline-none"
                    />
                    <button
                      onClick={() => copyKey(newKey)}
                      className="p-2 hover:bg-ds-primary-fixed rounded transition-colors text-ds-primary"
                    >
                      <span className="material-symbols-outlined text-sm">content_copy</span>
                    </button>
                  </div>
                  <div className="bg-ds-tertiary/10 p-4 rounded-xl flex gap-3 border border-ds-tertiary/20">
                    <span className="material-symbols-outlined text-ds-tertiary">warning</span>
                    <p className="text-[11px] leading-relaxed text-ds-on-surface-variant font-medium">
                      {t("securityNotice")}
                    </p>
                  </div>
                </div>
                <div className="px-8 py-6 bg-ds-surface-container-low/50 flex justify-end">
                  <button
                    onClick={() => setCreateOpen(false)}
                    className="bg-ds-primary-container text-ds-on-primary-container px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-ds-primary/20 hover:scale-[1.02] active:scale-95 transition-transform"
                  >
                    {tc("done")}
                  </button>
                </div>
              </>
            ) : (
              /* Create form — code.html lines 189-260 */
              <>
                {/* Header — lines 190-198 */}
                <div className="px-8 py-6 bg-ds-surface-container-low flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-extrabold tracking-tight text-ds-on-surface">
                      {t("createApiKey")}
                    </h2>
                    <p className="text-ds-on-surface-variant text-xs mt-1">
                      {t("createApiKeySubtitle")}
                    </p>
                  </div>
                  <button
                    onClick={() => setCreateOpen(false)}
                    className="text-ds-on-surface-variant hover:text-ds-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                {/* Form — lines 200-249 */}
                <div className="p-8 space-y-6">
                  {/* Key Name */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                      {t("keyName")}
                    </label>
                    <input
                      className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-ds-on-surface text-sm focus:ring-2 focus:ring-ds-primary-container transition-all outline-none"
                      placeholder={t("keyNamePlaceholder")}
                      type="text"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                    />
                  </div>
                  {/* Description */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                      {t("description")}
                    </label>
                    <textarea
                      className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-ds-on-surface text-sm outline-none resize-none focus:ring-2 focus:ring-ds-primary-container transition-all"
                      placeholder={t("descriptionPlaceholder")}
                      rows={3}
                      value={keyDescription}
                      onChange={(e) => setKeyDescription(e.target.value)}
                    />
                  </div>
                  {/* Expiration & Permissions Grid */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                        {t("expirationDate")}
                      </label>
                      <div className="relative">
                        <select
                          className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-ds-on-surface text-sm appearance-none outline-none focus:ring-2 focus:ring-ds-primary-container transition-all"
                          value={keyExpiration}
                          onChange={(e) => setKeyExpiration(e.target.value)}
                        >
                          <option value="never">{t("neverExpires")}</option>
                          <option value="30d">30 days</option>
                          <option value="90d">90 days</option>
                          <option value="1y">1 year</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-3 top-2.5 text-ds-on-surface-variant pointer-events-none">
                          expand_more
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                        {t("permissions")}
                      </label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {[
                          { key: "chatCompletion" as const, label: "Chat" },
                          { key: "imageGeneration" as const, label: "Image" },
                          { key: "logAccess" as const, label: "Logs" },
                          { key: "projectInfo" as const, label: "Info" },
                        ].map((perm) => (
                          <button
                            key={perm.key}
                            type="button"
                            onClick={() =>
                              setKeyPermissions((prev) => ({
                                ...prev,
                                [perm.key]: !prev[perm.key],
                              }))
                            }
                            className={`px-3 py-1.5 rounded-lg border-2 text-[11px] font-bold transition-all ${
                              keyPermissions[perm.key]
                                ? "border-ds-primary-container bg-ds-primary-container/10 text-ds-primary"
                                : "border-ds-outline-variant bg-transparent text-ds-on-surface-variant"
                            }`}
                          >
                            {perm.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Warning — lines 244-249 */}
                  <div className="bg-ds-tertiary/10 p-4 rounded-xl flex gap-3 border border-ds-tertiary/20">
                    <span className="material-symbols-outlined text-ds-tertiary">warning</span>
                    <p className="text-[11px] leading-relaxed text-ds-on-surface-variant font-medium">
                      {t("securityNotice")}
                    </p>
                  </div>
                </div>
                {/* Footer — lines 252-260 */}
                <div className="px-8 py-6 bg-ds-surface-container-low/50 flex justify-end items-center gap-4">
                  <button
                    onClick={() => setCreateOpen(false)}
                    className="px-6 py-2.5 text-ds-on-surface-variant hover:text-ds-on-surface font-bold text-sm transition-colors"
                  >
                    {tc("cancel")}
                  </button>
                  <button
                    onClick={create}
                    disabled={creating}
                    className="bg-ds-primary-container text-ds-on-primary-container px-8 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-ds-primary/20 hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {creating ? tc("loading") : t("createKey")}
                    <span className="material-symbols-outlined text-sm">rocket_launch</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ Revoke Confirm Modal ═══ */}
      {revokeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#131b2e]/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-md rounded-xl shadow-2xl overflow-hidden font-[var(--font-heading)]">
            <div className="px-8 py-6 bg-ds-surface-container-low">
              <h2 className="text-xl font-extrabold tracking-tight text-ds-on-surface">
                {t("revokeTitle")}
              </h2>
            </div>
            <div className="p-8">
              <div className="bg-ds-error/10 p-4 rounded-xl flex gap-3 border border-ds-error/20">
                <span className="material-symbols-outlined text-ds-error">warning</span>
                <p className="text-[11px] leading-relaxed text-ds-on-surface-variant font-medium">
                  {t("revokeWarning")}
                </p>
              </div>
            </div>
            <div className="px-8 py-6 bg-ds-surface-container-low/50 flex justify-end items-center gap-4">
              <button
                onClick={() => setRevokeId(null)}
                className="px-6 py-2.5 text-ds-on-surface-variant hover:text-ds-on-surface font-bold text-sm transition-colors"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={revoke}
                disabled={revoking}
                className="bg-ds-error text-white px-8 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-ds-error/20 hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none"
              >
                {revoking ? tc("loading") : t("revoke")}
                <span className="material-symbols-outlined text-sm">block</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
