"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
  Layers,
  Activity,
  Users,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const devNav: NavGroup[] = [
  {
    title: "project",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "API keys", href: "/keys", icon: Key },
      { label: "Models", href: "/models", icon: Box },
    ],
  },
  {
    title: "observe",
    items: [
      { label: "Audit logs", href: "/logs", icon: FileText },
      { label: "Usage", href: "/usage", icon: BarChart3 },
    ],
  },
  {
    title: "billing",
    items: [{ label: "Balance", href: "/balance", icon: Wallet }],
  },
  {
    title: "help",
    items: [
      { label: "Quick start", href: "/quickstart", icon: Zap },
      { label: "API docs", href: "/docs", icon: BookOpen },
    ],
  },
];

const adminNav: NavGroup[] = [
  {
    title: "admin",
    adminOnly: true,
    items: [
      { label: "Providers", href: "/admin/providers", icon: Server },
      { label: "Models", href: "/admin/models", icon: Box },
      { label: "Channels", href: "/admin/channels", icon: Layers },
      { label: "Health", href: "/admin/health", icon: Activity },
      { label: "Audit Logs", href: "/admin/logs", icon: FileText },
      { label: "Usage", href: "/admin/usage", icon: BarChart3 },
      { label: "Users", href: "/admin/users", icon: Users },
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
  const groups = role === "ADMIN" ? [...devNav, ...adminNav] : devNav;
  const initials = (userName ?? "U").slice(0, 2).toUpperCase();

  return (
    <aside className="w-[210px] h-screen bg-white border-r border-border-custom flex flex-col fixed left-0 top-0 z-40">
      {/* Logo — 原型: .logo + .logo-icon */}
      <div className="flex items-center gap-2 px-4 pb-[14px] pt-4 border-b border-border-custom mb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-brand text-[14px] font-bold text-white">
          G
        </div>
        <span className="text-[15px] font-semibold text-text-primary">AIGC Gateway</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-4 pt-3 pb-1 text-[11px] text-text-hint tracking-[0.5px] lowercase">
              {group.title}
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
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer — 原型: .side-foot + .avatar */}
      <Link
        href="/settings"
        className="mt-auto flex items-center gap-2 border-t border-border-custom px-4 py-3 transition-colors hover:bg-surface cursor-pointer"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info-bg text-[11px] font-semibold text-chart-blue">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text-primary">{userName ?? "User"}</p>
          {projectName && <p className="truncate text-[11px] text-text-hint">{projectName}</p>}
        </div>
      </Link>
    </aside>
  );
}
