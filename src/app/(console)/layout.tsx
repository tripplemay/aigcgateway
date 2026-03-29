"use client";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface UserInfo {
  userId: string;
  role: "ADMIN" | "DEVELOPER";
  name?: string;
}

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      // Decode JWT payload (no verification on client side)
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUser({
        userId: payload.userId,
        role: payload.role,
        name: payload.name,
      });
    } catch {
      localStorage.removeItem("token");
      router.push("/login");
    }
    setLoading(false);
  }, [router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar role={user.role} userName={user.name} />
        <main className="flex-1 ml-[210px] p-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
