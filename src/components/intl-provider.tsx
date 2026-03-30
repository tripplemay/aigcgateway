"use client";
import { NextIntlClientProvider } from "next-intl";
import { useLocale } from "@/hooks/use-locale";
import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

const messages = { en, "zh-CN": zhCN };

interface IntlProviderProps {
  children: React.ReactNode;
}

export function IntlProvider({ children }: IntlProviderProps) {
  const { locale } = useLocale();
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}
