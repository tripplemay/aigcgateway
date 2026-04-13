import * as React from "react";
import { cn } from "@/lib/utils";

interface CTABannerProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action: React.ReactNode;
  className?: string;
}

/**
 * CTABanner — dark-background call-to-action banner with radial gradient.
 *
 * Extracted from actions/templates pages. Renders a `rounded-2xl` dark card
 * with a top-right indigo radial glow, a large `title` + `description` on the
 * left and the `action` slot on the right.
 */
export function CTABanner({
  title,
  description,
  action,
  className,
}: CTABannerProps) {
  return (
    <section
      className={cn(
        "relative rounded-2xl overflow-hidden p-10 flex flex-col md:flex-row items-center justify-between gap-8 bg-[#131b2e] text-white",
        className,
      )}
    >
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 20%, #6d5dd3 0%, transparent 40%)",
        }}
      />
      <div className="relative z-10 max-w-xl">
        <h3 className="text-3xl font-extrabold mb-4 tracking-tight font-[var(--font-heading)]">
          {title}
        </h3>
        {description ? (
          <p className="text-slate-300 text-lg leading-relaxed">{description}</p>
        ) : null}
      </div>
      <div className="relative z-10 flex-shrink-0">{action}</div>
    </section>
  );
}
