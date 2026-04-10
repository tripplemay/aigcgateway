"use client";
import { Sidebar } from "@/components/sidebar";
import { TopAppBar } from "@/components/top-app-bar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { ProjectProvider } from "@/hooks/use-project";

interface UserInfo {
  userId: string;
  role: "ADMIN" | "DEVELOPER";
  name?: string;
  email?: string;
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    apiFetch<{ id: string; email: string; role: "ADMIN" | "DEVELOPER"; name?: string }>(
      "/api/auth/profile",
    )
      .then((profile) => {
        const userInfo: UserInfo = {
          userId: profile.id,
          role: profile.role,
          name: profile.name,
          email: profile.email,
        };
        setUser(userInfo);

        if (pathname.startsWith("/admin") && userInfo.role !== "ADMIN") {
          router.push("/dashboard");
          return;
        }
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
        <div className="animate-pulse text-ds-on-surface-variant" suppressHydrationWarning>
          Loading…
        </div>
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
      <ProjectProvider>
        <div className="bg-ds-surface text-ds-on-surface antialiased overflow-hidden">
          <Sidebar role={user.role} userName={user.name} email={user.email} />
          {/* code.html line 144 */}
          <div className="ml-64 flex flex-col h-screen relative z-[41]">
            {/* code.html line 146 */}
            <TopAppBar userName={user.name} userEmail={user.email} />
            {/* code.html line 184 */}
            <main className="flex-1 overflow-y-auto bg-ds-surface p-8">{children}</main>
          </div>
        </div>
        <Toaster richColors />
      </ProjectProvider>
    </TooltipProvider>
  );
}
