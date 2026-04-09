"use client";

import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import type { PublicTemplateDetail } from "./global-library";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: PublicTemplateDetail | null;
  onFork: () => void;
}

export function TemplateDetailDrawer({ open, onOpenChange, template, onFork }: Props) {
  const t = useTranslations("templates");

  if (!template) return null;

  const modeBadge = (mode: string) => {
    const labels: Record<string, string> = {
      sequential: t("modeSequential"),
      "fan-out": t("modeFanout"),
      single: t("modeSingle"),
    };
    return (
      <span className="px-3 py-1 bg-ds-surface-container-high text-ds-on-surface-variant text-xs rounded font-bold uppercase">
        {labels[mode] ?? mode} {t("modeLabel")}
      </span>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] flex flex-col p-0">
        <div className="p-8 space-y-6 flex-1 overflow-y-auto">
          <SheetHeader className="p-0">
            <SheetTitle className="text-3xl font-extrabold tracking-tight text-ds-on-surface">
              {template.name}
            </SheetTitle>
          </SheetHeader>

          {/* Badges */}
          <div className="flex items-center gap-4 flex-wrap">
            {template.qualityScore != null && (
              <span className="px-3 py-1 bg-ds-secondary-container text-ds-on-secondary-container text-xs font-bold rounded uppercase tracking-wider">
                {t("qualityScore")}: {template.qualityScore}
              </span>
            )}
            <div className="flex items-center gap-1 text-xs font-bold text-ds-primary">
              <span
                className="material-symbols-outlined text-base"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                fork_right
              </span>
              {template.forkCount} {t("forksUnit")}
            </div>
            {modeBadge(template.executionMode)}
          </div>

          {/* Description */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-ds-on-surface-variant">
              {t("descriptionLabel")}
            </h3>
            <p className="text-ds-on-surface-variant leading-relaxed">
              {template.description || "\u2014"}
            </p>
          </div>

          {/* Steps Timeline */}
          <div className="space-y-6 pt-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-ds-on-surface-variant">
              {t("executionPipeline")}
            </h3>
            <div className="relative pl-6 space-y-12">
              {/* Connecting Line */}
              <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-ds-primary-container/20" />
              {template.steps.map((step, i) => (
                <div key={step.id} className="relative flex items-start gap-4">
                  <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-ds-primary ring-4 ring-ds-primary/10 z-10" />
                  <div className="flex-1 bg-ds-surface-container-low p-4 rounded-xl">
                    <p className="text-xs font-bold text-ds-primary uppercase tracking-widest mb-1">
                      {t("stepLabel")} {String(i + 1).padStart(2, "0")}
                    </p>
                    <p className="font-bold text-ds-on-surface">{step.actionName}</p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-ds-on-surface-variant">
                      <span className="material-symbols-outlined text-sm">terminal</span>
                      {step.actionModel}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <SheetFooter className="p-8 border-t border-ds-outline-variant/30 bg-ds-surface">
          <button
            onClick={onFork}
            className="w-full py-4 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white rounded-xl font-bold text-lg shadow-xl shadow-ds-primary/20 hover:scale-[0.99] active:scale-[0.97] transition-all"
          >
            {t("forkToProject")}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
