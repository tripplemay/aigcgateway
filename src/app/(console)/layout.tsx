"use client";
import { Sidebar } from "@/components/sidebar";
import { TopAppBar } from "@/components/top-app-bar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

interface UserInfo {
  userId: string;
  role: "ADMIN" | "DEVELOPER";
  name?: string;
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);
  const [walletBalance, setWalletBalance] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    // Fetch user profile from API (server-verified JWT)
    apiFetch<{ id: string; role: "ADMIN" | "DEVELOPER"; name?: string }>("/api/auth/profile")
      .then((profile) => {
        const userInfo: UserInfo = { userId: profile.id, role: profile.role, name: profile.name };
        setUser(userInfo);

        // Non-admin accessing /admin/* → redirect to /dashboard
        if (pathname.startsWith("/admin") && userInfo.role !== "ADMIN") {
          router.push("/dashboard");
          return;
        }

        // Load current project name + balance for sidebar
        apiFetch<{ data: { id: string; name: string }[] }>("/api/projects")
          .then((r) => {
            const saved = localStorage.getItem("projectId");
            const found = r.data.find((p) => p.id === saved) ?? r.data[0];
            if (found) {
              setProjectName(found.name);
              apiFetch<{ balance: number }>(`/api/projects/${found.id}/balance`)
                .then((b) => setWalletBalance(`$${Number(b.balance).toFixed(2)}`))
                .catch(() => {});
            }
          })
          .catch(() => {});
      })
      .catch(() => {
        localStorage.removeItem("token");
        document.cookie = "token=; path=/; max-age=0";
        router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [router, pathname]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  /*
   * Layout structure — strict replica of Layout Shell code.html:
   *   line  84: <body class="bg-surface text-on-surface antialiased overflow-hidden">
   *   line  86: <aside ...> (Sidebar)
   *   line 144: <div class="ml-64 flex flex-col h-screen">
   *   line 146:   <header ...> (TopAppBar)
   *   line 184:   <main class="flex-1 overflow-y-auto bg-surface p-8">
   */
  return (
    <TooltipProvider>
      <div className="bg-ds-surface text-ds-on-surface antialiased overflow-hidden">
        <Sidebar
          role={user.role}
          userName={user.name}
          projectName={projectName}
          walletBalance={walletBalance}
        />
        {/* code.html line 144 */}
        <div className="ml-64 flex flex-col h-screen">
          {/* code.html line 146 */}
          <TopAppBar userName={user.name} />
          {/* code.html line 184 */}
          <main className="flex-1 overflow-y-auto bg-ds-surface p-8">{children}</main>
        </div>
      </div>
      <Toaster richColors />
    </TooltipProvider>
  );
}
