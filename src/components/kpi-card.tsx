import * as React from "react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Optional right-side metric / trend indicator rendered next to the value. */
  trend?: React.ReactNode;
  className?: string;
}

/**
 * KPICard — unified stat card matching dashboard/usage/balance visual.
 *
 * Renders a fixed-height `rounded-xl` card with the uppercase `label` on top
 * and the large numeric `value` aligned to the bottom, optionally with a
 * right-side `trend` slot.
 */
export function KPICard({ label, value, trend, className }: KPICardProps) {
  return (
    <div
      className={cn(
        "bg-ds-surface-container-lowest p-5 rounded-xl flex flex-col justify-between h-32 hover:shadow-xl hover:shadow-ds-primary/5 transition-all",
        className,
      )}
    >
      <span className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
        {label}
      </span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-extrabold font-[var(--font-heading)] text-ds-on-surface">
          {value}
        </span>
        {trend ? (
          <span className="text-slate-400 text-xs font-bold">{trend}</span>
        ) : null}
      </div>
    </div>
  );
}
