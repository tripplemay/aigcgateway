"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface RevokeKeyDialogProps {
  keyId: string | null;
  onOpenChange: (open: boolean) => void;
  onRevoked: () => void;
}

export function RevokeKeyDialog({ keyId, onOpenChange, onRevoked }: RevokeKeyDialogProps) {
  const t = useTranslations("keys");
  const tc = useTranslations("common");
  const { current } = useProject();
  const [revoking, setRevoking] = useState(false);

  const revoke = async () => {
    if (!keyId || revoking) return;
    setRevoking(true);
    try {
      await apiFetch(`/api/keys/${keyId}`, { method: "DELETE" });
      toast.success(t("revoked_toast"));
      onOpenChange(false);
      onRevoked();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Dialog
      open={!!keyId}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent showCloseButton={false} className="w-full max-w-md p-0 gap-0 sm:max-w-md">
        <div className="px-8 py-6 bg-ds-surface-container-low">
          <h2 className="text-xl font-extrabold tracking-tight text-ds-on-surface font-[var(--font-heading)]">
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
            onClick={() => onOpenChange(false)}
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
      </DialogContent>
    </Dialog>
  );
}
