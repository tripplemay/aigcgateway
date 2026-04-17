"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.replace("/landing.html");
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      // JWT 过期检查（exp 是秒级时间戳）
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem("token");
        document.cookie = "token=; path=/; max-age=0";
        window.location.replace("/landing.html");
        return;
      }
      router.replace("/dashboard");
    } catch {
      localStorage.removeItem("token");
      document.cookie = "token=; path=/; max-age=0";
      window.location.replace("/landing.html");
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}
