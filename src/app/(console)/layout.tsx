"use client";
import { Sidebar } from "@/components/sidebar";
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
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const userInfo = { userId: payload.userId, role: payload.role, name: payload.name };
      setUser(userInfo);

      // Non-admin accessing /admin/* → redirect to /dashboard
      if (pathname.startsWith("/admin") && userInfo.role !== "ADMIN") {
        router.push("/dashboard");
        return;
      }

      // Load current project name for sidebar
      apiFetch<{ data: { id: string; name: string }[] }>("/api/projects")
        .then((r) => {
          const saved = localStorage.getItem("projectId");
          const found = r.data.find((p) => p.id === saved) ?? r.data[0];
          if (found) setProjectName(found.name);
        })
        .catch(() => {});
    } catch {
      localStorage.removeItem("token");
      router.push("/login");
    }
    setLoading(false);
  }, [router, pathname]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-page-bg">
        <Sidebar role={user.role} userName={user.name} projectName={projectName} />
        <main className="flex-1 ml-[210px] p-6">{children}</main>
      </div>
      <Toaster richColors />
    </TooltipProvider>
  );
}
