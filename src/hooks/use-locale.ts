"use client";
import { useState, useEffect, useCallback } from "react";

export type Locale = "en" | "zh-CN";

const STORAGE_KEY = "aigc-locale";

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "zh-CN") return saved;
  const browserLang = navigator.language;
  return browserLang.startsWith("zh") ? "zh-CN" : "en";
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "zh-CN" : "en");
  }, [locale, setLocale]);

  return { locale, setLocale, toggleLocale };
}
