import * as React from "react";
import { cn } from "@/lib/utils";

interface TableCardProps {
  title?: React.ReactNode;
  search?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * TableCard — unified outer shell for all console tables.
 *
 * Renders a `rounded-2xl shadow-sm` container with an optional header bar
 * (`px-6 py-5 border-b`) composed of a left-side `title`, and right-side
 * `search` + `actions` slots. The table itself goes in `children`.
 */
export function TableCard({
  title,
  search,
  actions,
  children,
  className,
}: TableCardProps) {
  const hasHeader = title || search || actions;
  return (
    <section
      className={cn(
        "bg-ds-surface-container-lowest rounded-2xl shadow-sm border border-slate-200/5 overflow-hidden",
        className,
      )}
    >
      {hasHeader ? (
        <div className="px-6 py-5 flex flex-wrap items-center justify-between gap-3 border-b border-ds-outline-variant/10">
          {title ? (
            <h3 className="text-lg font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {search || actions ? (
            <div className="flex flex-wrap items-center gap-3">
              {search}
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
