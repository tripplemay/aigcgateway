"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";

export default function LoginPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const submit = async () => {
    if (!email || !password) {
      setError(t("emailRequired"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? t("loginFailed"));
        setLoading(false);
        return;
      }
      localStorage.setItem("token", data.token);
      router.push("/dashboard");
    } catch {
      setError(t("networkError"));
    }
    setLoading(false);
  };

  return (
    <>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("signIn")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</div>
          )}
          <div>
            <Label>{t("email")}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <Label>{t("password")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <Button className="w-full" disabled={loading} onClick={submit}>
            {loading ? t("signingIn") : t("signIn")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("noAccount")}{" "}
            <Link href="/register" className="text-primary hover:underline">
              {t("signUpLink")}
            </Link>
          </p>
        </CardContent>
      </Card>
      <Toaster richColors />
    </>
  );
}
