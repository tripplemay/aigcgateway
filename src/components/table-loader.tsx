import * as React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface TableLoaderProps {
  /** How many skeleton rows to render (default 5). */
  rows?: number;
  /** The column span of each skeleton row — must match the table's column count. */
  colSpan: number;
}

/**
 * TableLoader — in-table loading placeholder for console tables.
 *
 * Renders `rows` skeleton rows each spanning `colSpan` columns. Use inside
 * `<TableBody>` when the data is still loading so the table shell stays visible
 * instead of flashing an empty state.
 */
export function TableLoader({ rows = 5, colSpan }: TableLoaderProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell colSpan={colSpan} className="px-6 py-4">
            <Skeleton className="h-6 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
