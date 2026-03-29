"use client";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface UserInfo {
  userId: string;
  role: "ADMIN" | "DEVELOPER";
  name?: string;
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUser({ userId: payload.userId, role: payload.role, name: payload.name });
    } catch { localStorage.removeItem("token"); router.push("/login"); }
    setLoading(false);
  }, [router]);

  if (loading || !user) {
    return <div className="flex items-center justify-center h-screen"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen">
        <Sidebar role={user.role} userName={user.name} />
        <main className="flex-1 ml-[210px] p-6">{children}</main>
      </div>
      <Toaster richColors />
    </TooltipProvider>
  );
}
