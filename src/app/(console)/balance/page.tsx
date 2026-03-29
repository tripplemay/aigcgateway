"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

interface BalanceInfo {
  balance: number;
  alertThreshold: number | null;
  lastRecharge: { amount: number; createdAt: string } | null;
}
interface TxnRow {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  status: string;
  description: string | null;
  createdAt: string;
}

const AMOUNTS = [10, 50, 100, 500];
const typeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  RECHARGE: "default",
  DEDUCTION: "secondary",
  REFUND: "outline",
  ADJUSTMENT: "outline",
};

export default function BalancePage() {
  const { current, loading: projLoading } = useProject();
  const [info, setInfo] = useState<BalanceInfo | null>(null);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [amount, setAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState("");
  const [payMethod, setPayMethod] = useState("alipay");
  const [threshold, setThreshold] = useState("");

  const load = async () => {
    if (!current) return;
    const [b, t] = await Promise.all([
      apiFetch<BalanceInfo>(`/api/projects/${current.id}/balance`),
      apiFetch<{ data: TxnRow[]; pagination: { total: number } }>(
        `/api/projects/${current.id}/transactions?page=${page}`,
      ),
    ]);
    setInfo(b);
    setTxns(t.data);
    setTotal(t.pagination.total);
    if (b.alertThreshold != null) setThreshold(String(b.alertThreshold));
  };
  useEffect(() => {
    load();
  }, [current, page]);

  const doRecharge = async () => {
    if (!current) return;
    const amt = customAmount ? Number(customAmount) : amount;
    if (amt < 1 || amt > 10000) {
      toast.error("Amount must be $1-$10,000");
      return;
    }
    try {
      const res = await apiFetch<{ paymentUrl?: string }>(`/api/projects/${current.id}/recharge`, {
        method: "POST",
        body: JSON.stringify({ amount: amt, paymentMethod: payMethod }),
      });
      setRechargeOpen(false);
      if (res.paymentUrl) {
        toast.success("Redirecting to payment...");
        window.open(res.paymentUrl, "_blank");
      } else {
        toast.success("Recharge order created");
      }
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;
  if (!info) return null;
  const isLow = info.alertThreshold != null && info.balance <= info.alertThreshold;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Balance</h1>

      <Card className={cn("mb-6", isLow && "border-destructive")}>
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current Balance</p>
            <p className={cn("text-4xl font-bold", isLow && "text-destructive")}>
              {formatCurrency(info.balance, 2)}
            </p>
            {info.lastRecharge && (
              <p className="text-xs text-muted-foreground mt-1">
                Last recharge: {formatCurrency(info.lastRecharge.amount, 2)} ·{" "}
                {timeAgo(info.lastRecharge.createdAt)}
              </p>
            )}
          </div>
          <Button onClick={() => setRechargeOpen(true)}>Recharge</Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-4 flex items-center gap-4">
          <Label className="whitespace-nowrap">Alert Threshold ($)</Label>
          <Input
            type="number"
            className="w-32"
            placeholder="e.g. 5.00"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!current) return;
              await apiFetch(`/api/projects/${current.id}`, {
                method: "PATCH",
                body: JSON.stringify({ alertThreshold: Number(threshold) || null }),
              });
              toast.success("Alert threshold saved");
              load();
            }}
          >
            Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance After</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground" title={t.createdAt}>
                    {timeAgo(t.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={typeVariant[t.type] ?? "secondary"}>{t.type}</Badge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "font-mono",
                      t.amount >= 0 ? "text-green-600" : "text-muted-foreground",
                    )}
                  >
                    {t.amount >= 0 ? "+" : ""}
                    {formatCurrency(t.amount, 6)}
                  </TableCell>
                  <TableCell className="font-mono">{formatCurrency(t.balanceAfter, 2)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.description ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center mt-4">
        <span className="text-sm text-muted-foreground">{total} records</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page * 20 >= total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recharge</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Amount</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {AMOUNTS.map((a) => (
                  <Button
                    key={a}
                    variant={amount === a && !customAmount ? "default" : "outline"}
                    onClick={() => {
                      setAmount(a);
                      setCustomAmount("");
                    }}
                  >
                    ${a}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Custom Amount</Label>
              <Input
                type="number"
                placeholder="$1 - $10,000"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Payment Method</Label>
              <div className="flex gap-2 mt-2">
                {["alipay", "wechat"].map((m) => (
                  <Button
                    key={m}
                    variant={payMethod === m ? "default" : "outline"}
                    onClick={() => setPayMethod(m)}
                  >
                    {m === "alipay" ? "Alipay" : "WeChat Pay"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRechargeOpen(false)}>
                Cancel
              </Button>
              <Button onClick={doRecharge}>Confirm Recharge</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
