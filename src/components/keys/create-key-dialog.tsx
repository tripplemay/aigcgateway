"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface CreateKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateKeyDialog({ open, onOpenChange, onCreated }: CreateKeyDialogProps) {
  const t = useTranslations("keys");
  const tc = useTranslations("common");
  const { current } = useProject();

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
  const [creating, setCreating] = useState(false);

  const resetForm = () => {
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
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const create = async () => {
    if (!current || creating) return;
    const expiresAt =
      keyExpiration === "never"
        ? null
        : keyExpiration === "30d"
          ? new Date(Date.now() + 30 * 86400000).toISOString()
          : keyExpiration === "60d"
            ? new Date(Date.now() + 60 * 86400000).toISOString()
            : keyExpiration === "90d"
              ? new Date(Date.now() + 90 * 86400000).toISOString()
              : null;
    const permissions: Record<string, boolean> = {};
    if (!keyPermissions.chatCompletion) permissions.chatCompletion = false;
    if (!keyPermissions.imageGeneration) permissions.imageGeneration = false;
    if (!keyPermissions.logAccess) permissions.logAccess = false;
    if (!keyPermissions.projectInfo) permissions.projectInfo = false;
    setCreating(true);
    await new Promise((r) => setTimeout(r, 0));
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
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success(tc("copied"));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="w-full max-w-lg p-0 gap-0 sm:max-w-lg">
        {newKey ? (
          /* ═══ Key created success state ═══ */
          <>
            <div className="px-8 py-6 bg-ds-surface-container-low flex justify-between items-center">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-ds-on-surface font-[var(--font-heading)]">
                  {t("keyCreated")}
                </h2>
                <p className="text-ds-on-surface-variant text-xs mt-1">{t("keyWarning")}</p>
              </div>
              <button
                onClick={() => handleOpenChange(false)}
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
                onClick={() => handleOpenChange(false)}
                className="bg-ds-primary-container text-ds-on-primary-container px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-ds-primary/20 hover:scale-[1.02] active:scale-95 transition-transform"
              >
                {tc("done")}
              </button>
            </div>
          </>
        ) : (
          /* ═══ Create form — design-draft/keys-create-modal/code.html lines 176-256 ═══ */
          <>
            {/* Header */}
            <div className="px-8 py-6 bg-ds-surface-container-low flex justify-between items-center">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-ds-on-surface font-[var(--font-heading)]">
                  {t("createApiKey")}
                </h2>
                <p className="text-ds-on-surface-variant text-xs mt-1">
                  {t("createApiKeySubtitle")}
                </p>
              </div>
              <button
                onClick={() => handleOpenChange(false)}
                className="text-ds-on-surface-variant hover:text-ds-on-surface transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {/* Form body */}
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
                {/* Expiration */}
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
                      <option value="30d">{t("days30")}</option>
                      <option value="60d">{t("days60")}</option>
                      <option value="90d">{t("days90")}</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-ds-on-surface-variant pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>
                {/* Permissions */}
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
              {/* Warning */}
              <div className="bg-ds-tertiary/10 p-4 rounded-xl flex gap-3 border border-ds-tertiary/20">
                <span className="material-symbols-outlined text-ds-tertiary">warning</span>
                <p className="text-[11px] leading-relaxed text-ds-on-surface-variant font-medium">
                  {t("securityNotice")}
                </p>
              </div>
            </div>
            {/* Footer */}
            <div className="px-8 py-6 bg-ds-surface-container-low/50 flex justify-end items-center gap-4">
              <button
                onClick={() => handleOpenChange(false)}
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
      </DialogContent>
    </Dialog>
  );
}
