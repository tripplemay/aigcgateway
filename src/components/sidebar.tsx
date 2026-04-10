"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { useProject } from "@/hooks/use-project";

/*
 * Sidebar — strict 1:1 replica of Layout Shell code.html lines 86-142.
 *
 * Substitutions:
 *   - static <a href="#"> → <Link href="..."> with project routes
 *   - hardcoded text → t() i18n calls
 *   - Wallet balance from ProjectProvider
 *   - Admin-only items appended with same styling
 */

// ── Nav items — icons from Layout Shell code.html lines 106-129 ──

interface NavItem {
  labelKey: string;
  href: string;
  icon: string;
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

const mainNavGroups: NavGroup[] = [
  {
    titleKey: "groupCore",
    items: [
      { labelKey: "projects", href: "/dashboard", icon: "folder_managed" },
      { labelKey: "models", href: "/models", icon: "smart_toy" },
      { labelKey: "templates", href: "/templates", icon: "extension" },
      { labelKey: "actions", href: "/actions", icon: "bolt" },
    ],
  },
  {
    titleKey: "groupDev",
    items: [
      { labelKey: "apiKeys", href: "/keys", icon: "key" },
      { labelKey: "quickStart", href: "/quickstart", icon: "rocket_launch" },
      { labelKey: "mcpSetup", href: "/mcp-setup", icon: "electrical_services" },
      { labelKey: "docs", href: "/docs", icon: "menu_book" },
    ],
  },
  {
    titleKey: "groupData",
    items: [
      { labelKey: "logs", href: "/logs", icon: "terminal" },
      { labelKey: "usage", href: "/usage", icon: "bar_chart" },
      { labelKey: "billing", href: "/balance", icon: "payments" },
    ],
  },
];

const adminNavGroups: NavGroup[] = [
  {
    titleKey: "groupModels",
    items: [
      { labelKey: "modelAliases", href: "/admin/model-aliases", icon: "link" },
      { labelKey: "modelsChannels", href: "/admin/models", icon: "hub" },
      { labelKey: "providers", href: "/admin/providers", icon: "settings_input_component" },
    ],
  },
  {
    titleKey: "groupOps",
    items: [
      { labelKey: "health", href: "/admin/health", icon: "health_and_safety" },
      { labelKey: "adminLogs", href: "/admin/logs", icon: "receipt_long" },
      { labelKey: "adminUsage", href: "/admin/usage", icon: "monitoring" },
    ],
  },
  {
    titleKey: "groupUsers",
    items: [
      { labelKey: "users", href: "/admin/users", icon: "group" },
      { labelKey: "adminTemplates", href: "/admin/templates", icon: "folder_copy" },
    ],
  },
];

interface SidebarProps {
  role: "ADMIN" | "DEVELOPER";
  userName?: string;
  email?: string;
}

export function Sidebar({ role, userName, email }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("sidebar");
  const { projects, current, select, refresh } = useProject();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const walletBalance = current ? `$${Number(current.balance).toFixed(2)}` : "$0.00";

  return (
    /* code.html line 86 */
    <aside className="fixed left-0 top-0 h-full w-64 bg-ds-surface-container-low flex flex-col py-6 z-40">
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

      {/* Project Switcher */}
      <div className="px-4 mb-2">
        <div className="relative">
          <button
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-ds-surface-container text-sm font-bold text-ds-on-surface hover:bg-ds-surface-container-high transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-ds-primary text-lg">folder</span>
              <span className="truncate">{current?.name ?? t("noProject")}</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 text-lg shrink-0">
              {projectDropdownOpen ? "expand_less" : "unfold_more"}
            </span>
          </button>
          {projectDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full bg-ds-surface-container-lowest rounded-xl shadow-xl backdrop-blur-lg py-1 max-h-48 overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    select(p.id);
                    setProjectDropdownOpen(false);
                    router.push("/dashboard");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-ds-surface-container-low transition-colors",
                    current?.id === p.id
                      ? "text-ds-primary font-bold bg-ds-surface-container-low"
                      : "text-ds-on-surface-variant",
                  )}
                >
                  <span className="material-symbols-outlined text-lg">
                    {current?.id === p.id ? "folder_open" : "folder"}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Project CTA — code.html lines 98-103 */}
      <div className="px-4 mb-6">
        <CreateProjectDialog
          trigger={
            <button className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-ds-primary to-ds-primary-container text-white text-sm font-bold font-[var(--font-heading)] flex items-center justify-center gap-2 shadow-lg shadow-ds-primary/20 scale-95 active:scale-100 transition-transform">
              <span className="material-symbols-outlined text-sm">add</span>
              {t("newProject")}
            </button>
          }
          onCreated={() => refresh()}
        />
      </div>

