"use client";
import { Sidebar } from "@/components/sidebar";
import { TopAppBar } from "@/components/top-app-bar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ProjectProvider } from "@/hooks/use-project";

export interface ConsoleUser {
  userId: string;
  role: "ADMIN" | "DEVELOPER";
  name?: string;
  email?: string;
}

export function ConsoleClientShell({
  user,
  children,
}: {
  user: ConsoleUser;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/admin") && user.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [pathname, router, user.role]);

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
