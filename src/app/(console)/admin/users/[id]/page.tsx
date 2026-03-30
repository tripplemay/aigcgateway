"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface UserDetail {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  projects: Array<{
    id: string;
    name: string;
    balance: number;
    callCount: number;
    keyCount: number;
  }>;
}

export default function UserDetailPage() {
  const t = useTranslations("adminUsers");
  const tc = useTranslations("common");
  const params = useParams();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeProjectId, setRechargeProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const load = async () => {
    const r = await apiFetch<UserDetail>(`/api/admin/users/${params.id}`);
    setUser(r);
  };
  useEffect(() => {
    load();
  }, [params.id]);

  const doRecharge = async () => {
    try {
      await apiFetch(`/api/admin/users/${params.id}/projects/${rechargeProjectId}/recharge`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), description }),
      });
      toast.success(t("manualRecharge"));
      setRechargeOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!user) return <div className="text-muted-foreground">{tc("loading")}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        {t("developer")} {user.name ?? user.email}
      </h1>

      <Card className="mb-6">
        <CardContent className="p-4 grid grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t("email")}:</span> {user.email}
          </div>
          <div>
            <span className="text-muted-foreground">{t("role")}</span> {user.role}
          </div>
          <div>
            <span className="text-muted-foreground">{t("projects")}:</span> {user.projects.length}
          </div>
          <div>
            <span className="text-muted-foreground">{t("registered")}:</span>{" "}
            {new Date(user.createdAt).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Projects</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc("name")}</TableHead>
                <TableHead>{t("balance")}</TableHead>
                <TableHead>{t("calls")}</TableHead>
                <TableHead>Keys</TableHead>
                <TableHead>{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(p.balance, 2)}</TableCell>
                  <TableCell>{p.callCount.toLocaleString()}</TableCell>
                  <TableCell>{p.keyCount}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRechargeProjectId(p.id);
                        setAmount("");
                        setDescription("");
                        setRechargeOpen(true);
                      }}
                    >
                      {t("manualRecharge")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("manualRecharge")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("amountUsd")}</Label>
              <Input
                type="number"
                placeholder="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("reason")}</Label>
              <Textarea
                placeholder={t("reason")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRechargeOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button onClick={doRecharge}>{tc("confirm")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
