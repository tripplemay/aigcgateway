"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const submit = async () => {
    if (!email || !password) { setError("Email and password are required"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Login failed"); setLoading(false); return; }
      localStorage.setItem("token", data.token);
      router.push("/dashboard");
    } catch { setError("Network error"); }
    setLoading(false);
  };

  return (
    <>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <p className="text-sm text-muted-foreground">AIGC Gateway Console</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</div>}
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
          <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
          <Button className="w-full" disabled={loading} onClick={submit}>{loading ? "Signing in..." : "Sign In"}</Button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account? <Link href="/register" className="text-primary hover:underline">Sign up</Link>
          </p>
        </CardContent>
      </Card>
      <Toaster richColors />
    </>
  );
}
