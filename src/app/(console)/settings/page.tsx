"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const ta = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [alertEmail, setAlertEmail] = useState(true);
  const router = useRouter();

  useEffect(() => {
    apiFetch<{ email: string; name: string | null }>("/api/auth/profile")
      .then((u) => {
        setEmail(u.email);
        setName(u.name ?? "");
      })
      .catch(() => {});
  }, []);

  const saveName = async () => {
    try {
      await apiFetch("/api/auth/profile", { method: "PATCH", body: JSON.stringify({ name }) });
      toast.success(t("nameUpdated"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) {
      toast.error(ta("passwordMin"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(ta("passwordMismatch"));
      return;
    }
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      toast.success(t("passwordChanged"));
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t("profile")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("email")}</Label>
            <Input disabled value={email} className="bg-muted" />
          </div>
          <div>
            <Label>{t("name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>
          <Button onClick={saveName}>{tc("save")}</Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t("changePassword")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("currentPassword")}</Label>
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("newPassword")}</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("newPasswordPlaceholder")}
            />
          </div>
          <div>
            <Label>{t("confirmNewPassword")}</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button onClick={changePassword}>{t("changePassword")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("notifications")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("lowBalanceAlert")}</p>
              <p className="text-xs text-muted-foreground">{t("lowBalanceDesc")}</p>
            </div>
            <Switch checked={alertEmail} onCheckedChange={setAlertEmail} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-destructive/50">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("signOut")}</p>
            <p className="text-xs text-muted-foreground">{t("signOutDesc")}</p>
          </div>
          <Button
            variant="destructive"
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("projectId");
              router.push("/login");
            }}
          >
            {t("signOut")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
