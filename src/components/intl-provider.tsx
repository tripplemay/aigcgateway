"use client";
import { useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { LocaleProvider, useLocale, type Locale } from "@/hooks/use-locale";
import { Skeleton } from "@/components/ui/skeleton";

type Messages = Record<string, unknown>;

function IntlInner({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const [messages, setMessages] = useState<Messages | null>(null);
  const [loadedLocale, setLoadedLocale] = useState<Locale | null>(null);

  useEffect(() => {
    let cancelled = false;
    import(`@/messages/${locale}.json`)
      .then((mod) => {
        if (cancelled) return;
        setMessages(mod.default as Messages);
        setLoadedLocale(locale);
      })
      .catch((err) => {
        console.error("Failed to load locale messages", locale, err);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!messages || loadedLocale !== locale) {
    return (
      <div className="p-6 space-y-4" data-testid="intl-loading">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}

export function IntlProvider({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <IntlInner>{children}</IntlInner>
    </LocaleProvider>
  );
}
