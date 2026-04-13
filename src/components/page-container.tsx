import * as React from "react";
import { cn } from "@/lib/utils";

export type PageContainerSize = "default" | "narrow";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** "default" → max-w-7xl, "narrow" → max-w-5xl */
  size?: PageContainerSize;
}

/**
 * PageContainer — unified outer width/centering wrapper for all console pages.
 *
 * Replaces per-page hand-written `max-w-*` + `mx-auto` + `space-y-*`. All console
 * pages must wrap their content in this component so heading widths stay in sync.
 */
export function PageContainer({
  size = "default",
  className,
  children,
  ...rest
}: PageContainerProps) {
  const maxW = size === "narrow" ? "max-w-5xl" : "max-w-7xl";
  return (
    <div className={cn(maxW, "mx-auto w-full space-y-8", className)} {...rest}>
      {children}
    </div>
  );
}
