"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { PublicTemplateDetail } from "./global-library";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: PublicTemplateDetail | null;
  loading: boolean;
  onConfirm: () => void;
}

export function ForkConfirmDialog({ open, onOpenChange, template, loading, onConfirm }: Props) {
  const t = useTranslations("templates");

  if (!template) return null;

  const uniqueActions = new Set(template.steps.map((s) => s.actionId)).size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-8 space-y-6">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl font-extrabold text-ds-on-surface">
            {t("forkDialogTitle")}
          </DialogTitle>
          <DialogDescription className="text-ds-on-surface-variant">
            {t("forkDialogDesc", { name: template.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 bg-ds-surface-container-low rounded-xl space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-ds-on-surface-variant">{t("totalSteps")}</span>
            <span className="font-bold text-ds-on-surface">
              {template.steps.length} {t("stepsUnit")}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ds-on-surface-variant">{t("actionsWillBeCopied")}</span>
            <span className="font-bold text-ds-on-surface">{uniqueActions}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ds-on-surface-variant">{t("forkDestination")}</span>
            <span className="font-bold text-ds-primary">{t("tabMyTemplates")}</span>
          </div>
        </div>

        <DialogFooter className="flex gap-4 sm:flex-row">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 py-3 border border-ds-outline-variant text-ds-on-surface-variant rounded-xl font-bold hover:bg-ds-surface-container-low transition-colors"
          >
            {t("forkCancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 bg-ds-primary text-white rounded-xl font-bold shadow-lg shadow-ds-primary/10 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? t("forking") : t("forkNow")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
