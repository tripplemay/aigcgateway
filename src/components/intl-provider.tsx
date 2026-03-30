"use client";
import { NextIntlClientProvider } from "next-intl";
import { LocaleProvider, useLocale } from "@/hooks/use-locale";
import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

const messages = { en, "zh-CN": zhCN };

function IntlInner({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
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
