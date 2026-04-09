"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "@/hooks/use-locale";

/*
 * TopAppBar — based on Layout Shell code.html lines 146-182.
 *
 * M1c cleanup:
 *   - Removed: search bar, Deploy button, settings button, dark mode button
 *   - Kept: nav links, language switcher, notifications (placeholder), avatar
 *   - Added: user avatar dropdown menu (Settings + Sign Out)
 */

interface TopAppBarProps {
  userName?: string;
  userEmail?: string;
}

export function TopAppBar({ userName, userEmail }: TopAppBarProps) {
  const t = useTranslations("topBar");
  const { locale, toggleLocale } = useLocale();
  const router = useRouter();
  const initials = (userName ?? "U").slice(0, 2).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleSignOut = () => {
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; max-age=0";
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl flex justify-between items-center h-16 px-8 shadow-sm dark:shadow-none">
      {/* Left: Nav Links */}
      <div className="flex items-center gap-6 flex-1">
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

      {/* Right: Controls */}
      <div className="flex items-center gap-4">
        {/* Language Switcher */}
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

        {/* Notifications (placeholder) */}
        <button className="p-2 text-slate-500 hover:bg-ds-surface-container-high rounded-full transition-colors opacity-80 hover:opacity-100">
          <span className="material-symbols-outlined">notifications</span>
        </button>

        {/* Divider */}
        <div className="h-8 w-px bg-slate-200/50 mx-2" />

        {/* User Avatar + Dropdown */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-ds-primary-container flex items-center justify-center text-white text-xs font-bold ring-2 ring-ds-primary/20 group-hover:ring-ds-primary/50 transition-all">
              {initials}
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-lg border border-ds-outline-variant/20 py-2 z-50">
              {/* User info */}
              <div className="px-4 py-3 border-b border-ds-outline-variant/10">
                {userName && (
                  <p className="text-sm font-semibold text-ds-on-surface truncate">{userName}</p>
                )}
                {userEmail && (
                  <p className="text-xs text-ds-outline truncate">{userEmail}</p>
                )}
              </div>
              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-ds-on-surface hover:bg-ds-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-lg text-ds-outline">settings</span>
                  {t("settings")}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                >
                  <span className="material-symbols-outlined text-lg">logout</span>
                  {t("signOut")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
