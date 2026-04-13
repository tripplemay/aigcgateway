import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * SectionCard — generic `rounded-2xl` content card with optional header.
 *
 * Use for any non-table section content. Renders a simple shadowed card with
 * an optional `title` + right-side `actions` header bar, then the children
 * inside `p-6`.
 */
export function SectionCard({ title, actions, className, children, ...rest }: SectionCardProps) {
  return (
    <section
      className={cn(
        "bg-ds-surface-container-lowest rounded-2xl shadow-sm border border-slate-200/5 overflow-hidden",
        className,
      )}
      {...rest}
    >
      {title || actions ? (
        <div className="px-6 py-5 flex items-center justify-between gap-3 border-b border-ds-outline-variant/10">
          {title ? (
            <h3 className="text-lg font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="p-6">{children}</div>
    </section>
  );
}
