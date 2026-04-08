"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total?: number;
  pageSize?: number;
  /** Simple mode shows only Previous/Next without page numbers */
  simple?: boolean;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
  pageSize,
  simple,
  className,
}: PaginationProps) {
  const tc = useTranslations("common");

  const showingFrom = total != null && pageSize ? (page - 1) * pageSize + 1 : null;
  const showingTo = total != null && pageSize ? Math.min(page * pageSize, total) : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between text-[10px] text-ds-on-surface-variant font-bold uppercase tracking-widest",
        className,
      )}
    >
      {total != null && showingFrom != null && showingTo != null ? (
        <p>
          {showingFrom}–{showingTo} {tc("of")} {total}
        </p>
      ) : (
        <p>
          {tc("page")} {page} / {totalPages}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg bg-ds-surface-container-low hover:bg-ds-surface-container-high transition-all disabled:opacity-50"
        >
          {tc("prev")}
        </button>

        {!simple &&
          Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all",
                p === page
                  ? "bg-ds-surface-container-high shadow-sm text-ds-primary"
                  : "bg-ds-surface-container-low hover:bg-ds-surface-container-high",
              )}
            >
              {p}
            </button>
          ))}

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-lg bg-ds-surface-container-low hover:bg-ds-surface-container-high transition-all disabled:opacity-50"
        >
          {tc("next")}
        </button>
      </div>
    </div>
  );
}
