"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/*
 * Sidebar — strict 1:1 replica of Layout Shell code.html lines 86-142.
 *
 * Substitutions:
 *   - static <a href="#"> → <Link href="..."> with project routes
 *   - hardcoded text → t() i18n calls
 *   - Wallet balance is dynamic-ready (props)
 *   - Admin-only items appended with same styling
 */

// ── Nav items — icons from Layout Shell code.html lines 106-129 ──

interface NavItem {
  labelKey: string;
  href: string;
  icon: string;
}

const mainNav: NavItem[] = [
  { labelKey: "projects", href: "/dashboard", icon: "folder_managed" },
  { labelKey: "apiKeys", href: "/keys", icon: "key" },
  { labelKey: "templates", href: "/templates", icon: "extension" },
  { labelKey: "models", href: "/models", icon: "smart_toy" },
  { labelKey: "logs", href: "/logs", icon: "terminal" },
  { labelKey: "usage", href: "/usage", icon: "bar_chart" },
  { labelKey: "billing", href: "/balance", icon: "payments" },
  { labelKey: "quickStart", href: "/quickstart", icon: "rocket_launch" },
  { labelKey: "mcpSetup", href: "/mcp-setup", icon: "electrical_services" },
];

const adminNav: NavItem[] = [
  { labelKey: "modelsChannels", href: "/admin/models", icon: "hub" },
  { labelKey: "providers", href: "/admin/providers", icon: "settings_input_component" },
  { labelKey: "health", href: "/admin/health", icon: "health_and_safety" },
  { labelKey: "adminLogs", href: "/admin/logs", icon: "receipt_long" },
  { labelKey: "adminUsage", href: "/admin/usage", icon: "monitoring" },
  { labelKey: "users", href: "/admin/users", icon: "group" },
  { labelKey: "adminTemplates", href: "/admin/templates", icon: "folder_copy" },
];

interface SidebarProps {
  role: "ADMIN" | "DEVELOPER";
  userName?: string;
  projectName?: string;
  walletBalance?: string;
}

export function Sidebar({ role, walletBalance }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("sidebar");

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    /* code.html line 86 */
    <aside className="fixed left-0 top-0 h-full w-64 bg-slate-50 dark:bg-slate-900 flex flex-col py-6 z-40">
      {/* Brand — code.html lines 87-97 */}
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-ds-primary to-ds-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-lg">token</span>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tighter text-[#5443b9] dark:text-[#6D5DD3] font-[var(--font-heading)]">
              {t("brand")}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
              {t("algorithmicAtelier")}
            </span>
          </div>
        </div>
      </div>

      {/* New Project CTA — code.html lines 98-103 */}
      <div className="px-4 mb-6">
        <button className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-ds-primary to-ds-primary-container text-white text-sm font-bold font-[var(--font-heading)] flex items-center justify-center gap-2 shadow-lg shadow-ds-primary/20 scale-95 active:scale-100 transition-transform">
          <span className="material-symbols-outlined text-sm">add</span>
          {t("newProject")}
        </button>
      </div>

      {/* Navigation — code.html lines 104-130 */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {mainNav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                /* code.html lines 110-129: inactive state */
                "flex items-center gap-3 px-4 py-2 transition-colors font-[var(--font-heading)] tracking-tight font-bold text-sm",
                active
                  ? /* code.html line 106: active state */
                    "text-[#5443b9] dark:text-[#6D5DD3] border-l-4 border-[#5443b9] bg-[#f2f3ff] dark:bg-slate-800"
                  : "text-slate-500 dark:text-slate-400 hover:bg-[#f2f3ff] dark:hover:bg-slate-800/80",
              )}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              {t(item.labelKey)}
            </Link>
          );
        })}

        {/* Admin items — same styling, conditional */}
        {role === "ADMIN" &&
          adminNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 transition-colors font-[var(--font-heading)] tracking-tight font-bold text-sm",
                  active
                    ? "text-[#5443b9] dark:text-[#6D5DD3] border-l-4 border-[#5443b9] bg-[#f2f3ff] dark:bg-slate-800"
                    : "text-slate-500 dark:text-slate-400 hover:bg-[#f2f3ff] dark:hover:bg-slate-800/80",
                )}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                {t(item.labelKey)}
              </Link>
            );
          })}
      </nav>

      {/* Wallet Balance — code.html lines 131-141 */}
      <div className="px-4 mt-auto pt-6">
        <div className="p-4 rounded-xl bg-ds-surface-container-high flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ds-on-surface-variant">
              {t("walletBalance")}
            </span>
            <span className="text-xs font-black text-ds-primary">{walletBalance ?? "$0.00"}</span>
          </div>
          <div className="w-full bg-ds-outline-variant/30 h-1.5 rounded-full overflow-hidden">
            <div className="bg-ds-primary w-2/3 h-full rounded-full" />
          </div>
        </div>
      </div>
    </aside>
  );
}
