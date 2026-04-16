"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  templateName: string;
}

interface RatingResponse {
  data: {
    averageScore: number;
    ratingCount: number;
    userScore: number | null;
  };
}

export function RateTemplateDialog({ open, onOpenChange, templateId, templateName }: Props) {
  const t = useTranslations("templates");
  const [hover, setHover] = useState<number>(0);
  const [selected, setSelected] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [existingScore, setExistingScore] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !templateId) return;
    let cancelled = false;
    setHover(0);
    setSelected(0);
    setExistingScore(null);
    apiFetch<RatingResponse>(`/api/templates/${templateId}/rate`)
      .then((res) => {
        if (cancelled) return;
        const score = res.data.userScore ?? 0;
        setExistingScore(res.data.userScore);
        setSelected(score);
      })
      .catch(() => {
        // non-fatal: user can still submit fresh
      });
    return () => {
      cancelled = true;
    };
  }, [open, templateId]);

  const handleSubmit = async () => {
    if (!templateId || selected < 1 || selected > 5) return;
    setSubmitting(true);
    try {
      await apiFetch<RatingResponse>(`/api/templates/${templateId}/rate`, {
        method: "POST",
        body: JSON.stringify({ score: selected }),
      });
      toast.success(t("rateSuccess"));
      onOpenChange(false);
    } catch {
      toast.error(t("rateError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const effective = hover > 0 ? hover : selected;

  return (
    <Dialog open={open} onOpenChange={(next) => (submitting ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-md p-8 space-y-6">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl font-extrabold text-ds-on-surface">
            {t("rateTitle")}
          </DialogTitle>
          <DialogDescription className="text-ds-on-surface-variant">
            {templateName ? `${templateName} — ${t("rateDesc")}` : t("rateDesc")}
          </DialogDescription>
        </DialogHeader>

        {existingScore != null && (
          <p className="text-sm text-ds-on-surface-variant bg-ds-surface-container-low p-3 rounded-lg">
            {t("rateAlreadyRated")}
          </p>
        )}

        <div
          className="flex items-center justify-center gap-2 py-4"
          role="radiogroup"
          aria-label={t("rateThisTemplate")}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= effective;
            return (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={selected === n}
                aria-label={`${n}`}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(0)}
                onClick={() => setSelected(n)}
                disabled={submitting}
                className="p-2 rounded-full transition-transform hover:scale-110 disabled:cursor-not-allowed"
              >
                <span
                  className={`material-symbols-outlined text-5xl ${
                    filled ? "text-ds-tertiary" : "text-ds-outline-variant"
                  }`}
                  style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  star
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="flex gap-4 sm:flex-row">
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            className="flex-1 py-3 border border-ds-outline-variant text-ds-on-surface-variant rounded-xl font-bold hover:bg-ds-surface-container-low transition-colors disabled:opacity-50"
          >
            {t("rateSkip")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selected < 1}
            className="flex-1 py-3 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white rounded-xl font-bold shadow-lg shadow-ds-primary/10 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {submitting ? t("rateSubmitting") : t("rateSubmit")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
