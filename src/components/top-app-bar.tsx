"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "@/hooks/use-locale";
import { NotificationCenter } from "./notification-center";

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

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // best-effort; proceed with client-side cleanup even if network fails
    }
    localStorage.removeItem("token");
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-ds-surface-container-lowest/80 backdrop-blur-xl flex justify-between items-center h-16 px-8 shadow-sm">
      {/* Left: spacer */}
      <div className="flex-1" />

      {/* Right: Controls */}
      <div className="flex items-center gap-4">
        {/* Language Switcher */}
        <div className="flex items-center gap-2 bg-ds-surface-container-low p-1 rounded-lg">
          <button
            onClick={() => locale !== "en" && toggleLocale()}
            className={`px-2 py-1 text-[10px] font-black rounded-md transition-colors ${
              locale === "en"
                ? "bg-ds-surface-container-lowest shadow-sm text-ds-primary"
                : "text-ds-outline"
            }`}
          >
            EN
          </button>
          <button
            onClick={() => locale !== "zh-CN" && toggleLocale()}
            className={`px-2 py-1 text-[10px] font-bold transition-colors ${
              locale === "zh-CN"
                ? "bg-ds-surface-container-lowest shadow-sm text-ds-primary"
                : "text-ds-outline"
            }`}
          >
            CN
          </button>
        </div>

        {/* Notifications */}
        <NotificationCenter />

        {/* Divider */}
        <div className="h-8 w-px bg-ds-outline-variant/50 mx-2" />

        {/* User Avatar + Dropdown */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-ds-primary-container flex items-center justify-center text-ds-on-primary text-xs font-bold ring-2 ring-ds-primary/20 group-hover:ring-ds-primary/50 transition-all">
              {initials}
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-12 w-56 bg-ds-surface-container-lowest rounded-xl shadow-lg border border-ds-outline-variant/20 py-2 z-50">
              {/* User info */}
              <div className="px-4 py-3 border-b border-ds-outline-variant/10">
                {userName && (
                  <p className="text-sm font-semibold text-ds-on-surface truncate">{userName}</p>
                )}
                {userEmail && <p className="text-xs text-ds-outline truncate">{userEmail}</p>}
              </div>
              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-ds-on-surface hover:bg-ds-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-lg text-ds-outline">
                    settings
                  </span>
                  {t("settings")}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-ds-error hover:bg-ds-error-container transition-colors w-full text-left"
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
