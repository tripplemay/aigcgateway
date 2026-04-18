"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { RevokeKeyDialog } from "@/components/keys/revoke-key-dialog";
import { toast } from "sonner";
import Link from "next/link";

// ============================================================
// Types
// ============================================================

interface KeyDetail {
  id: string;
  keyPrefix: string;
  maskedKey: string;
  name: string | null;
  description: string | null;
  status: string;
  permissions: Record<string, boolean>;
  expiresAt: string | null;
  rateLimit: number | null;
  ipWhitelist: string[] | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PERM_KEYS = ["chatCompletion", "imageGeneration", "logAccess", "projectInfo"] as const;

// ============================================================
// Component
// ============================================================

export default function KeySettingsPage() {
  const t = useTranslations("keys");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();
  const params = useParams<{ keyId: string }>();
  const router = useRouter();

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [expiresAt, setExpiresAt] = useState("");
  const [rateLimit, setRateLimit] = useState("");
  const [ipWhitelist, setIpWhitelist] = useState("");
  const [saving, setSaving] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  // ── Data loading via useAsyncData ──
  const { data: detail, loading } = useAsyncData<KeyDetail | null>(async () => {
    if (!params.keyId) return null;
    const r = await apiFetch<{ data: KeyDetail }>(`/api/keys/${params.keyId}`);
    const d = r.data;
    setName(d.name ?? "");
    setDescription(d.description ?? "");
    setPermissions(d.permissions ?? {});
    setExpiresAt(d.expiresAt ? d.expiresAt.slice(0, 10) : "");
    setRateLimit(d.rateLimit != null ? String(d.rateLimit) : "");
    setIpWhitelist((d.ipWhitelist ?? []).join("\n"));
    return d;
  }, [current, params.keyId]);

  const save = async () => {
    if (!params.keyId) return;
    setSaving(true);
    try {
      const ipArr = ipWhitelist.trim()
        ? ipWhitelist
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
      await apiFetch(`/api/keys/${params.keyId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name || null,
          description: description || null,
          permissions,
          expiresAt: expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : null,
          rateLimit: rateLimit ? Number(rateLimit) : null,
          ipWhitelist: ipArr,
        }),
      });
      toast.success(tc("saved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  };

  const togglePerm = (key: string) => {
    setPermissions((prev) => {
      const current = prev[key];
      if (current === false) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: false };
    });
  };

  if (projLoading || loading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => router.refresh()} />;
  if (!detail) return <div className="text-center py-20 text-ds-outline">{t("noKeysFound")}</div>;

  const isRevoked = detail.status === "REVOKED";

  // ── Render — 1:1 replica of design-draft/keys-settings/code.html lines 160-316 ──
  return (
    <>
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm mb-6">
          <Link
            href="/keys"
            className="text-ds-on-surface-variant/60 hover:text-ds-primary transition-colors"
          >
            {t("title")}
          </Link>
          <span className="text-ds-outline-variant">/</span>
          <span className="text-ds-primary/80 font-medium">{detail.name ?? detail.maskedKey}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ═══ Left Column: Core Settings — code.html lines 163-259 ═══ */}
          <div className="lg:col-span-2 space-y-8">
            {/* General Info */}
            <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
              <div className="flex items-center gap-2 mb-6">
                <span
                  className="material-symbols-outlined text-ds-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  badge
                </span>
                <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("generalInfo")}</h3>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant/60 mb-2">
                    {t("keyName")}
                  </label>
                  <input
                    className="w-full bg-ds-surface-container-low border-0 border-b-2 border-ds-outline-variant/30 focus:border-ds-primary focus:ring-0 px-0 py-3 text-ds-on-surface font-medium transition-all outline-none"
                    placeholder={t("keyNamePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isRevoked}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant/60 mb-2">
                    {t("description")}
                  </label>
                  <textarea
                    className="w-full bg-ds-surface-container-low border-0 border-b-2 border-ds-outline-variant/30 focus:border-ds-primary focus:ring-0 px-0 py-3 text-ds-on-surface font-medium transition-all resize-none outline-none"
                    rows={3}
                    placeholder={t("descriptionPlaceholder")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isRevoked}
                  />
                </div>
              </div>
            </section>

            {/* Permissions */}
            <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined text-ds-primary"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    shield_person
                  </span>
                  <h3 className="font-[var(--font-heading)] font-bold text-lg">
                    {t("permissions")}
                  </h3>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PERM_KEYS.map((key) => {
                  const enabled = permissions[key] !== false;
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between p-4 bg-ds-surface-container-low rounded-xl hover:bg-ds-surface-container-high transition-colors ${!enabled ? "opacity-60" : ""}`}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-ds-on-surface">{t(key)}</span>
                        <span className="text-[11px] text-ds-on-surface-variant/70">
                          {t(`${key}Desc`)}
                        </span>
                      </div>
                      <button
                        onClick={() => !isRevoked && togglePerm(key)}
                        disabled={isRevoked}
                        className={`w-11 h-6 rounded-full relative transition-colors ${enabled ? "bg-ds-primary" : "bg-ds-outline-variant"}`}
                      >
                        <span
                          className={`absolute top-[2px] w-5 h-5 bg-white rounded-full transition-all ${enabled ? "left-[22px]" : "left-[2px]"}`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Security & Limits */}
            <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
              <div className="flex items-center gap-2 mb-6">
                <span
                  className="material-symbols-outlined text-ds-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  lock_reset
                </span>
                <h3 className="font-[var(--font-heading)] font-bold text-lg">
                  {t("securityLimits")}
                </h3>
              </div>
              <div className="space-y-8">
                {/* Expiration Date */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant/60 mb-2">
                    {t("expirationDate")}
                  </label>
                  <input
                    className="w-full bg-ds-surface-container-low border-0 border-b-2 border-ds-outline-variant/30 focus:border-ds-primary focus:ring-0 px-0 py-3 text-ds-on-surface font-medium transition-all outline-none"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    disabled={isRevoked}
                  />
                </div>
                {/* Rate Limit & IP Whitelist */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant/60 mb-2">
                      {t("rateLimit")}
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        className="flex-1 bg-ds-surface-container-low border-0 border-b-2 border-ds-outline-variant/30 focus:border-ds-primary focus:ring-0 px-0 py-3 text-ds-on-surface font-medium transition-all outline-none"
                        type="number"
                        value={rateLimit}
                        onChange={(e) => setRateLimit(e.target.value)}
                        placeholder="—"
                        disabled={isRevoked}
                      />
                      <span className="text-xs text-ds-on-surface-variant/60 font-semibold italic">
                        {t("reqPerMin")}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant/60 mb-2">
                      {t("ipWhitelist")}
                    </label>
                    <textarea
                      className="w-full text-sm font-mono bg-ds-surface-container-low border-0 border-b-2 border-ds-outline-variant/30 focus:border-ds-primary focus:ring-0 px-2 py-3 text-ds-on-surface transition-all resize-none outline-none"
                      rows={4}
                      placeholder={"192.168.1.1\n10.0.0.1"}
                      value={ipWhitelist}
                      onChange={(e) => setIpWhitelist(e.target.value)}
                      disabled={isRevoked}
                    />
                    <p className="mt-2 text-[10px] text-ds-on-surface-variant/50">
                      {t("ipWhitelistHint")}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ═══ Right Column — code.html lines 262-315 ═══ */}
          <div className="space-y-8">
            {/* Key Status */}
            <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("keyStatus")}</h3>
                {!isRevoked && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ds-secondary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-ds-secondary" />
                  </span>
                )}
              </div>
              <div
                className={`flex items-center justify-between p-4 rounded-xl border ${isRevoked ? "bg-ds-error/5 border-ds-error/10" : "bg-ds-primary/5 border-ds-primary/10"}`}
              >
                <div className="flex flex-col">
                  <span
                    className={`text-sm font-bold uppercase tracking-tighter ${isRevoked ? "text-ds-error" : "text-ds-primary"}`}
                  >
                    {isRevoked ? t("revoked") : t("active")}
                  </span>
                  <span className="text-[11px] text-ds-on-surface-variant/70">
                    {isRevoked ? t("permanentlyRevoked") : t("readyForRequests")}
                  </span>
                </div>
              </div>
            </section>

            {/* API Key Exposure */}
            <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
              <h3 className="font-[var(--font-heading)] font-bold text-lg mb-4">{t("apiKey")}</h3>
              <div className="relative">
                <input
                  className="w-full bg-ds-surface-container-low border-0 rounded-lg pl-4 pr-12 py-3 text-sm font-mono text-ds-on-surface-variant"
                  readOnly
                  value={detail.maskedKey}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(detail.maskedKey);
                    toast.success(tc("copied"));
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-ds-surface-container-high rounded-md text-ds-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">content_copy</span>
                </button>
              </div>
              <div className="mt-4 p-3 bg-ds-tertiary-fixed/30 rounded-lg flex gap-3">
                <span className="material-symbols-outlined text-ds-tertiary text-[20px]">
                  warning
                </span>
                <p className="text-[11px] text-ds-on-surface-variant leading-snug">
                  {t("neverShareKey")}
                </p>
              </div>
              {!isRevoked && (
                <button
                  onClick={save}
                  disabled={saving}
                  className="w-full mt-6 py-3 px-4 bg-ds-primary text-white font-bold rounded-xl text-sm hover:opacity-90 transition-all shadow-md shadow-ds-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{saving ? t("savingChanges") : t("saveChanges")}</span>
                  <span className="material-symbols-outlined text-[18px]">save</span>
                </button>
              )}
            </section>

            {/* Danger Zone */}
            {!isRevoked && (
              <section className="bg-ds-surface-container-low rounded-xl p-6 ring-1 ring-ds-error/20">
                <div className="flex items-center gap-2 mb-4 text-ds-error">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    dangerous
                  </span>
                  <h3 className="font-[var(--font-heading)] font-bold text-lg">
                    {t("dangerZone")}
                  </h3>
                </div>
                <p className="text-xs text-ds-on-surface-variant leading-relaxed mb-6">
                  {t("dangerZoneDesc")}
                </p>
                <button
                  onClick={() => setRevokeOpen(true)}
                  className="w-full py-3 px-4 border-2 border-ds-error/20 text-ds-error font-bold rounded-xl text-sm hover:bg-ds-error hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  <span>{t("revokeApiKey")}</span>
                </button>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Revoke Dialog ═══ */}
      <RevokeKeyDialog
        keyId={revokeOpen ? params.keyId : null}
        onOpenChange={() => setRevokeOpen(false)}
        onRevoked={() => router.push("/keys")}
      />
    </>
  );
}
