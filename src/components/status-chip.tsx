import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusChipVariant = "success" | "error" | "warning" | "info" | "neutral";

interface StatusChipProps {
  variant?: StatusChipVariant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<StatusChipVariant, string> = {
  success: "bg-green-50 text-green-700 border-green-200",
  error: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  neutral: "bg-slate-100 text-slate-500 border-slate-200",
};

/**
 * StatusChip — unified colored status pill.
 *
 * Standard shape: `rounded-full`, `text-[10px] font-bold uppercase
 * tracking-tight`, with a `border` variant palette. Replaces all hand-written
 * inline `<span>` status badges across console pages.
 */
export function StatusChip({
  variant = "neutral",
  children,
  className,
}: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-tight",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
