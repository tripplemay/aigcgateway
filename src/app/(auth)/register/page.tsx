"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export default function RegisterPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const validate = () => {
    if (!email || !email.includes("@")) return t("validEmail");
    if (password.length < 8) return t("passwordMin");
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return t("passwordFormat");
    if (password !== confirm) return t("passwordMismatch");
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? t("networkError"));
        setLoading(false);
        return;
      }
      toast.success(t("registered"));
      router.push("/login");
    } catch {
      setError(t("networkError"));
    }
    setLoading(false);
  };

  return (
    <>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("signUp")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("signUpSubtitle")}</p>
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
            />
          </div>
          <div>
            <Label>{t("password")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
            />
          </div>
          <div>
            <Label>{t("confirmPassword")}</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div>
            <Label>{t("nameOptional")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
          </div>
          <Button className="w-full" disabled={loading} onClick={submit}>
            {loading ? t("creating") : t("signUp")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("hasAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("signInLink")}
            </Link>
          </p>
        </CardContent>
      </Card>
      <Toaster richColors />
    </>
  );
}
