"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useLocale } from "@/hooks/use-locale";
import {
  LayoutDashboard,
  Key,
  Box,
  FileText,
  BarChart3,
  Wallet,
  Zap,
  BookOpen,
  Server,
  Activity,
  Users,
  Globe,
  Plug,
} from "lucide-react";

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const devNav: NavGroup[] = [
  {
    titleKey: "project",
    items: [
      { labelKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      { labelKey: "apiKeys", href: "/keys", icon: Key },
      { labelKey: "models", href: "/models", icon: Box },
    ],
  },
  {
    titleKey: "observe",
    items: [
      { labelKey: "auditLogs", href: "/logs", icon: FileText },
      { labelKey: "usage", href: "/usage", icon: BarChart3 },
    ],
  },
  {
    titleKey: "billing",
    items: [{ labelKey: "balance", href: "/balance", icon: Wallet }],
  },
  {
    titleKey: "help",
    items: [
      { labelKey: "quickStart", href: "/quickstart", icon: Zap },
      { labelKey: "apiDocs", href: "/docs", icon: BookOpen },
      { labelKey: "mcpSetup", href: "/mcp-setup", icon: Plug },
    ],
  },
];

const adminNav: NavGroup[] = [
  {
    titleKey: "admin",
    adminOnly: true,
    items: [
      { labelKey: "providers", href: "/admin/providers", icon: Server },
      { labelKey: "modelsChannels", href: "/admin/models", icon: Box },
      { labelKey: "health", href: "/admin/health", icon: Activity },
      { labelKey: "auditLogs", href: "/admin/logs", icon: FileText },
      { labelKey: "usage", href: "/admin/usage", icon: BarChart3 },
      { labelKey: "users", href: "/admin/users", icon: Users },
    ],
  },
];

interface SidebarProps {
  role: "ADMIN" | "DEVELOPER";
  userName?: string;
  projectName?: string;
}

export function Sidebar({ role, userName, projectName }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const { toggleLocale } = useLocale();
  const groups = role === "ADMIN" ? [...devNav, ...adminNav] : devNav;
  const initials = (userName ?? "U").slice(0, 2).toUpperCase();

  return (
    <aside className="w-[210px] h-screen bg-white border-r border-border-custom flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 pb-[14px] pt-4 border-b border-border-custom mb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-brand text-[14px] font-bold text-white">
          G
        </div>
        <span className="text-[15px] font-semibold text-text-primary">{t("brand")}</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.titleKey}>
            <p className="px-4 pt-3 pb-1 text-[11px] text-text-hint tracking-[0.5px] lowercase">
              {t(group.titleKey)}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-[9px] py-2 px-4 text-[13px] border-l-[3px] transition-all duration-150",
                    active
                      ? "border-l-brand bg-page-bg text-text-primary font-medium"
                      : "border-l-transparent text-text-hint hover:bg-surface hover:text-text-secondary",
                  )}
                >
                  <item.icon
                    className={cn("h-4 w-4 shrink-0", active ? "opacity-75" : "opacity-45")}
                  />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border-custom">
        {/* Language toggle */}
        <button
          onClick={toggleLocale}
          className="flex w-full items-center gap-2 px-4 py-2 text-[11px] text-text-hint hover:bg-surface transition-colors"
        >
          <Globe className="h-3.5 w-3.5 opacity-45" />
          {t("language")}
        </button>
        {/* User */}
        <Link
          href="/settings"
          className="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-surface cursor-pointer"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info-bg text-[11px] font-semibold text-chart-blue">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-text-primary">
              {userName ?? t("user")}
            </p>
            {projectName && <p className="truncate text-[11px] text-text-hint">{projectName}</p>}
          </div>
        </Link>
      </div>
    </aside>
  );
}
