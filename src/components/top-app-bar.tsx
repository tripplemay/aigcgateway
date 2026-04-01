"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLocale } from "@/hooks/use-locale";
import "material-symbols/outlined.css";

/*
 * TopAppBar — strict 1:1 replica of Layout Shell code.html lines 146-182.
 *
 * Substitutions:
 *   - static text → t() i18n calls
 *   - EN/CN buttons → toggleLocale hook
 *   - <img> avatar → initials fallback
 *   - Deploy button → placeholder (no action yet)
 */

interface TopAppBarProps {
  userName?: string;
}

export function TopAppBar({ userName }: TopAppBarProps) {
  const t = useTranslations("topBar");
  const { locale, toggleLocale } = useLocale();
  const initials = (userName ?? "U").slice(0, 2).toUpperCase();

  return (
    /* code.html line 146 */
    <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/15 dark:border-slate-800/15 flex justify-between items-center h-16 px-8 shadow-sm dark:shadow-none">
      {/* Left: Search + Nav Links — code.html lines 147-156 */}
      <div className="flex items-center gap-6 flex-1">
        {/* Search — code.html lines 148-151 */}
        <div className="relative w-full max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
            search
          </span>
          <input
            className="w-full bg-ds-surface-container-low border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-ds-primary/20 placeholder:text-slate-400 outline-none"
            placeholder={t("searchPlaceholder")}
            type="text"
          />
        </div>
        {/* Nav Links — code.html lines 152-156 */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/docs"
            className="text-slate-600 dark:text-slate-400 hover:text-[#5443b9] transition-all font-[var(--font-heading)] text-sm font-medium"
          >
            {t("documentation")}
          </Link>
          <Link
            href="/docs"
            className="text-slate-600 dark:text-slate-400 hover:text-[#5443b9] transition-all font-[var(--font-heading)] text-sm font-medium"
          >
            {t("apiReference")}
          </Link>
          <Link
            href="/docs"
            className="text-slate-600 dark:text-slate-400 hover:text-[#5443b9] transition-all font-[var(--font-heading)] text-sm font-medium"
          >
            {t("support")}
          </Link>
        </nav>
      </div>

      {/* Right: Controls — code.html lines 158-181 */}
      <div className="flex items-center gap-4">
        {/* Language Switcher — code.html lines 159-162 */}
        <div className="flex items-center gap-2 bg-ds-surface-container-low p-1 rounded-lg">
          <button
            onClick={() => locale !== "en" && toggleLocale()}
            className={`px-2 py-1 text-[10px] font-black rounded-md transition-colors ${
              locale === "en"
                ? "bg-white shadow-sm text-ds-primary"
                : "text-slate-400"
            }`}
          >
            EN
          </button>
          <button
            onClick={() => locale !== "zh-CN" && toggleLocale()}
            className={`px-2 py-1 text-[10px] font-bold transition-colors ${
              locale === "zh-CN"
                ? "bg-white shadow-sm text-ds-primary"
                : "text-slate-400"
            }`}
          >
            CN
          </button>
        </div>

        {/* Tool Buttons — code.html lines 163-173 */}
        <div className="flex items-center gap-2">
          <button className="p-2 text-slate-500 hover:bg-ds-surface-container-high rounded-full transition-colors opacity-80 hover:opacity-100">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button className="p-2 text-slate-500 hover:bg-ds-surface-container-high rounded-full transition-colors opacity-80 hover:opacity-100">
            <span className="material-symbols-outlined">dark_mode</span>
          </button>
          <button className="p-2 text-slate-500 hover:bg-ds-surface-container-high rounded-full transition-colors opacity-80 hover:opacity-100">
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>

        {/* Divider — code.html line 174 */}
        <div className="h-8 w-px bg-slate-200/50 mx-2" />

        {/* Deploy Button — code.html lines 175-177 */}
        <button className="px-4 py-1.5 bg-ds-primary text-white rounded-lg text-sm font-bold font-[var(--font-heading)] hover:bg-ds-primary-container transition-all">
          {t("deploy")}
        </button>

        {/* User Avatar — code.html lines 178-180 */}
        <div className="flex items-center gap-3 ml-2 cursor-pointer group">
          <div className="w-8 h-8 rounded-full bg-ds-primary-container flex items-center justify-center text-white text-xs font-bold ring-2 ring-ds-primary/20 group-hover:ring-ds-primary/50 transition-all">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
