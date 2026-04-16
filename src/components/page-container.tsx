import * as React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * PageContainer — unified outer width/centering wrapper for all console pages.
 *
 * All pages use max-w-7xl. The narrow variant was removed in F-AP-10.
 */
export function PageContainer({ className, children, ...rest }: PageContainerProps) {
  return (
    <div className={cn("max-w-7xl mx-auto w-full space-y-8", className)} {...rest}>
      {children}
    </div>
  );
}
