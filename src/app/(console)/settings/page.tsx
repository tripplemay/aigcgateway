"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
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
      toast.success("Name updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      toast.success("Password changed");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input disabled value={email} className="bg-muted" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <Button onClick={saveName}>Save</Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Current Password</Label>
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </div>
          <div>
            <Label>New Password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button onClick={changePassword}>Change Password</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Low balance email alert</p>
              <p className="text-xs text-muted-foreground">
                Receive email when balance drops below threshold
              </p>
            </div>
            <Switch checked={alertEmail} onCheckedChange={setAlertEmail} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-destructive/50">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Sign Out</p>
            <p className="text-xs text-muted-foreground">Clear session and return to login page</p>
          </div>
          <Button
            variant="destructive"
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("projectId");
              router.push("/login");
            }}
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
