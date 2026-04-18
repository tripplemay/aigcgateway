"use client";

import { useTranslations } from "next-intl";

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <span className="material-symbols-outlined text-5xl text-ds-error" aria-hidden="true">
        error
      </span>
      <h2 className="text-xl font-bold text-ds-on-surface">{t("title")}</h2>
      <p className="text-sm text-ds-on-surface-variant max-w-md text-center">
        {error.message || t("fallbackMessage")}
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 bg-ds-primary text-white rounded-xl font-bold text-sm hover:bg-ds-primary/90 transition-colors"
      >
        {t("retry")}
      </button>
    </div>
  );
}
