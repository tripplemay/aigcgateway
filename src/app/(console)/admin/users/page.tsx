"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, timeAgo } from "@/lib/utils";
import Link from "next/link";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  projectCount: number;
  totalBalance: number;
  totalCalls: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const t = useTranslations("adminUsers");
  const tc = useTranslations("common");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: UserRow[] }>("/api/admin/users").then((r) => {
      setUsers(r.data);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc("name")}</TableHead>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("projects")}</TableHead>
                <TableHead>{t("balance")}</TableHead>
                <TableHead>{t("calls")}</TableHead>
                <TableHead>{t("registered")}</TableHead>
                <TableHead>{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {tc("loading")}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.projectCount}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(u.totalBalance, 2)}</TableCell>
                    <TableCell>{u.totalCalls.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground" title={u.createdAt}>
                      {timeAgo(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/users/${u.id}`}>
                        <Button variant="ghost" size="sm">
                          {t("detail")}
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
