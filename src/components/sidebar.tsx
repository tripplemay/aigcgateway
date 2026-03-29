"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Key, Box, FileText, BarChart3, Wallet,
  Zap, BookOpen, Server, Layers, Activity, Users, Settings,
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
    title: "Project",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "API Keys", href: "/keys", icon: Key },
      { label: "Models", href: "/models", icon: Box },
    ],
  },
  {
    title: "Observe",
    items: [
      { label: "Audit Logs", href: "/logs", icon: FileText },
      { label: "Usage", href: "/usage", icon: BarChart3 },
    ],
  },
  {
    title: "Billing",
    items: [{ label: "Balance", href: "/balance", icon: Wallet }],
  },
  {
    title: "Help",
    items: [
      { label: "Quick Start", href: "/quickstart", icon: Zap },
      { label: "API Docs", href: "/docs", icon: BookOpen },
    ],
  },
];

const adminNav: NavGroup[] = [
  {
    title: "Admin",
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
}

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const groups = role === "ADMIN" ? [...devNav, ...adminNav] : devNav;

  return (
    <aside className="w-[210px] h-screen bg-gray-50 border-r flex flex-col fixed left-0 top-0 z-40">
      <div className="p-4 border-b">
        <h1 className="text-lg font-bold text-gray-900">AIGC Gateway</h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {groups.map((group) => (
          <div key={group.title} className="mb-2">
            <p className="px-4 py-1 text-xs font-medium text-gray-400 uppercase">
              {group.title}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t">
        <Link href="/settings" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <Settings className="h-4 w-4" />
          {userName ?? "Settings"}
        </Link>
      </div>
    </aside>
  );
}
