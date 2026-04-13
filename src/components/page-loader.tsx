import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PageLoaderProps {
  className?: string;
}

/**
 * PageLoader — page-level loading placeholder.
 *
 * Renders a skeleton approximation of a typical console page (header + a few
 * card rows). Replaces hand-written "加载中…" strings so loading states look
 * consistent across pages.
 */
export function PageLoader({ className }: PageLoaderProps) {
  return (
    <div className={cn("space-y-8", className)} aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}
