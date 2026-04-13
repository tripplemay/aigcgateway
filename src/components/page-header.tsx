import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * PageHeader — unified page title block for all console pages.
 *
 * Renders: `title` (h1, text-4xl font-extrabold tracking-tight) with optional
 * inline `badge`, an optional `subtitle` paragraph, and right-aligned `actions`.
 * All console pages must use this instead of hand-written `<h1>` so heading
 * scale stays consistent.
 */
export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-extrabold tracking-tight text-ds-on-surface font-[var(--font-heading)]">
            {title}
          </h1>
          {badge ? <div className="flex-shrink-0">{badge}</div> : null}
        </div>
        {subtitle ? (
          <p className="text-[15px] text-ds-on-surface-variant leading-relaxed">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