      {/* Navigation — grouped layout */}
      <nav className="flex-1 overflow-y-auto px-2">
        {mainNavGroups.map((group, gi) => (
          <div key={group.titleKey} className={cn(gi > 0 && "mt-4")}>
            <p className="px-4 mb-1 text-[10px] font-bold uppercase tracking-widest text-ds-on-surface-variant/60">
              {t(group.titleKey)}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-3 px-4 py-2 rounded-lg transition-colors font-[var(--font-heading)] tracking-tight font-bold text-sm",
                      active
                        ? "text-ds-primary bg-ds-primary/5 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:rounded-full before:bg-ds-primary"
                        : "text-ds-on-surface-variant hover:bg-ds-surface-container-high/50",
                    )}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Settings — standalone, after all user groups */}
        <div className="mt-4">
          <Link
            href="/settings"
            className={cn(
              "relative flex items-center gap-3 px-4 py-2 rounded-lg transition-colors font-[var(--font-heading)] tracking-tight font-bold text-sm",
              isActive("/settings")
                ? "text-ds-primary bg-ds-primary/5 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:rounded-full before:bg-ds-primary"
                : "text-ds-on-surface-variant hover:bg-ds-surface-container-high/50",
            )}
          >
            <span className="material-symbols-outlined">settings</span>
            {t("settings")}
          </Link>
        </div>

        {/* Admin groups — conditional */}
        {role === "ADMIN" && (
          <>
            <div className="my-4 mx-4 h-px bg-ds-outline-variant/20" />
            {adminNavGroups.map((group, gi) => (
              <div key={group.titleKey} className={cn(gi > 0 && "mt-4")}>
                <p className="px-4 mb-1 text-[10px] font-bold uppercase tracking-widest text-ds-on-surface-variant/60">
                  {t(group.titleKey)}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "relative flex items-center gap-3 px-4 py-2 rounded-lg transition-colors font-[var(--font-heading)] tracking-tight font-bold text-sm",
                          active
                            ? "text-ds-primary bg-ds-primary/5 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:rounded-full before:bg-ds-primary"
                            : "text-ds-on-surface-variant hover:bg-ds-surface-container-high/50",
                        )}
                      >
                        <span className="material-symbols-outlined">{item.icon}</span>
                        {t(item.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </nav>

      {/* User Info */}
      <div className="px-4 mt-auto pt-4">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#f2f3ff] dark:hover:bg-slate-800 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-ds-primary/10 flex items-center justify-center text-ds-primary shrink-0">
            <span className="material-symbols-outlined text-lg">person</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ds-on-surface truncate">
              {userName || email?.split("@")[0] || "User"}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ds-on-surface-variant">
              {role === "ADMIN" ? (
                <span className="text-ds-primary">{t("admin")}</span>
              ) : (
                <span>{t("developer")}</span>
              )}
            </p>
          </div>
        </Link>
      </div>

      {/* Wallet Balance — code.html lines 131-141 */}
      <div className="px-4 pt-2">
        <div className="p-4 rounded-xl bg-ds-surface-container-high flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ds-on-surface-variant">
              {t("walletBalance")}
            </span>
            <span className="text-xs font-black text-ds-primary">{walletBalance}</span>
          </div>
          <div className="w-full bg-ds-outline-variant/30 h-1.5 rounded-full overflow-hidden">
            <div className="bg-ds-primary w-2/3 h-full rounded-full" />
          </div>
        </div>
      </div>
    </aside>
  );
}
